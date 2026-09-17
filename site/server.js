// PerpArc site: static file server + automated pairing endpoint.
//
// "Automated" means the deposit address is generated synchronously, on
// request, with no human in the loop -- but the address still has to come
// from a server-held derivation secret, never the browser (see README.md
// "Custody model"). This mirrors Longshot's exact pattern
// (keccak256(secret || pool) -> privateKeyToAccount) with the paired
// token's own address standing in for "pool", since PerpArc doesn't deploy
// a contract per pairing under this model.

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, defineChain, encodePacked, isAddress, keccak256, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8090;
const SECRET_FILE = path.join(__dirname, ".dev-secret");
const PAIRINGS_FILE = path.join(__dirname, "data", "pairings.json");
const MAX_LEVERAGE = 50;

// --- Arc RPC (for looking up a token's own name/symbol/decimals) --------
//
// rpc.arc-scan.org is a third-party public endpoint, not Circle's own --
// Circle's rpc.mainnet.arc.io is IP-allowlisted as of 2026-09-17 (confirmed
// live against both). Override via ARC_RPC_URL for a dedicated/allowlisted
// endpoint once one is available.
const ARC_RPC_URL = process.env.ARC_RPC_URL || "https://rpc.arc-scan.org";
const arcChain = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [ARC_RPC_URL] } },
});
const arcClient = createPublicClient({ chain: arcChain, transport: http(ARC_RPC_URL) });

const erc20Abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];

/** Best-effort ERC20 metadata lookup -- a token missing one field (rare but
 * not disallowed by the standard) shouldn't fail the whole lookup. */
async function lookupToken(address) {
  const call = (functionName) =>
    arcClient.readContract({ address, abi: erc20Abi, functionName }).catch(() => null);
  const [name, symbol, rawDecimals] = await Promise.all([call("name"), call("symbol"), call("decimals")]);
  if (name === null && symbol === null && rawDecimals === null) return null; // not a contract, or not ERC20
  // viem decodes every uintN/intN as bigint regardless of width, including
  // uint8 -- JSON.stringify can't serialize that, so normalize here.
  const decimals = rawDecimals === null ? null : Number(rawDecimals);
  return { name, symbol, decimals };
}

// --- Derivation secret --------------------------------------------------
//
// PAIRING_DERIVATION_SECRET should be set from a real secrets manager in
// any deployment that matters. Absent that, a secret is generated once and
// persisted to .dev-secret (gitignored) so addresses stay stable across
// restarts -- losing this file invalidates every address already handed
// out, exactly like losing HYPERLIQUID_DERIVATION_SECRET would in the
// keeper.
function loadOrCreateSecret() {
  if (process.env.PAIRING_DERIVATION_SECRET) {
    return process.env.PAIRING_DERIVATION_SECRET;
  }
  if (existsSync(SECRET_FILE)) {
    return readFileSync(SECRET_FILE, "utf8").trim();
  }
  const secret = `0x${randomBytes(32).toString("hex")}`;
  writeFile(SECRET_FILE, secret, { mode: 0o600 }).catch((err) =>
    console.error("[perparc-site] failed to persist dev secret", err)
  );
  console.warn(
    "[perparc-site] no PAIRING_DERIVATION_SECRET set -- generated a local dev-only secret at " +
      SECRET_FILE +
      ". This is NOT suitable for any real deployment; see README.md \"Custody model\"."
  );
  return secret;
}

const DERIVATION_SECRET = loadOrCreateSecret();

function deriveDepositAddress(tokenAddress) {
  const privateKey = keccak256(
    encodePacked(["bytes32", "address"], [DERIVATION_SECRET, tokenAddress])
  );
  return privateKeyToAccount(privateKey).address;
}

// --- Pairing persistence -------------------------------------------------

async function loadPairings() {
  try {
    return JSON.parse(await readFile(PAIRINGS_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function savePairings(pairings) {
  await mkdir(path.dirname(PAIRINGS_FILE), { recursive: true });
  await writeFile(PAIRINGS_FILE, `${JSON.stringify(pairings, null, 2)}\n`, "utf8");
}

// --- Validation -----------------------------------------------------------

function validatePairingRequest(body) {
  const errors = [];
  if (!isAddress(body.tokenAddress ?? "")) errors.push("tokenAddress must be a valid Arc contract address");
  if (typeof body.tokenSymbol !== "string" || !body.tokenSymbol.trim()) errors.push("tokenSymbol is required");
  if (typeof body.asset !== "string" || !body.asset.trim()) errors.push("asset is required");
  if (body.direction !== "long" && body.direction !== "short") errors.push('direction must be "long" or "short"');
  const leverage = Number(body.leverage);
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > MAX_LEVERAGE) {
    errors.push(`leverage must be a whole number between 1 and ${MAX_LEVERAGE}`);
  }
  if (body.contact !== undefined && typeof body.contact !== "string") errors.push("contact must be a string");
  return errors;
}

// --- HTTP handlers ---------------------------------------------------------

async function handlePair(req, res) {
  let raw = "";
  for await (const chunk of req) raw += chunk;

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ errors: ["Request body must be valid JSON"] }));
    return;
  }

  const errors = validatePairingRequest(body);
  if (errors.length > 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ errors }));
    return;
  }

  const tokenAddress = body.tokenAddress.toLowerCase();
  const depositAddress = deriveDepositAddress(tokenAddress);

  const pairings = await loadPairings();
  const alreadyPaired = Boolean(pairings[tokenAddress]);
  const record = {
    tokenAddress,
    tokenSymbol: body.tokenSymbol.trim(),
    asset: body.asset.trim().toUpperCase(),
    isLong: body.direction === "long",
    leverage: Number(body.leverage),
    contact: (body.contact ?? "").trim(),
    depositAddress,
    createdAt: pairings[tokenAddress]?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  pairings[tokenAddress] = record;
  await savePairings(pairings);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ depositAddress, alreadyPaired, pairing: record }));
}

async function handleTokenLookup(req, res) {
  const url = new URL(req.url, "http://localhost");
  const address = (url.searchParams.get("address") || "").trim();

  if (!isAddress(address)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ found: false, error: "Not a valid address" }));
    return;
  }

  const token = await lookupToken(address);
  if (!token) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ found: false }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ found: true, address, ...token }));
}

async function handleListPairings(res) {
  const pairings = await loadPairings();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(Object.values(pairings)));
}

// Static files: an explicit allowlist of PATHS, not just extensions --
// found live 2026-09-17: an extension-only allowlist (".js" etc) also
// happily served this very file, /server.js, since it has a "safe"
// extension despite being server-internal. A file being public has to be
// an explicit choice per-path, not a side effect of what it's named.
const STATIC_FILES = new Set(["/index.html", "/pair.html", "/explore.html", "/style.css", "/landing.css", "/transitions.js"]);

async function handleStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const relative = urlPath === "/" ? "/index.html" : urlPath;

  if (!STATIC_FILES.has(relative)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const resolved = path.normalize(path.join(__dirname, relative));
  const withinSite = resolved.startsWith(__dirname + path.sep);
  const ext = path.extname(resolved);
  if (!withinSite) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  try {
    const content = await readFile(resolved);
    res.writeHead(200, { "Content-Type": contentType(ext) });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function contentType(ext) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".ico": "image/x-icon",
    }[ext] ?? "application/octet-stream"
  );
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/pair") {
    handlePair(req, res).catch((err) => {
      console.error("[perparc-site] /api/pair failed", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ errors: ["Internal error"] }));
    });
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/token")) {
    handleTokenLookup(req, res).catch((err) => {
      console.error("[perparc-site] /api/token failed", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ found: false, error: "Internal error" }));
    });
    return;
  }
  if (req.method === "GET" && req.url === "/api/pairings") {
    handleListPairings(res).catch((err) => {
      console.error("[perparc-site] /api/pairings failed", err);
      res.writeHead(500);
      res.end("Internal error");
    });
    return;
  }
  handleStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[perparc-site] listening on http://127.0.0.1:${PORT}`);
});

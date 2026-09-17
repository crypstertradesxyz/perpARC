/**
 * ============================================================================
 * PARTIALLY VERIFIED — one real gap remains before mainnet. See below.
 * ============================================================================
 * This implements Hyperliquid's L1 action signing scheme (msgpack-encode the
 * action, hash it with the nonce + vault-address suffix, sign an EIP-712
 * "Agent" typed-data wrapper around that hash) from Hyperliquid's public
 * documentation and reference SDKs.
 *
 * Verified (2026-08-08), without needing a funded account:
 *   - msgpack byte-compatibility — the original top risk here. `hexToBytes`/
 *     `actionHash` (now in `hyperliquidWire.ts`) were cross-checked
 *     byte-for-byte against an independent Python re-implementation of
 *     Hyperliquid's actual `action_hash`/`msgpack.packb`, for the exact
 *     `order` and `updateLeverage` action shapes this file sends. Identical
 *     output, both with and without a vault address. See
 *     `hyperliquid.test.ts`'s golden-vector tests.
 *   - Price/size rounding — the original code sent raw `.toString()` on a
 *     computed float, which Hyperliquid's own `examples/rounding.py` says
 *     will get orders rejected (scientific notation, floating-point noise
 *     like `0.30000000000000004`, and no enforcement of their 5-sig-fig/
 *     szDecimals precision rules). Replaced with `roundPrice`/`roundSize`/
 *     `floatToWire` in `hyperliquidWire.ts`, matching their reference
 *     algorithm exactly — tested against their own documented examples.
 *   - `getMidPrice`/`getAssetIndex`/`getPositionState`'s response-shape
 *     assumptions — confirmed live against `api.hyperliquid-testnet.xyz`'s
 *     real `/info` responses (`allMids`, `meta`, `clearinghouseState`).
 *     These are public, unauthenticated reads — no funded account needed.
 *
 * NOT yet verified — needs a funded testnet account + an approved agent
 * wallet's private key, neither of which exist in this environment:
 *   - The actual signed `/exchange` round-trip (`marketOrder`,
 *     `updateLeverage`) — do real orders land, does Hyperliquid's server
 *     accept this file's EIP-712 signature over live HTTP. The byte-level
 *     verification above makes a mismatch unlikely, but it's not the same
 *     as a real fill.
 *   - Per-pool derived accounts (2026-08-11, added for position isolation —
 *     see hyperliquidPoolAccount.ts): each LaunchPool trades under its own
 *     ordinary Hyperliquid account, `privateKey = keccak256
 *     (HYPERLIQUID_DERIVATION_SECRET || pool)`, replacing an earlier
 *     Hyperliquid-native sub-account design that turned out to be blocked
 *     by a real platform gate ($100k lifetime volume required before the
 *     master account can create even one sub-account — confirmed live
 *     2026-08-11). Ordinary accounts have no such gate. Unverified: whether
 *     bridged HyperEVM USDC lands as available perps margin automatically
 *     for a freshly-derived address with no prior activity — the same open
 *     assumption this file already carried for the shared keeper address,
 *     not a new one.
 *   - `withdrawFromBridge`/`getWithdrawable` (2026-08-10, for take-profit
 *     buyback — SPEC.md "Take-profit / buyback"): wire shapes taken from
 *     the reference SDK's `withdraw_from_bridge`/`clearinghouseState`, not
 *     exercised live. `withdrawFromBridge` in particular uses a completely
 *     different signing scheme (`signAndSendUserSignedAction`) than
 *     everything else in this file — see that function's own header. As of
 *     2026-08-11 both are wired into an automatic flow (`maybeTakeProfit`/
 *     `maybeProcessBuyback` in index.ts — see keeper/README.md's
 *     "Take-profit buyback" section), but that flow itself has never run
 *     against a real funded, profitable position either, so this gap
 *     hasn't actually closed — only moved from "not called" to "called,
 *     but still never exercised live."
 * ============================================================================
 */

import { type Account, type Address, type Hex } from "viem";
import { config } from "./config.js";
import { actionHash, roundPrice, roundSize, floatToWire, buildExchangePayload } from "./hyperliquidWire.js";

const isMainnet = config.hyperliquidApiUrl.includes("api.hyperliquid.xyz");

/**
 * Hyperliquid rejects any order below this notional value ("Order must
 * have minimum value of $10"), confirmed live 2026-08-12. Callers sizing a
 * top-up should check `additionalSizeBase * markPrice` against this before
 * calling marketOrder, so a too-small top-up is a normal, expected skip
 * (funds stay parked as unused HyperCore margin until a later top-up
 * pushes the total past this) rather than a thrown rejection.
 */
export const HYPERLIQUID_MIN_ORDER_NOTIONAL_USD = 10;
/** Flat fee deducted from a withdraw3 amount before native USDC lands on Arbitrum. */
export const HYPERLIQUID_WITHDRAW_FEE_USD = 1;

async function infoRequest<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${config.hyperliquidApiUrl}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid /info ${body.type} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** All-time portfolio totals used by the read-only frontend snapshot. */
export async function getLifetimePortfolio(user: Address): Promise<{ pnlUsd: number; volumeUsd: number }> {
  const periods = await infoRequest<Array<[string, { pnlHistory?: Array<[number, string]>; vlm?: string }]>>({
    type: "portfolio",
    user,
  });
  const data = periods.find((entry) => entry[0] === "allTime")?.[1];
  const last = data?.pnlHistory?.[data.pnlHistory.length - 1];
  return { pnlUsd: last ? Number(last[1]) : 0, volumeUsd: Number(data?.vlm ?? 0) };
}

async function exchangeRequest<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${config.hyperliquidApiUrl}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid /exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { status: string; response?: unknown };
  if (json.status !== "ok") throw new Error(`Hyperliquid /exchange rejected: ${JSON.stringify(json)}`);
  return json as T;
}

// ---- market data ----

export async function getMidPrice(coin: string): Promise<number> {
  const dex = coin.includes(":") ? (coin.split(":", 1)[0] ?? "") : "";
  const mids = await infoRequest<Record<string, string>>({ type: "allMids", ...(dex ? { dex } : {}) });
  const mid = mids[coin];
  if (!mid) throw new Error(`no mid price for ${coin}`);
  return Number(mid);
}

interface AssetMeta {
  index: number;
  /** max size decimal places for this asset — also determines the max price decimals, see roundPrice */
  szDecimals: number;
}

const assetMetaCache = new Map<string, AssetMeta>();

async function loadDexAssetMeta(dex: string): Promise<void> {
  const meta = await infoRequest<{ universe: { name: string; szDecimals: number }[] }>({ type: "meta", ...(dex ? { dex } : {}) });
  let dexIndex = 0;
  if (dex) {
    const dexs = await infoRequest<Array<null | { name: string }>>({ type: "perpDexs" });
    dexIndex = dexs.findIndex((entry) => entry?.name === dex);
    if (dexIndex < 1) throw new Error(`unknown Hyperliquid perp dex ${dex}`);
  }
  meta.universe.forEach((asset, index) => {
    const assetIndex = dex ? 100_000 + dexIndex * 10_000 + index : index;
    assetMetaCache.set(asset.name, { index: assetIndex, szDecimals: asset.szDecimals });
  });
}

async function getAssetMeta(coin: string): Promise<AssetMeta> {
  const dex = coin.includes(":") ? (coin.split(":", 1)[0] ?? "") : "";
  if (!assetMetaCache.has(coin)) await loadDexAssetMeta(dex);
  const info = assetMetaCache.get(coin);
  if (!info) throw new Error(`unknown Hyperliquid asset ${coin}`);
  return info;
}

/** Hyperliquid references assets by integer index in order/leverage actions, not by symbol. */
export async function getAssetIndex(coin: string): Promise<number> {
  return (await getAssetMeta(coin)).index;
}

export interface PositionState {
  sizeBase: number; // signed: positive = long, negative = short
  entryPrice: number;
  unrealizedPnl: number;
  marginUsed: number;
  leverage: number;
  liquidationPrice: number;
}

/**
 * null if there's no open position for this coin. `user` should always be a
 * pool's own derived account (see hyperliquidPoolAccount.ts), never a
 * shared address — two pools both trading BTC under the same `user` would
 * otherwise read (and mutate, via marketOrder) the same combined position.
 */
export async function getPositionState(coin: string, user: Address): Promise<PositionState | null> {
  const dex = coin.includes(":") ? (coin.split(":", 1)[0] ?? "") : "";
  const state = await infoRequest<{
    assetPositions: {
      position: {
        coin: string;
        szi: string;
        entryPx: string;
        unrealizedPnl: string;
        marginUsed: string;
        leverage: { value: number };
        liquidationPx: string | null;
      };
    }[];
  }>({ type: "clearinghouseState", user, ...(dex ? { dex } : {}) });

  const found = state.assetPositions.find((p) => p.position.coin === coin);
  if (!found) return null;
  const p = found.position;
  return {
    sizeBase: Number(p.szi),
    entryPrice: Number(p.entryPx),
    unrealizedPnl: Number(p.unrealizedPnl),
    marginUsed: Number(p.marginUsed),
    leverage: p.leverage.value,
    liquidationPrice: Number(p.liquidationPx || 0),
  };
}

/** Position equity per SPEC.md's sizing rule: margin + unrealized PnL. */
export function positionEquity(p: PositionState): number {
  return p.marginUsed + p.unrealizedPnl;
}

/**
 * `withdrawable` — the slice of `user`'s account value not locked as
 * margin, directly movable off Hyperliquid via `withdrawFromBridge`.
 * Reading this before and after a reduce-only close is how
 * `maybeTakeProfit` (index.ts) measures exactly how much that specific
 * close freed up, rather than re-deriving it from position math (margin
 * released + realized PnL) itself — more robust to fees/rounding, and self-
 * verifying against whatever Hyperliquid's own accounting actually did.
 * Confirmed this field exists live against api.hyperliquid-testnet.xyz's
 * real `clearinghouseState` response, 2026-08-10.
 */
export async function getWithdrawable(user: Address, coin = ""): Promise<number> {
  const dex = coin.includes(":") ? (coin.split(":", 1)[0] ?? "") : "";
  const state = await infoRequest<{ withdrawable: string }>({ type: "clearinghouseState", user, ...(dex ? { dex } : {}) });
  return Number(state.withdrawable);
}

/**
 * Looks up an order by client-order-id (cloid) via /info's `orderStatus`,
 * returning its status string (e.g. "open", "filled", "canceled") or null if
 * Hyperliquid has no record of it (`{"status":"unknownOid"}`). Verified live
 * against api.hyperliquid-testnet.xyz 2026-08-10: the same `oid` field
 * accepts either a numeric order id or a cloid hex string. Used to make TP
 * order placement idempotent — see `maybeTakeProfit` in index.ts.
 */
export async function getOrderStatusByCloid(user: Address, cloid: Hex): Promise<string | null> {
  const result = await infoRequest<{ status: string; order?: { status: string } }>({
    type: "orderStatus",
    user,
    oid: cloid,
  });
  if (result.status !== "order" || !result.order) return null;
  return result.order.status;
}

// ---- L1 action signing ----

async function signAndSendL1Action<T>(account: Account, action: Record<string, unknown>, vaultAddress: `0x${string}` | null = null): Promise<T> {
  const nonce = BigInt(Date.now());
  const hash = actionHash(action, nonce, vaultAddress);

  const signature = await account.signTypedData!({
    domain: {
      name: "Exchange",
      version: "1",
      chainId: 1337,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: {
      Agent: [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" },
      ],
    },
    primaryType: "Agent",
    message: {
      source: isMainnet ? "a" : "b",
      connectionId: hash,
    },
  });

  const r = signature.slice(0, 66) as `0x${string}`;
  const s = (`0x${signature.slice(66, 130)}`) as `0x${string}`;
  const v = Number.parseInt(signature.slice(130, 132), 16);

  return exchangeRequest<T>(buildExchangePayload(action, nonce, { r, s, v }, vaultAddress));
}

/**
 * Signs and sends a Hyperliquid "user-signed action" — a completely
 * different scheme from `signAndSendL1Action` above (orders, leverage,
 * sub-accounts): no msgpack/action-hash step at all, just a direct EIP-712
 * typed-data signature over the action's own fields, under a different
 * domain (`HyperliquidSignTransaction`, a *fixed* chainId `0x66eee`
 * regardless of whether this is actually mainnet or testnet — the
 * `hyperliquidChain` field inside the message is what distinguishes those,
 * not the EIP-712 domain's chainId). Confirmed from
 * hyperliquid-python-sdk's signing.py (`sign_user_signed_action`,
 * `user_signed_payload`, and the per-action `*_SIGN_TYPES` arrays) — not
 * exercised against a live account, same verification gap this file's
 * header already carries generally. Only `withdrawFromBridge` uses this
 * today.
 */
async function signAndSendUserSignedAction<T>(
  account: Account,
  primaryType: string,
  payloadTypes: { name: string; type: string }[],
  actionFields: Record<string, unknown>
): Promise<T> {
  const time = Date.now();
  const action = {
    ...actionFields,
    signatureChainId: "0x66eee",
    hyperliquidChain: isMainnet ? "Mainnet" : "Testnet",
    // Signed AND sent: every user-signed action's type list ends with
    // `time: uint64`, and the exchange payload's nonce must equal it
    // (reference SDK's sign_user_signed_action). Omitting it from the
    // message made signTypedData throw on BigInt(undefined) — caught on
    // withdrawFromBridge's first real invocation, 2026-08-12.
    time,
  };

  const signature = await account.signTypedData!({
    domain: {
      name: "HyperliquidSignTransaction",
      version: "1",
      chainId: 421614, // fixed per Hyperliquid's own scheme — see this function's header note
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: { [primaryType]: payloadTypes },
    primaryType,
    message: action,
  });

  const r = signature.slice(0, 66) as `0x${string}`;
  const s = (`0x${signature.slice(66, 130)}`) as `0x${string}`;
  const v = Number.parseInt(signature.slice(130, 132), 16);

  return exchangeRequest<T>(buildExchangePayload(action, BigInt(time), { r, s, v }, null));
}

// ---- trading actions ----

/**
 * IOC market order to open or add to a position. `sizeBase` is always
 * positive; `isBuy` (true = long-direction order) determines side. Uses a
 * generous slippage-tolerant limit price (market orders on Hyperliquid are
 * expressed as aggressively-priced IOC limit orders, not a distinct order
 * type) since this is a keeper action, not a user-facing trade — SPEC.md's
 * sizing rule already determined the size, this just needs to fill. Price
 * and size are rounded/formatted via hyperliquidWire.ts's roundPrice/
 * roundSize/floatToWire before being sent — see that file for why a raw
 * computed float can't be used directly.
 *
 * `cloid`, if given, is attached as the order's client-order-id so a caller
 * can later look this exact order up via `getOrderStatusByCloid` — e.g. to
 * confirm an order it lost track of (crash before a local "done" flag was
 * persisted) instead of blindly placing a duplicate.
 *
 * `account` should always be a pool's own derived account (see
 * hyperliquidPoolAccount.ts), signing and trading its own position
 * directly — `vaultAddress` stays unset (undefined = trade own account).
 */
interface OrderActionResponse {
  status: string;
  response?: {
    type?: string;
    data?: {
      statuses?: Array<{ error?: string; resting?: unknown; filled?: unknown }>;
    };
  };
}

export async function marketOrder(
  account: Account,
  coin: string,
  isBuy: boolean,
  sizeBase: number,
  referencePrice: number,
  reduceOnly = false,
  cloid?: Hex,
  vaultAddress?: Address
): Promise<unknown> {
  await ensureUnifiedAccountForHip3(account, coin);
  const { index: assetIndex, szDecimals } = await getAssetMeta(coin);
  // 5% slippage tolerance in the aggressive direction, matching the common
  // reference-implementation convention for a Hyperliquid "market" order
  const slippage = 0.05;
  const rawLimitPrice = isBuy ? referencePrice * (1 + slippage) : referencePrice * (1 - slippage);
  const limitPrice = roundPrice(rawLimitPrice, szDecimals);
  const size = roundSize(sizeBase, szDecimals);

  const order: Record<string, unknown> = {
    a: assetIndex,
    b: isBuy,
    p: floatToWire(limitPrice),
    s: floatToWire(size),
    r: reduceOnly,
    t: { limit: { tif: "Ioc" } },
  };
  if (cloid) order.c = cloid;

  const action = {
    type: "order",
    orders: [order],
    grouping: "na",
  };

  const result = await signAndSendL1Action<OrderActionResponse>(account, action, vaultAddress);
  // exchangeRequest only checks the top-level status, which stays "ok"
  // even when Hyperliquid rejects the individual order inside it (e.g.
  // below their $10 minimum notional) — the real per-order outcome is
  // nested in response.data.statuses[0]. Found live, 2026-08-12: a real
  // order silently "succeeded" (no thrown error, no fill, no resting
  // order, callers went on to record a contribution for a position that
  // was never actually opened) because nothing checked this far in.
  const orderStatus = result.response?.data?.statuses?.[0];
  if (orderStatus?.error) {
    throw new Error(`Hyperliquid order rejected: ${orderStatus.error}`);
  }
  return result;
}

/** `account` should always be a pool's own derived account — vaultAddress stays unset. */
export async function updateLeverage(account: Account, coin: string, leverage: number, isCross: boolean, vaultAddress?: Address): Promise<unknown> {
  await ensureUnifiedAccountForHip3(account, coin);
  const assetIndex = await getAssetIndex(coin);
  const action = { type: "updateLeverage", asset: assetIndex, isCross, leverage };
  return signAndSendL1Action(account, action, vaultAddress);
}

const hip3ReadyAccounts = new Set<string>();
async function ensureUnifiedAccountForHip3(account: Account, coin: string): Promise<void> {
  if (!coin.includes(":") || hip3ReadyAccounts.has(account.address.toLowerCase())) return;
  await signAndSendL1Action(account, { type: "agentSetAbstraction", abstraction: "u" }, null);
  hip3ReadyAccounts.add(account.address.toLowerCase());
}

/**
 * Withdraws `amountUsd` from Hyperliquid's perps balance to `destination`
 * on Arbitrum as native USDC (`withdraw3`) — the first hop of routing
 * take-profit proceeds back to Robinhood Chain for a buyback (SPEC.md
 * "Take-profit / buyback"). Uses `signAndSendUserSignedAction`, a different
 * signing scheme than every other action in this file — see that
 * function's header. `amountUsd` is formatted to 6 decimal places (matches
 * USDC precision) to avoid the same float-to-string footguns
 * `hyperliquidWire.ts`'s `floatToWire` exists to prevent for order
 * price/size, applied here by hand since this scheme doesn't go through
 * that file at all.
 */
export async function withdrawFromBridge(account: Account, destination: Address, amountUsd: number): Promise<unknown> {
  return signAndSendUserSignedAction(
    account,
    "HyperliquidTransaction:Withdraw",
    [
      { name: "hyperliquidChain", type: "string" },
      { name: "destination", type: "string" },
      { name: "amount", type: "string" },
      { name: "time", type: "uint64" },
    ],
    { type: "withdraw3", destination, amount: amountUsd.toFixed(6) }
  );
}

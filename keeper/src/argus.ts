/**
 * Best-effort Argus RevenueSplitter.claim() calls, from each token's own
 * derived account (derivedAccount.ts).
 *
 * IMPORTANT CONSTRAINT -- read before assuming this "regularly claims
 * fees" the way it sounds like it should: Argus's RevenueSplitter.claim()
 * is gated to `msg.sender == creator`, where `creator` is whoever called
 * Argus's `Portal.createLaunch()` and is (per the reference source this
 * was read from -- see SPEC.md "Verification status") IMMUTABLE, with no
 * reassignment function. Under this pairing model, the token's team
 * launches independently and calls createLaunch() themselves -- so THEY,
 * not PerpArc, are Argus's `creator`, and only their own wallet can ever
 * call claim() successfully.
 *
 * This function calls claim() from the token's PerpArc-derived account
 * anyway, every poll tick, on the chance that either (a) Argus's real
 * contract turns out to support creator reassignment despite the
 * reference source not showing one, and a team pointed it at their
 * PerpArc address, or (b) a future pairing flow has the team do that
 * reassignment as its "redirect" step. Today, for a team that instead
 * manually calls claim() themselves and sends/redirects the proceeds to
 * their PerpArc address some other way, this call simply reverts every
 * time and is swallowed -- harmless, but NOT the automation it might look
 * like. sweep.ts's balance check downstream is what actually matters
 * regardless of which path got funds into the deposit address.
 *
 * See PerpArc's README "Open questions" -- this needs a real answer from
 * Argus's verified source before the marketing copy ("no application, no
 * waiting... we do the rest") can be trusted for the claiming half of the
 * flow, not just the position-funding half.
 */

import { type Account, type Address, createPublicClient, createWalletClient, http } from "viem";
import { config } from "./config.js";
import { arc } from "./chains.js";

const portalAbi = [
  {
    type: "function",
    name: "launches",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "creator", type: "address" },
      { name: "tickStart", type: "int24" },
      { name: "tokenIsToken0", type: "bool" },
      { name: "locker", type: "address" },
      { name: "hook", type: "address" },
      { name: "splitter", type: "address" },
      { name: "buyTaxBps", type: "uint16" },
      { name: "sellTaxBps", type: "uint16" },
      { name: "positionId", type: "uint256" },
      { name: "tickBond", type: "int24" },
      { name: "quoteAsset", type: "address" },
    ],
  },
] as const;

const revenueSplitterAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "quoteAsset", type: "address" },
    ],
    outputs: [],
  },
] as const;

const arcPublicClient = createPublicClient({ chain: arc, transport: http(config.arcRpcUrl) });

export type ClaimAttemptResult =
  | { outcome: "claimed" }
  | { outcome: "not-authorized" } // this account isn't Argus's `creator` for this launch
  | { outcome: "not-launched-on-argus" } // token has no Portal.launches() record
  | { outcome: "reverted"; reason: string }
  | { outcome: "dry-run" };

/**
 * Reads the token's Argus launch record and, only if `account` is already
 * the recorded `creator` (see header -- usually false under this model),
 * attempts claim(). Never throws; every failure mode is a tagged result.
 */
export async function tryClaimArgusFees(account: Account, tokenAddress: Address): Promise<ClaimAttemptResult> {
  if (!config.argusPortalAddress) return { outcome: "not-launched-on-argus" };

  let record: readonly [Address, number, boolean, Address, Address, Address, number, number, bigint, number, Address];
  try {
    record = await arcPublicClient.readContract({
      address: config.argusPortalAddress,
      abi: portalAbi,
      functionName: "launches",
      args: [tokenAddress],
    });
  } catch {
    return { outcome: "not-launched-on-argus" };
  }

  const [creator, , , , , splitter, , , , , quoteAsset] = record;
  if (splitter === "0x0000000000000000000000000000000000000000") {
    return { outcome: "not-launched-on-argus" };
  }
  if (creator.toLowerCase() !== account.address.toLowerCase()) {
    return { outcome: "not-authorized" };
  }

  if (config.dryRun) {
    console.log(`[keeper] DRY_RUN: would call RevenueSplitter.claim(${account.address}, ${quoteAsset}) for ${tokenAddress}`);
    return { outcome: "dry-run" };
  }

  const walletClient = createWalletClient({ account, chain: arc, transport: http(config.arcRpcUrl) });
  try {
    const hash = await walletClient.writeContract({
      address: splitter,
      abi: revenueSplitterAbi,
      functionName: "claim",
      args: [account.address, quoteAsset],
    });
    await arcPublicClient.waitForTransactionReceipt({ hash, confirmations: config.confirmations });
    return { outcome: "claimed" };
  } catch (err) {
    return { outcome: "reverted", reason: err instanceof Error ? err.message : String(err) };
  }
}

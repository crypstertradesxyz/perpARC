/**
 * Per-token pipeline: whatever Arc USDC balance sits at a paired token's
 * deposit address (regardless of how it got there -- an automated
 * argus.ts claim(), or the team sending/claiming it manually), split it
 * 80/20 and move both shares onward. This is what actually matters for
 * "regularly claiming/processing fees" -- it runs every poll tick
 * independent of whether tryClaimArgusFees() succeeded.
 */

import type { Account, Address } from "viem";
import { config } from "./config.js";
import { getArcUsdcBalance, raw6ToUsdc, transferArcUsdc, usdcToRaw6 } from "./arcUsdc.js";
import { burnOnArc, mintOnArbitrum } from "./cctp.js";
import { depositToHyperliquid } from "./hyperliquidDeposit.js";
import type { KeeperStateStore } from "./state.js";

export interface SweepResult {
  swept: boolean;
  balanceUsdc: number;
  buybackAmountUsdc?: number;
  positionAmountUsdc?: number;
}

export async function sweepToken(
  account: Account,
  tokenAddress: Address,
  stateStore: KeeperStateStore
): Promise<SweepResult> {
  // Finish any bridge left in-flight from a previous crash before looking
  // at the current balance -- see state.ts's header for why this matters.
  const pending = stateStore.getPendingBridge(tokenAddress);
  if (pending) {
    console.log(`[keeper] resuming pending bridge for ${tokenAddress} (burned ${pending.arcBurnTxHash})`);
    await mintOnArbitrum(account, pending.arcBurnTxHash, pending.message);
    await depositToHyperliquid(account, BigInt(pending.amountRaw6));
    await stateStore.clearPendingBridge(tokenAddress);
  }

  const balanceRaw6 = await getArcUsdcBalance(account.address);
  const balanceUsdc = raw6ToUsdc(balanceRaw6);

  if (balanceUsdc < config.sweepMinUsdc) {
    return { swept: false, balanceUsdc };
  }

  const buybackRaw6 = (balanceRaw6 * BigInt(config.buybackShareBps)) / 10_000n;
  const positionRaw6 = balanceRaw6 - buybackRaw6;

  console.log(
    `[keeper] sweeping ${tokenAddress}: ${raw6ToUsdc(buybackRaw6)} USDC -> buyback, ${raw6ToUsdc(positionRaw6)} USDC -> position`
  );

  await transferArcUsdc(account, config.buybackWalletAddress, buybackRaw6);

  const burnResult = await burnOnArc(account, positionRaw6);
  if (!("dryRun" in burnResult)) {
    // Persisted BEFORE the multi-minute attestation wait -- see cctp.ts's
    // burnOnArc/mintOnArbitrum split and state.ts's PendingBridge header.
    await stateStore.setPendingBridge(tokenAddress, {
      amountRaw6: positionRaw6.toString(),
      arcBurnTxHash: burnResult.arcBurnTxHash,
      message: burnResult.message,
      createdAt: new Date().toISOString(),
    });
    await mintOnArbitrum(account, burnResult.arcBurnTxHash, burnResult.message);
    await depositToHyperliquid(account, positionRaw6);
    await stateStore.clearPendingBridge(tokenAddress);
  }

  return {
    swept: true,
    balanceUsdc,
    buybackAmountUsdc: raw6ToUsdc(buybackRaw6),
    positionAmountUsdc: raw6ToUsdc(positionRaw6),
  };
}

// Re-exported for callers that just want to price a balance without acting on it.
export { usdcToRaw6 };

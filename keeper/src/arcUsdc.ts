/**
 * All Arc USDC reads/writes in this keeper go through here, at the ERC-20
 * interface's 6 decimals -- never through eth_getBalance, which reports
 * the SAME underlying balance at 18 decimals (see config.ts's
 * arcUsdcAddress comment). Mixing the two up is a 10^12x error, not a
 * rounding error -- confirmed independently against two sources
 * (docs.arc.io and an unrelated third-party integration built specifically
 * to handle this split) before writing any of this file.
 */

import { type Account, type Address, createPublicClient, createWalletClient, http } from "viem";
import { config } from "./config.js";
import { arc } from "./chains.js";
import { erc20Abi } from "./erc20.js";

export const ARC_USDC_DECIMALS = 6;

const arcPublicClient = createPublicClient({ chain: arc, transport: http(config.arcRpcUrl) });

/** USDC balance at `address`, in raw 6-decimal units (i.e. $1.00 == 1_000_000n). */
export async function getArcUsdcBalance(address: Address): Promise<bigint> {
  return arcPublicClient.readContract({
    address: config.arcUsdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

/** Arc's native balance, for gas-floor checks only -- 18 decimals, NOT comparable to getArcUsdcBalance's return value. */
export async function getArcNativeBalance(address: Address): Promise<bigint> {
  return arcPublicClient.getBalance({ address });
}

export function usdcToRaw6(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

export function raw6ToUsdc(raw: bigint): number {
  return Number(raw) / 1_000_000;
}

export async function transferArcUsdc(fromAccount: Account, to: Address, amountRaw6: bigint): Promise<`0x${string}`> {
  if (config.dryRun) {
    console.log(`[keeper] DRY_RUN: would transfer ${raw6ToUsdc(amountRaw6)} USDC on Arc to ${to}`);
    return "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
  }
  const walletClient = createWalletClient({ account: fromAccount, chain: arc, transport: http(config.arcRpcUrl) });
  const hash = await walletClient.writeContract({
    address: config.arcUsdcAddress,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amountRaw6],
  });
  await arcPublicClient.waitForTransactionReceipt({ hash, confirmations: config.confirmations });
  return hash;
}

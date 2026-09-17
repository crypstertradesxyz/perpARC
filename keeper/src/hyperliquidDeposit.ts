/**
 * Final leg: moves USDC that just landed on Arbitrum (via cctp.ts) into
 * Hyperliquid's perps margin for the SAME address that sent it. Hyperliquid's
 * classic Arbitrum bridge (Bridge2, confirmed live 2026-09-17 against
 * multiple independent sources) credits whatever address's USDC transfer
 * it observes -- a plain ERC-20 transfer to the bridge contract, no special
 * calldata or registration step. Minimum deposit is 5 USDC; deposits credit
 * the perps account in roughly Arbitrum's own finality window (~10 min per
 * Hyperliquid's own docs), not instantly.
 *
 * NOT yet exercised live end-to-end from this codebase -- confirmed from
 * documentation/onboarding-guide consensus, not from watching a real
 * balance appear on Hyperliquid after this specific code path ran.
 */

import { type Account, type Hex, createPublicClient, createWalletClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { config } from "./config.js";
import { erc20Abi } from "./erc20.js";
import { ensureArbitrumGas } from "./gasTopup.js";

const MIN_DEPOSIT_RAW6 = 5_000_000n; // $5, Hyperliquid's documented minimum

const arbitrumPublicClient = createPublicClient({ chain: arbitrum, transport: http(config.arbitrumRpcUrl) });

export async function depositToHyperliquid(account: Account, amountRaw6: bigint): Promise<Hex | { dryRun: true }> {
  if (amountRaw6 < MIN_DEPOSIT_RAW6) {
    throw new Error(`Deposit amount ${amountRaw6} is below Hyperliquid's documented $5 minimum`);
  }

  if (config.dryRun) {
    console.log(
      `[keeper] DRY_RUN: would deposit ${amountRaw6} raw USDC to Hyperliquid's Arbitrum bridge for ${account.address}`
    );
    return { dryRun: true };
  }

  await ensureArbitrumGas(account.address);
  const walletClient = createWalletClient({ account, chain: arbitrum, transport: http(config.arbitrumRpcUrl) });
  const hash = await walletClient.writeContract({
    address: config.arbitrumUsdcAddress,
    abi: erc20Abi,
    functionName: "transfer",
    args: [config.hyperliquidBridgeArbitrumAddress, amountRaw6],
  });
  await arbitrumPublicClient.waitForTransactionReceipt({ hash, confirmations: config.confirmations });
  return hash;
}

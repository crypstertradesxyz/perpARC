/**
 * A freshly-derived account (derivedAccount.ts) starts with zero ETH on
 * Arbitrum -- it can't pay gas for receiveMessage (cctp.ts) or the final
 * Hyperliquid bridge transfer (hyperliquidDeposit.ts) without a top-up.
 * Same pattern as Longshot's ensureArbitrumGas/ensureHyperEvmGas: a single
 * keeper-operational wallet, funded manually with ETH, tops up each
 * derived account only when it's below a floor. Arc needs no equivalent --
 * Arc's gas token IS USDC, the same asset a derived account already holds
 * from fee redirection.
 */

import { type Address, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";
import { config } from "./config.js";

const arbitrumPublicClient = createPublicClient({ chain: arbitrum, transport: http(config.arbitrumRpcUrl) });

function operationalAccount() {
  if (!config.keeperOperationalPrivateKey) {
    throw new Error("KEEPER_OPERATIONAL_PRIVATE_KEY is required to top up Arbitrum gas");
  }
  return privateKeyToAccount(config.keeperOperationalPrivateKey);
}

export async function ensureArbitrumGas(address: Address): Promise<void> {
  const balance = await arbitrumPublicClient.getBalance({ address });
  if (balance >= config.arbitrumGasFloorWei) return;

  if (config.dryRun) {
    console.log(`[keeper] DRY_RUN: would top up ${address} with ${config.arbitrumGasTopupWei} wei ETH on Arbitrum`);
    return;
  }

  const funder = operationalAccount();
  const walletClient = createWalletClient({ account: funder, chain: arbitrum, transport: http(config.arbitrumRpcUrl) });
  const hash = await walletClient.sendTransaction({ to: address, value: config.arbitrumGasTopupWei });
  await arbitrumPublicClient.waitForTransactionReceipt({ hash, confirmations: config.confirmations });
  console.log(`[keeper] topped up ${address} with ${config.arbitrumGasTopupWei} wei ETH on Arbitrum (${hash})`);
}

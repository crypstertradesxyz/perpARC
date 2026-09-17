/**
 * Central env-var config, read eagerly at import time (same convention as
 * Longshot's keeper) so a missing required var fails at startup, not mid-run.
 */

import "dotenv/config";
import type { Hex } from "viem";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  // --- Arc ---
  arcRpcUrl: optionalEnv("ARC_RPC_URL", "https://rpc.arc-scan.org"),
  // Confirmed against docs.arc.io/arc/references/contract-addresses
  // (2026-09-17): Arc's native USDC gas token and its ERC-20 interface
  // share one underlying balance at this address, but expose it at
  // DIFFERENT DECIMALS -- native balance (eth_getBalance) is 18 decimals,
  // the ERC-20 interface (balanceOf/transfer/the CCTP burnToken) is 6.
  // Every USDC amount in this codebase outside of raw gas-floor checks
  // MUST go through the ERC-20 interface at 6 decimals -- see arcUsdc.ts.
  arcUsdcAddress: optionalEnv(
    "ARC_USDC_ADDRESS",
    "0x3600000000000000000000000000000000000000"
  ) as Hex,

  // --- Pairing derivation ---
  // MUST be byte-for-byte the same secret site/server.js uses (see its
  // "Derivation secret" comment) -- a mismatch here silently derives a
  // DIFFERENT address than the one already handed out to a token's team,
  // watching (and later funding) the wrong wallet entirely.
  pairingDerivationSecret: requireEnv("PAIRING_DERIVATION_SECRET") as Hex,
  pairingsFilePath: optionalEnv("PAIRINGS_FILE_PATH", "../site/data/pairings.json"),

  // --- Keeper operational wallet ---
  // Funds Arbitrum gas top-ups for derived accounts (see gasTopup.ts) --
  // Arc needs no equivalent since Arc's gas token IS USDC, the same asset
  // already sitting in a derived account from fee redirection.
  keeperOperationalPrivateKey: process.env.KEEPER_OPERATIONAL_PRIVATE_KEY as Hex | undefined,
  arbitrumGasFloorWei: BigInt(optionalEnv("ARBITRUM_GAS_FLOOR_WEI", "2000000000000000")), // 0.002 ETH
  arbitrumGasTopupWei: BigInt(optionalEnv("ARBITRUM_GAS_TOPUP_WEI", "3000000000000000")), // 0.003 ETH

  // --- Bridging (CCTP v2 -- see cctp.ts header for verification status) ---
  arbitrumRpcUrl: optionalEnv("ARBITRUM_RPC_URL", "https://arb1.arbitrum.io/rpc"),
  cctpTokenMessenger: optionalEnv(
    "CCTP_TOKEN_MESSENGER",
    "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d"
  ) as Hex,
  cctpMessageTransmitter: optionalEnv(
    "CCTP_MESSAGE_TRANSMITTER",
    "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64"
  ) as Hex,
  cctpArcDomain: Number(optionalEnv("CCTP_ARC_DOMAIN", "26")),
  cctpArbitrumDomain: Number(optionalEnv("CCTP_ARBITRUM_DOMAIN", "3")),
  circleAttestationApiUrl: optionalEnv("CIRCLE_ATTESTATION_API_URL", "https://iris-api.circle.com"),

  // --- Hyperliquid ---
  hyperliquidApiUrl: optionalEnv("HYPERLIQUID_API_URL", "https://api.hyperliquid.xyz"),
  hyperliquidBridgeArbitrumAddress: optionalEnv(
    "HYPERLIQUID_BRIDGE_ARBITRUM_ADDRESS",
    "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7"
  ) as Hex,
  arbitrumUsdcAddress: optionalEnv(
    "ARBITRUM_USDC_ADDRESS",
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" // native USDC on Arbitrum One
  ) as Hex,

  // --- Fee split & thresholds (see SPEC.md "Fee split") ---
  positionShareBps: Number(optionalEnv("POSITION_SHARE_BPS", "8000")), // 80%
  buybackShareBps: Number(optionalEnv("BUYBACK_SHARE_BPS", "2000")), // 20%
  buybackWalletAddress: requireEnv("BUYBACK_WALLET_ADDRESS") as Hex,
  sweepMinUsdc: Number(optionalEnv("SWEEP_MIN_USDC", "50")), // $50, matches Longshot's POSITION_MIN_USD_TO_FUND

  // --- Operational ---
  // DRY_RUN defaults true: this keeper has never moved real funds through
  // CCTP or the Hyperliquid bridge yet (see cctp.ts / hyperliquidDeposit.ts
  // headers). Every write path checks this and logs what it WOULD do
  // instead of broadcasting, until explicitly turned off.
  dryRun: optionalEnv("DRY_RUN", "true") !== "false",
  pollIntervalMs: Number(optionalEnv("POLL_INTERVAL_MS", "60000")),
  confirmations: Number(optionalEnv("CONFIRMATIONS", "2")),
  stateFilePath: optionalEnv("KEEPER_STATE_PATH", "./data/keeper-state.json"),
};

/**
 * Circle CCTP v2 burn-and-mint: Arc -> Arbitrum. Contract addresses and
 * domain IDs below are CCTP v2's canonical, deterministic-across-chains
 * deployment -- confirmed 2026-09-17 against developers.circle.com's own
 * EVM contract-address reference AND independently cross-checked against
 * a live Arbiscan lookup for the same MessageTransmitterV2 address (both
 * agree). Re-verify with `cast code` against the live RPC before trusting
 * this with real funds regardless -- Arc mainnet is one day old as of this
 * file, and CCTP support for it (vs. Arc *testnet*, which is definitely
 * live) has not been exercised with an actual burn/mint round trip here.
 *
 * Uses CCTP v2's "Standard Transfer" path (minFinalityThreshold=2000,
 * maxFee=0n) -- waits for hard finality rather than paying a fast-transfer
 * fee, appropriate for a keeper sweep that isn't user-latency-sensitive.
 */

import {
  type Account,
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  http,
  pad,
  parseAbiItem,
} from "viem";
import { arbitrum } from "viem/chains";
import { config } from "./config.js";
import { arc } from "./chains.js";
import { erc20Abi } from "./erc20.js";
import { ensureArbitrumGas } from "./gasTopup.js";

const tokenMessengerAbi = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
] as const;

const messageTransmitterAbi = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const messageSentEvent = parseAbiItem("event MessageSent(bytes message)");

const arcPublicClient = createPublicClient({ chain: arc, transport: http(config.arcRpcUrl) });
const arbitrumPublicClient = createPublicClient({ chain: arbitrum, transport: http(config.arbitrumRpcUrl) });

const STANDARD_TRANSFER_MIN_FINALITY = 2000;
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;

function addressToBytes32(address: Address): Hex {
  return pad(address, { size: 32 });
}

/**
 * Burns `amountRaw6` (6-decimal USDC) on Arc from `account`, mints the same
 * amount to `account`'s own address on Arbitrum. Returns once Circle's
 * attestation is fetched and the mint transaction on Arbitrum confirms.
 */
export async function bridgeArcToArbitrum(account: Account, amountRaw6: bigint): Promise<{ mintTxHash: Hex } | { dryRun: true }> {
  if (config.dryRun) {
    console.log(
      `[keeper] DRY_RUN: would bridge ${amountRaw6} raw USDC (Arc -> Arbitrum) for ${account.address} via CCTP`
    );
    return { dryRun: true };
  }

  const arcWallet = createWalletClient({ account, chain: arc, transport: http(config.arcRpcUrl) });

  const approveHash = await arcWallet.writeContract({
    address: config.arcUsdcAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [config.cctpTokenMessenger, amountRaw6],
  });
  await arcPublicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: config.confirmations });

  const burnHash = await arcWallet.writeContract({
    address: config.cctpTokenMessenger,
    abi: tokenMessengerAbi,
    functionName: "depositForBurn",
    args: [
      amountRaw6,
      config.cctpArbitrumDomain,
      addressToBytes32(account.address),
      config.arcUsdcAddress,
      ZERO_BYTES32, // destinationCaller: anyone may submit the mint
      0n, // maxFee: 0 for a standard (non-fast) transfer
      STANDARD_TRANSFER_MIN_FINALITY,
    ],
  });
  const burnReceipt = await arcPublicClient.waitForTransactionReceipt({
    hash: burnHash,
    confirmations: config.confirmations,
  });

  const messageLog = burnReceipt.logs.find((log) => {
    try {
      return log.topics[0] === messageSentEvent.hash;
    } catch {
      return false;
    }
  });
  if (!messageLog) throw new Error(`No MessageSent event found in depositForBurn receipt ${burnHash}`);
  const message = messageLog.data as Hex;

  const attestation = await fetchAttestation(config.cctpArcDomain, burnHash);

  await ensureArbitrumGas(account.address);
  const arbitrumWallet = createWalletClient({ account, chain: arbitrum, transport: http(config.arbitrumRpcUrl) });
  const mintHash = await arbitrumWallet.writeContract({
    address: config.cctpMessageTransmitter,
    abi: messageTransmitterAbi,
    functionName: "receiveMessage",
    args: [message, attestation],
  });
  await arbitrumPublicClient.waitForTransactionReceipt({ hash: mintHash, confirmations: config.confirmations });

  return { mintTxHash: mintHash };
}

/** Polls Circle's Iris API until the attestation for this burn tx is ready. */
async function fetchAttestation(sourceDomain: number, txHash: Hex, timeoutMs = 5 * 60_000): Promise<Hex> {
  const deadline = Date.now() + timeoutMs;
  const url = `${config.circleAttestationApiUrl}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;

  while (Date.now() < deadline) {
    const res = await fetch(url);
    if (res.ok) {
      const body = (await res.json()) as { messages?: Array<{ status: string; attestation?: Hex }> };
      const message = body.messages?.[0];
      if (message?.status === "complete" && message.attestation) {
        return message.attestation;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Timed out waiting for CCTP attestation for ${txHash}`);
}

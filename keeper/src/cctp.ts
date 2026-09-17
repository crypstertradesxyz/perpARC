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
  toEventSelector,
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

const MESSAGE_SENT_TOPIC = toEventSelector(parseAbiItem("event MessageSent(bytes message)"));

const arcPublicClient = createPublicClient({ chain: arc, transport: http(config.arcRpcUrl) });
const arbitrumPublicClient = createPublicClient({ chain: arbitrum, transport: http(config.arbitrumRpcUrl) });

const STANDARD_TRANSFER_MIN_FINALITY = 2000;
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;

function addressToBytes32(address: Address): Hex {
  return pad(address, { size: 32 });
}

export interface BurnResult {
  arcBurnTxHash: Hex;
  message: Hex;
}

/**
 * Step 1/2: burns `amountRaw6` on Arc from `account`. Callers MUST persist
 * the returned `message`/`arcBurnTxHash` (see state.ts's PendingBridge)
 * before calling `mintOnArbitrum` -- if the process dies during the
 * multi-minute attestation wait in step 2, that persisted record is the
 * only way a restart finishes the mint instead of leaving funds burned on
 * Arc but never credited on Arbitrum.
 */
export async function burnOnArc(account: Account, amountRaw6: bigint): Promise<BurnResult | { dryRun: true }> {
  if (config.dryRun) {
    console.log(`[keeper] DRY_RUN: would burn ${amountRaw6} raw USDC on Arc for ${account.address} via CCTP`);
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
      return log.topics[0] === MESSAGE_SENT_TOPIC;
    } catch {
      return false;
    }
  });
  if (!messageLog) throw new Error(`No MessageSent event found in depositForBurn receipt ${burnHash}`);

  return { arcBurnTxHash: burnHash, message: messageLog.data as Hex };
}

/**
 * Step 2/2: waits for Circle's attestation and submits the mint on
 * Arbitrum. Safe to call again for the same `message` after a crash --
 * CCTP tracks used nonces and a second receiveMessage for an
 * already-processed message simply reverts, which is the recovery path
 * this is designed around (retry, don't re-burn).
 */
export async function mintOnArbitrum(account: Account, arcBurnTxHash: Hex, message: Hex): Promise<Hex> {
  const attestation = await fetchAttestation(config.cctpArcDomain, arcBurnTxHash);

  await ensureArbitrumGas(account.address);
  const arbitrumWallet = createWalletClient({ account, chain: arbitrum, transport: http(config.arbitrumRpcUrl) });
  const mintHash = await arbitrumWallet.writeContract({
    address: config.cctpMessageTransmitter,
    abi: messageTransmitterAbi,
    functionName: "receiveMessage",
    args: [message, attestation],
  });
  await arbitrumPublicClient.waitForTransactionReceipt({ hash: mintHash, confirmations: config.confirmations });
  return mintHash;
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

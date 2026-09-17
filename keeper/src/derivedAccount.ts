/**
 * Maps each PAIRED TOKEN to its own ordinary EVM account -- the exact same
 * derivation formula as site/server.js's deriveDepositAddress(), which is
 * the address already handed out to a token's team as "your PerpArc
 * wallet." This file MUST stay byte-for-byte in sync with that function:
 * a mismatch derives a different address than the one already communicated,
 * and this keeper would then be watching (and later trying to fund a
 * position from) the wrong wallet entirely.
 *
 * Reusing the SAME derived key across every chain this keeper touches
 * (Arc, Arbitrum, Hyperliquid) is deliberate, not incidental: Hyperliquid
 * accounts and Arbitrum addresses and Arc addresses are all just secp256k1
 * keypairs, so one derived key can be "the deposit address," "the Arbitrum
 * address that receives the CCTP mint," and "the Hyperliquid trading
 * account" simultaneously -- no separate registration step, matching
 * Longshot's hyperliquidPoolAccount.ts (keccak256(secret || pool)), with
 * a paired token's address standing in for "pool" since PerpArc doesn't
 * deploy a contract per pairing under this model. See that file's header
 * for why a plain derived EOA is used instead of Hyperliquid's native
 * sub-account feature (a $100k lifetime-volume gate blocks sub-account
 * creation from a cold start; ordinary accounts have no such gate).
 */

import { type Account, type Address, encodePacked, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

const cache = new Map<Address, Account>();

export function deriveTokenAccount(tokenAddress: Address): Account {
  const key = tokenAddress.toLowerCase() as Address;
  const cached = cache.get(key);
  if (cached) return cached;

  const privateKey = keccak256(
    encodePacked(["bytes32", "address"], [config.pairingDerivationSecret, tokenAddress])
  );
  const account = privateKeyToAccount(privateKey);
  cache.set(key, account);
  return account;
}

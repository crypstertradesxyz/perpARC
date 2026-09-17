/**
 * Pure wire-format logic for Hyperliquid's L1 action signing — deliberately
 * has zero dependency on `config.ts` (unlike `hyperliquid.ts`, which needs a
 * live API URL/account to do anything) so it can be unit tested without a
 * full runtime environment. See `hyperliquid.test.ts`.
 *
 * The action-hash algorithm here has been cross-checked byte-for-byte
 * against an independent Python re-implementation of Hyperliquid's actual
 * reference SDK (`hyperliquid-python-sdk`'s `action_hash`/`float_to_wire`/
 * `examples/rounding.py`) for the exact action shapes this keeper sends —
 * see the golden-vector tests. That resolves the specific risk
 * `hyperliquid.ts`'s header comment flags: msgpack byte-compatibility
 * between this JS encoder and Hyperliquid's Python-side re-serialization.
 */

import { encode as msgpackEncode } from "@msgpack/msgpack";
import { encodePacked, keccak256, type Address, type Hex } from "viem";

export function hexToBytes(hex: `0x${string}`): Uint8Array {
  const clean = hex.slice(2);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * `keccak256(msgpack(action) || nonce_be8 || vault_prefix)`, matching
 * Hyperliquid's `action_hash`. `vault_prefix` is a single `0x00` byte when
 * there's no vault address, or `0x01` followed by the 20 raw address bytes.
 */
export function actionHash(action: unknown, nonce: bigint, vaultAddress: `0x${string}` | null): `0x${string}` {
  const actionBytes = msgpackEncode(action);
  const nonceBytes = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, nonce, false); // big-endian

  const vaultBytes = vaultAddress
    ? (() => {
        const b = new Uint8Array(21);
        b[0] = 1;
        b.set(hexToBytes(vaultAddress), 1);
        return b;
      })()
    : new Uint8Array([0]);

  const combined = new Uint8Array(actionBytes.length + nonceBytes.length + vaultBytes.length);
  combined.set(actionBytes, 0);
  combined.set(nonceBytes, actionBytes.length);
  combined.set(vaultBytes, actionBytes.length + nonceBytes.length);

  return keccak256(combined);
}

/**
 * Hyperliquid's own `examples/rounding.py`: "If you use these directly, the
 * exchange will return an error" — a raw computed float's price/size string
 * (e.g. `(0.1 + 0.2).toString()` === "0.30000000000000004", or scientific
 * notation for very small/large numbers) will fail Hyperliquid's tick/lot
 * rules or simply not round-trip through their parser. This mirrors that
 * example exactly: prices get up to 5 significant figures and at most
 * `6 - szDecimals` decimal places (integers are always allowed regardless of
 * significant figures); sizes get rounded to `szDecimals`.
 */
export function roundPrice(px: number, szDecimals: number): number {
  const MAX_DECIMALS = 6; // perps; would be 8 for spot, which this keeper never trades
  if (px > 100_000) return Math.round(px);
  const fiveSigFigs = Number(px.toPrecision(5));
  const decimals = Math.max(MAX_DECIMALS - szDecimals, 0);
  return Number(fiveSigFigs.toFixed(decimals));
}

export function roundSize(sz: number, szDecimals: number): number {
  return Number(sz.toFixed(szDecimals));
}

/**
 * Final wire-format string for an already-rounded price/size, mirroring the
 * Python reference SDK's `float_to_wire`: fixed decimal notation (never
 * scientific), trailing zeroes stripped, and a sanity check that formatting
 * didn't silently lose precision.
 */
export function floatToWire(x: number): string {
  const fixed = x.toFixed(8);
  if (Math.abs(Number(fixed) - x) >= 1e-12) {
    throw new Error(`floatToWire: rounding loss for ${x}`);
  }
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}

/**
 * Deterministic Hyperliquid client-order-id (cloid) for one take-profit
 * milestone on one pool. Same (pool, milestoneIndex) always yields the same
 * cloid, so a crash between placing a TP order and persisting
 * `completeMilestone` is recoverable: a retry looks this cloid up on
 * Hyperliquid via `orderStatus` before placing a new order instead of
 * blindly re-sending — see `maybeTakeProfit` in index.ts. Format is
 * Hyperliquid's required 16-byte cloid: `0x` + exactly 32 hex chars,
 * confirmed against `hyperliquid-python-sdk`'s `Cloid` validation.
 */
export function deriveTakeProfitCloid(pool: Address, milestoneIndex: number): Hex {
  const hash = keccak256(encodePacked(["address", "string", "uint256"], [pool, "take-profit", BigInt(milestoneIndex)]));
  return hash.slice(0, 34) as Hex;
}

export interface ExchangeSignature {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
}

/**
 * The JSON body for POST /exchange, matching the reference SDK's
 * `_post_action` field-for-field. Caught a real bug once: `nonce` has to be
 * a JSON *number*, not a string — Hyperliquid's server rejects a string
 * nonce with a bare "Failed to deserialize the JSON body" 422, confirmed
 * live against testnet 2026-08-08. `nonce` is a millisecond timestamp
 * bigint at the call site; Number() is safe since that's always well within
 * Number.MAX_SAFE_INTEGER.
 */
export function buildExchangePayload(
  action: unknown,
  nonce: bigint,
  signature: ExchangeSignature,
  vaultAddress: `0x${string}` | null
) {
  return {
    action,
    nonce: Number(nonce),
    signature,
    vaultAddress,
  };
}

/**
 * `keccak256(secret || pool)` — the raw private-key material for a pool's
 * derived Hyperliquid trading account (see hyperliquidPoolAccount.ts,
 * which wraps this with config/caching/valid-key retry). Pure and
 * config-free so it's unit-testable the same way as everything else here.
 */
export function derivePoolPrivateKey(secret: Hex, pool: Address): Hex {
  return keccak256(encodePacked(["bytes32", "address"], [secret, pool]));
}

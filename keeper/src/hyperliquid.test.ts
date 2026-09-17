import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionHash,
  roundPrice,
  roundSize,
  floatToWire,
  buildExchangePayload,
  deriveTakeProfitCloid,
} from "./hyperliquidWire.js";

test("buildExchangePayload: nonce is a JSON number, not a string", () => {
  // Confirmed live against testnet 2026-08-08: a string nonce gets a bare
  // 422 "Failed to deserialize the JSON body" from Hyperliquid's server,
  // before signature verification even runs. Locking this in so it can't
  // silently regress.
  const payload = buildExchangePayload({ type: "noop" }, 1735689600000n, { r: "0xaa", s: "0xbb", v: 27 }, null);
  assert.equal(typeof payload.nonce, "number");
  assert.equal(payload.nonce, 1735689600000);
});

// ---- golden vectors, cross-checked against an independent Python
// implementation of Hyperliquid's actual reference algorithm
// (hyperliquid-python-sdk's action_hash + msgpack.packb + pycryptodome's
// keccak), for the exact action shapes this keeper sends. See the session
// notes for the Python side; reproducing it here would just require
// installing msgpack/pycryptodome, which this test suite shouldn't depend
// on — the point is these two constants are proof the JS and Python
// encoders agree, not a live cross-check on every run. ----

test("actionHash: matches Python reference for an order action, no vault", () => {
  const action = {
    type: "order",
    orders: [{ a: 3, b: true, p: "65523.1", s: "0.00152", r: false, t: { limit: { tif: "Ioc" } } }],
    grouping: "na",
  };
  const hash = actionHash(action, 1735689600000n, null);
  assert.equal(hash, "0xd5487136c18f00e4a0901a69ee4ae657987adef0d6d46fc4ef7fb2daac5ebade");
});

test("actionHash: matches Python reference for the same action, with a vault address", () => {
  const action = {
    type: "order",
    orders: [{ a: 3, b: true, p: "65523.1", s: "0.00152", r: false, t: { limit: { tif: "Ioc" } } }],
    grouping: "na",
  };
  const hash = actionHash(action, 1735689600000n, "0x1234567890123456789012345678901234567890");
  assert.equal(hash, "0x441ad766abc1a337905f03b5596edb301e12e86ce3637685b5eca34a03edbb32");
});

// ---- rounding, straight from Hyperliquid's own reference:
// https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/examples/rounding.py
// "Prices can have up to 5 significant figures, but no more than
// MAX_DECIMALS - szDecimals decimal places where MAX_DECIMALS is 6 for perps." ----

test("roundPrice: 5 significant figures, szDecimals=0 leaves 6 decimals of room", () => {
  // "1234.5 is valid but 1234.56 is not (too many significant figures)"
  assert.equal(roundPrice(1234.5, 0), 1234.5);
  assert.equal(roundPrice(1234.56, 0), 1234.6); // rounds to 5 sig figs

  // "0.001234 is valid, but 0.0012345 is not (more than 6 decimal places)"
  assert.equal(roundPrice(0.001234, 0), 0.001234);
  assert.equal(roundPrice(0.0012345, 0), 0.001234); // capped to 6 decimals (szDecimals=0)
});

test("roundPrice: integer prices are always allowed above 100k regardless of sig figs", () => {
  assert.equal(roundPrice(123_456, 0), 123_456);
  assert.equal(roundPrice(123_456.78, 0), 123_457); // rounds to an integer, not 5 sig figs
});

test("roundPrice: the 5-significant-figure cap can be the binding constraint, not szDecimals", () => {
  // BTC on mainnet: szDecimals=5 nominally allows 1 decimal place (6-5), but a
  // 5-digit integer price (65189) already uses up all 5 significant figures
  // — there's no room left for any decimal at all, regardless of szDecimals
  assert.equal(roundPrice(65189.567, 5), 65190);
  // ETH: 4-digit integer (1922) leaves exactly 1 sig fig of decimal room,
  // which is *tighter* than the 2 decimals szDecimals=4 would nominally allow
  assert.equal(roundPrice(1922.756, 4), 1922.8);
});

test("roundSize: rounds to szDecimals, matching Hyperliquid's own example values", () => {
  // examples/rounding.py: sz = 12.345678, coin OP has szDecimals=1 today
  assert.equal(roundSize(12.345678, 1), 12.3);
  assert.equal(roundSize(0.123456, 5), 0.12346);
});

test("floatToWire: strips trailing zeroes without scientific notation", () => {
  assert.equal(floatToWire(1.5), "1.5");
  assert.equal(floatToWire(100), "100");
  assert.equal(floatToWire(0.001235), "0.001235");
});

test("floatToWire: fixes the exact JS footguns that motivated this file", () => {
  // raw .toString() on this produces "0.30000000000000004" — would either
  // get rejected by Hyperliquid's parser or, worse, silently sign a
  // different value than the mathematically intended one
  assert.equal(floatToWire(Number((0.1 + 0.2).toFixed(8))), "0.3");

  // raw .toString() on a very small number produces scientific notation
  // ("1e-8"), which Hyperliquid's fixed-decimal wire format doesn't accept
  assert.equal(floatToWire(0.00000001), "0.00000001");
});

test("floatToWire: -0 normalizes to 0, matching the Python reference's explicit check", () => {
  assert.equal(floatToWire(-0), "0");
});

// ---- deriveTakeProfitCloid: must be a valid Hyperliquid cloid (0x + 32 hex
// chars, i.e. 16 bytes) and deterministic per (pool, milestoneIndex) so a
// retry can look an in-flight order up instead of duplicating it. ----

const POOL_A = "0x1234567890123456789012345678901234567890";
const POOL_B = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

test("deriveTakeProfitCloid: produces a well-formed 16-byte cloid", () => {
  const cloid = deriveTakeProfitCloid(POOL_A, 0);
  assert.match(cloid, /^0x[0-9a-f]{32}$/);
});

test("deriveTakeProfitCloid: same (pool, milestone) always yields the same cloid", () => {
  assert.equal(deriveTakeProfitCloid(POOL_A, 3), deriveTakeProfitCloid(POOL_A, 3));
});

test("deriveTakeProfitCloid: different milestones on the same pool yield different cloids", () => {
  assert.notEqual(deriveTakeProfitCloid(POOL_A, 0), deriveTakeProfitCloid(POOL_A, 1));
});

test("deriveTakeProfitCloid: different pools at the same milestone yield different cloids", () => {
  assert.notEqual(deriveTakeProfitCloid(POOL_A, 0), deriveTakeProfitCloid(POOL_B, 0));
});

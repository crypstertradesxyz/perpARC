import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTopUp, computeLeverage } from "./positionSizing.js";

test("first open: zero existing size, all margin becomes equity", () => {
  const r = computeTopUp({
    markPrice: 100_000,
    currentEquity: 0,
    currentSizeBase: 0,
    addedMargin: 100,
    targetLeverage: 5,
  });
  // 5x on $100 equity = $500 notional = 0.005 BTC at $100k
  assert.equal(r.newEquity, 100);
  assert.equal(r.targetNotional, 500);
  assert.equal(r.additionalSizeBase, 0.005);
});

test("top-up snaps leverage back to target after price moves against a flat position", () => {
  // position opened at 5x, price has since drifted such that current notional
  // is still 0.005 BTC but equity eroded via unrealized loss
  const r = computeTopUp({
    markPrice: 100_000,
    currentEquity: 80, // was 100, lost $20 unrealized
    currentSizeBase: 0.005,
    addedMargin: 100,
    targetLeverage: 5,
  });
  // newEquity = 180, targetNotional = 900, currentNotional = 500 -> add 400/100k = 0.004
  assert.equal(r.newEquity, 180);
  assert.equal(r.currentNotional, 500);
  assert.equal(r.targetNotional, 900);
  assert.equal(r.additionalSizeBase, 0.004);
});

test("no top-up needed if leverage is already at or above target after adding margin", () => {
  // position ran up hard: equity grew a lot relative to size, so even after
  // adding margin, current notional already exceeds target notional
  const r = computeTopUp({
    markPrice: 100_000,
    currentEquity: 1000,
    currentSizeBase: 0.05, // $5,000 notional
    addedMargin: 10,
    targetLeverage: 5, // target notional = (1000+10)*5 = 5050, still just above 5000
  });
  assert.ok(r.additionalSizeBase > 0);

  const r2 = computeTopUp({
    markPrice: 100_000,
    currentEquity: 1000,
    currentSizeBase: 0.06, // $6,000 notional, already above target even pre-margin
    addedMargin: 10,
    targetLeverage: 5,
  });
  assert.equal(r2.additionalSizeBase, 0, "must not attempt to reduce size on a top-up");
});

test("rejects non-positive markPrice or targetLeverage", () => {
  assert.throws(() =>
    computeTopUp({ markPrice: 0, currentEquity: 1, currentSizeBase: 0, addedMargin: 1, targetLeverage: 5 })
  );
  assert.throws(() =>
    computeTopUp({ markPrice: 100, currentEquity: 1, currentSizeBase: 0, addedMargin: 1, targetLeverage: 0 })
  );
});

test("computeLeverage matches notional/equity", () => {
  assert.equal(computeLeverage(0.005, 100_000, 100), 5);
  assert.equal(computeLeverage(1, 100, 0), Infinity);
});

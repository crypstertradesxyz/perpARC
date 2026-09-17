import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTakeProfit, nextTriggerMultiple, takeProfitProgress } from "./takeProfit.js";

test("first TP is 10% at 1.30x", () => {
  const decision = evaluateTakeProfit(
    { contributedMarginUsd: 100, completedMilestones: 0 },
    130,
    2
  );
  assert.equal(decision?.triggerMultiple, 1.3);
  assert.equal(decision?.closeSizeBase, 0.2);
});

test("each completed milestone raises the trigger by 0.10x", () => {
  assert.equal(nextTriggerMultiple(0), 1.3);
  assert.equal(nextTriggerMultiple(1), 1.4);
  assert.equal(nextTriggerMultiple(7), 2);
});

test("does not trigger below the next milestone", () => {
  assert.equal(evaluateTakeProfit({ contributedMarginUsd: 100, completedMilestones: 2 }, 149.99, 2), null);
});

test("new contributions do not move an active milestone's profit goal", () => {
  const state = { contributedMarginUsd: 160, activeMilestoneBasisUsd: 100, completedMilestones: 0 };
  assert.equal(evaluateTakeProfit(state, 189.99, 1), null);
  assert.ok(evaluateTakeProfit(state, 190, 1));
});

test("never acts without tracked capital and an open position", () => {
  assert.equal(evaluateTakeProfit({ contributedMarginUsd: 0, completedMilestones: 0 }, 100, 1), null);
  assert.equal(evaluateTakeProfit({ contributedMarginUsd: 100, completedMilestones: 0 }, 130, 0), null);
});

test("10x long first milestone estimates a 3% underlying move", () => {
  const progress = takeProfitProgress(
    { contributedMarginUsd: 100, completedMilestones: 0 },
    100,
    10,
    100,
    true
  );
  assert.equal(progress?.triggerEquityUsd, 130);
  assert.equal(progress?.estimatedTriggerPrice, 103);
  assert.ok(Math.abs((progress?.distanceFromMarkPct ?? 0) - 3) < 1e-9);
});

test("completed TP advances the public progress to the next milestone", () => {
  const progress = takeProfitProgress(
    { contributedMarginUsd: 100, completedMilestones: 1 },
    120,
    10,
    100,
    true
  );
  assert.equal(progress?.triggerMultiple, 1.4);
  assert.equal(progress?.estimatedTriggerPrice, 102);
  assert.equal(progress?.progressPct, 50);
});

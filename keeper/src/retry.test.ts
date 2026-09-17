import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "./retry.js";

test("withRetry: succeeds on the first attempt without retrying", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      return "ok";
    },
    { retries: 2, baseDelayMs: 1 },
    "test"
  );
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("withRetry: retries on failure and succeeds once the function does", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new Error(`fail ${calls}`);
      return "ok";
    },
    { retries: 2, baseDelayMs: 1 },
    "test"
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3); // 1 initial attempt + 2 retries
});

test("withRetry: exhausts retries and throws the last error", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls++;
          throw new Error(`fail ${calls}`);
        },
        { retries: 2, baseDelayMs: 1 },
        "test"
      ),
    /fail 3/
  );
  assert.equal(calls, 3); // 1 initial attempt + 2 retries, then gives up
});

test("withRetry: retries=0 means exactly one attempt, no retry", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls++;
          throw new Error("fail");
        },
        { retries: 0, baseDelayMs: 1 },
        "test"
      ),
    /fail/
  );
  assert.equal(calls, 1);
});

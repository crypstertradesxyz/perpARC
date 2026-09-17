/**
 * Generic retry-with-exponential-backoff helper. Pure aside from calling
 * `fn`/`console.warn`/a real timer, so it's straightforward to unit test
 * with a fake clock — see retry.test.ts.
 */

export interface RetryOptions {
  /** number of retries *after* the first attempt — 2 means up to 3 total attempts */
  retries: number;
  baseDelayMs: number;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < opts.retries) {
        const delayMs = opts.baseDelayMs * 2 ** attempt;
        console.warn(`[keeper] ${label} failed (attempt ${attempt + 1}/${opts.retries + 1}), retrying in ${delayMs}ms`, err);
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

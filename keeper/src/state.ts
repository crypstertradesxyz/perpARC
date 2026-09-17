/**
 * On-disk persistence, keyed by token address. Two concerns live here:
 *
 * 1. `pendingBridge` -- if the process crashes after a CCTP burn succeeds
 *    but before the Arbitrum mint confirms, a naive "just retry the sweep"
 *    on the next poll tick would burn a SECOND, separate amount instead of
 *    finishing the first one (CCTP's mint is idempotent per-message, but
 *    nothing stops initiating a brand new burn). Persisting the burn's
 *    message/txHash means a resumed run finishes the same in-flight
 *    transfer instead of starting another.
 * 2. `takeProfit` -- reserved for when position-lifecycle management
 *    (fundPosition/maybeTakeProfit, using the already-ported takeProfit.ts/
 *    positionSizing.ts) is wired in; not yet written to as of this file.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Address, Hex } from "viem";
import type { TakeProfitState } from "./takeProfit.js";
import { config } from "./config.js";

export interface PendingBridge {
  amountRaw6: string; // bigint as string, for JSON-safety
  arcBurnTxHash: Hex;
  message: Hex;
  createdAt: string;
}

interface PersistedState {
  version: 1;
  tokens: Record<
    string,
    {
      takeProfit?: TakeProfitState;
      pendingBridge?: PendingBridge;
    }
  >;
}

const EMPTY_STATE: PersistedState = { version: 1, tokens: {} };

export class KeeperStateStore {
  private constructor(
    private readonly path: string,
    private data: PersistedState
  ) {}

  static async open(path: string = config.stateFilePath): Promise<KeeperStateStore> {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as PersistedState;
      if (parsed.version !== 1 || !parsed.tokens) throw new Error("unsupported keeper state format");
      return new KeeperStateStore(path, parsed);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return new KeeperStateStore(path, structuredClone(EMPTY_STATE));
    }
  }

  getPendingBridge(token: Address): PendingBridge | undefined {
    return this.data.tokens[token.toLowerCase()]?.pendingBridge;
  }

  async setPendingBridge(token: Address, pending: PendingBridge): Promise<void> {
    const key = token.toLowerCase();
    this.data.tokens[key] = { ...this.data.tokens[key], pendingBridge: pending };
    await this.flush();
  }

  async clearPendingBridge(token: Address): Promise<void> {
    const key = token.toLowerCase();
    if (this.data.tokens[key]) delete this.data.tokens[key].pendingBridge;
    await this.flush();
  }

  private async flush(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, this.path);
  }
}

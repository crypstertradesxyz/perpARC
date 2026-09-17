/**
 * Reads the pairing records site/server.js writes to
 * site/data/pairings.json. Deliberately a shared flat file, not a database
 * or an on-chain registry -- this integration is expected to start small,
 * and a keeper reading the same file the pairing endpoint writes is
 * simpler than standing up a second service or a contract for it. If
 * pairing volume grows, this is the seam to replace with a real datastore
 * without touching anything downstream of loadPairings().
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Address } from "viem";
import { config } from "./config.js";

export interface Pairing {
  tokenAddress: Address;
  tokenSymbol: string;
  asset: string;
  isLong: boolean;
  leverage: number;
  contact: string;
  depositAddress: Address;
  createdAt: string;
  updatedAt: string;
}

export async function loadPairings(): Promise<Pairing[]> {
  const resolved = path.resolve(process.cwd(), config.pairingsFilePath);
  try {
    const raw = await readFile(resolved, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Pairing>;
    return Object.values(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

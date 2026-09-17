/**
 * Poll loop: for every paired token, best-effort claim from Argus
 * (argus.ts -- see its header for why this often can't succeed under the
 * current pairing model), then sweep whatever balance is actually sitting
 * at the deposit address regardless of how it got there (sweep.ts). This
 * second half is what makes "regularly processing fees" true even when
 * the first half can't be automated.
 *
 * Position-lifecycle management (opening/topping-up/take-profit on
 * Hyperliquid once capital lands there) is NOT wired in yet -- the pieces
 * are ported and ready (positionSizing.ts, takeProfit.ts, hyperliquid.ts)
 * but nothing in this file calls them yet. See README.md "What's wired vs
 * not".
 */

import { config } from "./config.js";
import { loadPairings } from "./pairingRegistry.js";
import { deriveTokenAccount } from "./derivedAccount.js";
import { tryClaimArgusFees } from "./argus.js";
import { sweepToken } from "./sweep.js";
import { KeeperStateStore } from "./state.js";

async function pollOnce(stateStore: KeeperStateStore): Promise<void> {
  const pairings = await loadPairings();
  if (pairings.length === 0) {
    console.log("[keeper] no pairings found yet");
    return;
  }

  for (const pairing of pairings) {
    const account = deriveTokenAccount(pairing.tokenAddress);
    if (account.address.toLowerCase() !== pairing.depositAddress.toLowerCase()) {
      console.error(
        `[keeper] DERIVATION MISMATCH for ${pairing.tokenAddress}: computed ${account.address}, ` +
          `pairing record says ${pairing.depositAddress}. Skipping -- see derivedAccount.ts header, ` +
          `this means PAIRING_DERIVATION_SECRET here doesn't match site/server.js's.`
      );
      continue;
    }

    try {
      const claimResult = await tryClaimArgusFees(account, pairing.tokenAddress);
      if (claimResult.outcome === "claimed") {
        console.log(`[keeper] claimed Argus fees for ${pairing.tokenSymbol} (${pairing.tokenAddress})`);
      }

      const sweepResult = await sweepToken(account, pairing.tokenAddress, stateStore);
      if (sweepResult.swept) {
        console.log(
          `[keeper] swept ${pairing.tokenSymbol}: $${sweepResult.buybackAmountUsdc} -> buyback, ` +
            `$${sweepResult.positionAmountUsdc} -> ${pairing.asset} ${pairing.isLong ? "long" : "short"} ${pairing.leverage}x`
        );
      } else {
        console.log(
          `[keeper] ${pairing.tokenSymbol}: $${sweepResult.balanceUsdc.toFixed(2)} pending (below $${config.sweepMinUsdc} threshold)`
        );
      }
    } catch (err) {
      console.error(`[keeper] error processing ${pairing.tokenSymbol} (${pairing.tokenAddress})`, err);
    }
  }
}

async function main() {
  console.log(`[keeper] starting -- DRY_RUN=${config.dryRun}, poll interval ${config.pollIntervalMs}ms`);
  if (config.dryRun) {
    console.log("[keeper] DRY_RUN is on: no on-chain writes will be broadcast, only logged.");
  }

  const stateStore = await KeeperStateStore.open();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await pollOnce(stateStore).catch((err) => console.error("[keeper] poll tick failed", err));
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

main();

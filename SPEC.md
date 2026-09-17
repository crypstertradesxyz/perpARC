# PerpArc — Spec

Platform that launches tokens on **Arc** (Circle's USDC-native L1, chain id `5042`, mainnet live 2026-09-16) through the third-party launchpad **Argus** (argus.world), redirects a slice of every launch's Argus creator-fee share to us, and uses it to fund an isolated leveraged position on Hyperliquid per token — the same core model as [[Longshot]] (Robinhood Chain, own launch contracts), adapted for a launchpad we don't own.

## Core concept

We don't build a launchpad, an AMM, or a token contract. Argus already provides all of that. We build:

1. **`PerpArcVault.sol`** — an on-chain contract that launches tokens *through* Argus's `Portal.createLaunch()`, becoming that launch's immutable Argus `creator` (and therefore the only address able to ever claim its creator fee share).
2. A **keeper** (forked from Longshot's) that pulls each token's accrued USDC out of Argus, splits it 80/20, funds a Hyperliquid position with the 80%, and forwards the 20% to a buyback wallet.

Per launch, fixed forever at launch time (same permanence model as Longshot):

| Parameter | Example |
|---|---|
| Underlying Hyperliquid asset | Any live Hyperliquid perp (BTC, ETH, SOL, ...) |
| Direction | Long / short |
| Leverage multiple | e.g. 5x |

## Why Argus, and what it does for us

Argus (`arguspad/argus-world`, Uniswap v4 hooks) handles, per launch, in one `Portal.createLaunch()` transaction: token mint, v4 pool creation, single-sided full-supply liquidity position (permanently locked), and a buy/sell tax hook (1–10% per side) that routes every taxed swap's USDC into a `RevenueSplitter`. That splitter takes **10% to Argus's own treasury**, then splits the remaining 90% across up to 4 creator-configurable buckets (`creatorFunds` / `buybackBurn` / `dividends` / `liquidity`, must sum to 100%).

**We use exactly one of those four buckets: `creatorFunds`, set to 100%.** The `buybackBurn`/`dividends`/`liquidity` buckets exist in Argus but are not used here — `buybackBurn` in particular has no verified on-chain execution path (see "Verification" below), so rather than depend on it we do our own 80/20 split ourselves, in our own contract, immediately after claiming the single well-defined `creatorFunds` bucket.

**Verification status (2026-09-17):** the mechanics above come from reading `arguspad/argus-world` on GitHub, which reads like a reference/documentation mirror (admitted simplifications in its own comments — e.g. `buybackBurn` funds are tracked via an event only, with no transfer or claim path shown) rather than confirmed 1:1 with the verified bytecode at Argus's mainnet `Portal` (`0xB021Be536808f551b31789422Fd28a6c9c6e97Da`). **Before any real launch, pull the verified source for `Portal`/`RevenueSplitter`/`LaunchHook` off Arcscan and confirm**: `createLaunch()`'s exact parameter shape, that `RevenueSplitter.claim()` behaves as read here, and that `quoteAsset` can be set to Arc's native USDC. Deploy scripts should fail loudly rather than silently if these don't match.

## Fee split (ours, not Argus's)

Of the `creatorFunds` bucket we claim from Argus (which is already net of Argus's 10%):

| Share | Purpose |
|---|---|
| 80% | Position capital — margin for the token's leveraged Hyperliquid position |
| 20% | Sent to a fixed buyback wallet (plain EOA/multisig) — **no automated swap/burn in v1**, manual for now |

## Contracts

| Contract | Role |
|---|---|
| `PerpArcVaultFactory.sol` | Owns the Hyperliquid asset/leverage allowlist (`maxLeverageForAsset`, synced from Hyperliquid's live catalog — same pattern as Longshot's `syncAssetAllowlist.ts`). `deployRelay(...)` validates asset/leverage, then deploys a per-token `PerpArcRelay`, whose constructor itself calls Argus's `Portal.createLaunch()` — one transaction, relay becomes creator from block one. Owner/keeper-gated for now (not open to arbitrary callers — see "Design decisions"). |
| `PerpArcRelay.sol` | One per launched token. Holds `asset`/`isLong`/`leverage`/`realCreator`/Argus `splitter` address as immutables. `collectFees()` (permissionless) calls `RevenueSplitter.claim(address(this), USDC)`, splits the proceeds 80/20 in the same call, sends the 20% straight to the buyback wallet, credits the 80% to `pendingPosition`. `sweepPositionCapital(to)` (keeper-only) drains `pendingPosition` to the keeper for bridging. Modeled directly on Longshot's `PonsFeeRelay.sol`. |

No `LaunchedToken`/`LaunchPool`/AMM contracts of our own — Argus's `Portal` owns all of that.

## Funding flow

1. `PerpArcRelay.collectFees()` claims USDC from Argus, splits 80/20, forwards the 20% to the buyback wallet immediately, credits `pendingPosition` with the 80%.
2. Once `pendingPosition` crosses the USD funding threshold (same $50-style default as Longshot), keeper calls `sweepPositionCapital()` and receives that token's slice as USDC on Arc.
3. **Bridge leg — needs verification, not yet chosen.** Arc's quote asset is already USDC, so (unlike Longshot's WETH→USDG swap on Robinhood Chain) there's no swap step before bridging. Two candidate routes:
   - **Across**, if/when it lists Arc as a source chain (Arc launched 2026-09-16; check `/api/available-routes` before relying on this — may not be listed yet).
   - **Circle CCTP** (Arc has native CCTP support to 20+ chains including Arbitrum) as a fallback: burn USDC on Arc, mint on a CCTP-supported chain, then reuse whatever last-mile hop Longshot's keeper already uses to land funds as Hyperliquid margin (that logic is unchanged either way).
   Pick whichever is live and confirmed working at implementation time; keep the interface (`bridgeToHyperliquid(amount, poolAccount)`) the same regardless of which one backs it, so the choice doesn't leak into the rest of the keeper.
4. Funds land in the token's own derived Hyperliquid account (`keccak256(HYPERLIQUID_DERIVATION_SECRET || token)` — same derivation scheme as Longshot's `hyperliquidPoolAccount.ts`) and fund/top-up the position there.

## Position lifecycle, take-profit, liquidation

**Unchanged from Longshot — ported as-is, no chain-specific logic in this layer:**

- Isolated margin, one dedicated Hyperliquid account per token (not per asset, not shared).
- Sizing rule on top-up: add exactly enough size so leverage snaps back to the creator's target multiple at the current mark price.
- TP ladder: first 10% reduce-only close at 1.30× cumulative contributed margin, then another 10% at each further 0.10× milestone, at most one milestone per keeper poll. Realized (not unrealized) profit only.
- TP proceeds: bridge back to Arc, buy back the launched token against its own Argus v4 pool, burn. **Needs a v4-compatible swap router on Arc** (Argus's pool is v4 with a hook — confirm whether Argus exposes a router, or whether we call the `PoolManager` directly through the hook's expected calldata shape; this is new relative to Longshot's plain V3 `sellForEth`/`buyWithEth`).
- Liquidation: reopen at the same original asset/direction/leverage; loss simply eaten; the 20% buyback-wallet stream is unaffected (it isn't tied to Hyperliquid position state at all in this design, unlike Longshot's airdrop bucket which shared the same fee-split accounting).

## Roles

| Role | Powers |
|---|---|
| `keeper` | Calls `sweepPositionCapital` on any relay; the only party that moves position capital onward. Rotatable on `PerpArcVaultFactory`. |
| Factory owner | Sets `maxLeverageForAsset`; gates who can call `deployRelay` (see "Design decisions" — permissionless launch is a deliberate later step, not v1). |

`collectFees()` is permissionless on every relay (same as Longshot's `LaunchPool.collectFees()`) — it only ever realizes fees Argus already credited, so there's no reason to gate it.

## Design decisions

- **Owner-gated launch, not permissionless, in v1.** Argus's mainnet contracts are one day old as of this spec and unverified against source read off GitHub rather than Arcscan. A fully open `deployRelay()` (any caller can launch and register any asset/leverage) is the natural v2 once Argus's real behavior — especially the `buybackBurn` bucket and whether `creator` can ever be reassigned — is confirmed on-chain. Gating it now avoids building the permission/allowlist surface twice.
- **We don't use Argus's native `dividends`/`buybackBurn`/`liquidity` buckets.** All of Argus's 90% creator share goes to `creatorFunds`; the 80/20 position/buyback split happens in our own `PerpArcRelay`, not in Argus's `RevenueSplitter`. This trades away Argus's built-in (if unverified) holder-dividend UX for a design with exactly one dependency on Argus's contract surface (`claim()`), which is also the one bucket whose mechanics are actually confirmed in what we've read.
- **No automated buyback/burn on the 20% bucket in v1** — explicit product decision (2026-09-17): funds land in a plain wallet, spent/swapped/burned manually until that flow is validated, then can be automated later without changing the on-chain relay (the relay only needs the destination address, not the logic that spends it).
- **Bridge route intentionally left open** — Arc is one day old; committing to CCTP vs. Across before checking which one actually has a live route would be guessing. Isolate the choice behind one function so it's a keeper-config change, not a redesign, whichever way it lands.

## Open questions / unverified

- Real Argus `Portal`/`RevenueSplitter`/`LaunchHook` source on Arcscan, vs. the GitHub reference read for this spec.
- Whether `quoteAsset` in `createLaunch()` must be Arc's canonical USDC address or can be arbitrary (we need it to be USDC either way — confirm the canonical address).
- Live bridge route Arc → Hyperliquid margin (Across listing vs. CCTP + last-mile hop).
- Whether Argus exposes a swap router usable for our own TP-buyback leg against a v4 pool with a hook attached, or whether that needs a raw `PoolManager` call.

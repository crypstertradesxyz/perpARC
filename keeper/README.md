# PerpArc keeper

Off-chain service that watches every paired token's deposit address, sweeps
accrued USDC 80/20 (position capital / buyback), bridges the position share
toward Hyperliquid via CCTP, and (eventually) manages each token's isolated
leveraged position there. See `../SPEC.md` for the product-level design.

## Run it

```bash
npm install
cp .env.example .env   # fill in real values
npm run dev            # tsx, no build step, DRY_RUN=true by default
```

`DRY_RUN=true` (the default) logs every action it *would* take without
broadcasting anything -- nothing here has moved real funds yet (see
"What's verified vs. assumed" below). Only set `DRY_RUN=false` once you've
read that section.

## How it works

Every `POLL_INTERVAL_MS` (default 60s), for each record in
`../site/data/pairings.json`:

1. Re-derives that token's account (`derivedAccount.ts` -- the exact same
   `keccak256(secret || tokenAddress)` formula `site/server.js` used to
   generate the address in the first place) and hard-fails loudly if it
   doesn't match the pairing record's `depositAddress` -- that would mean
   this keeper's `PAIRING_DERIVATION_SECRET` disagrees with the site's, and
   continuing would watch/fund the wrong wallet.
2. Attempts `RevenueSplitter.claim()` from that account (`argus.ts`) --
   **read that file's header before assuming this automates fee collection
   from Argus.** It only succeeds if the token's team has somehow made this
   account Argus's `creator` for their launch, which the pairing flow as
   built doesn't arrange (see "What's wired vs. not").
3. Checks the account's real Arc USDC balance (`arcUsdc.ts`, at the ERC-20
   interface's 6 decimals -- **not** `eth_getBalance`, which reports the
   same funds at 18 decimals, confirmed against two independent sources).
4. Above `SWEEP_MIN_USDC` (default $50): sends 20% to
   `BUYBACK_WALLET_ADDRESS`, then bridges the other 80% Arc -> Arbitrum via
   real Circle CCTP v2 (`cctp.ts`) and on to Hyperliquid's Arbitrum bridge
   contract (`hyperliquidDeposit.ts`).

A crash between the CCTP burn and the Arbitrum mint resumes from a
persisted `PendingBridge` record (`state.ts`) instead of either losing
track of the burned funds or re-burning a second batch -- see `sweep.ts`.

## What's wired vs. not

**Wired and unit-tested:** the ported chain-agnostic pieces
(`hyperliquidWire.ts`/`positionSizing.ts`/`takeProfit.ts`/`retry.ts`/
`hyperliquid.ts` -- all carried over from Longshot's keeper, where they
already have their own test coverage) plus the new Arc-specific pieces
(`derivedAccount.ts`, `arcUsdc.ts`, `pairingRegistry.ts`).

**Wired and confirmed against live infrastructure, but not with real
funds:** the full poll loop, run against real Arc RPC and a real (empty)
paired token -- correctly derives the address, matches it against the
pairing record, queries live balance, and reports "pending" below
threshold. `/api/token`-style ERC-20 reads and the derivation-match check
are the parts actually exercised live here.

**Built but genuinely unverified -- do not trust with real funds without
independently re-confirming:**
- `cctp.ts`: real Circle CCTP v2 contract addresses and call shapes, but no
  live burn/mint round trip has been run through this code. Re-verify
  Arc's CCTP support is live on *mainnet* (not just testnet) before
  `DRY_RUN=false`.
- `hyperliquidDeposit.ts`: the classic Arbitrum-bridge deposit pattern,
  confirmed from documentation/onboarding-guide consensus, not from
  watching a real balance land on Hyperliquid via this specific code path.
- `argus.ts`: whether a token's Argus `creator` role can ever point at a
  PerpArc-derived account at all. If Argus's real (Arcscan-verified, not
  the GitHub reference this was built against) contract has no
  reassignment mechanism, this permanently returns `not-authorized` for
  every pairing, and the landing page's "we do the rest" framing needs
  revising for the claiming half of the flow specifically.

**Not wired at all yet:** opening/topping-up/take-profit on the actual
Hyperliquid position once capital lands there. `positionSizing.ts`/
`takeProfit.ts`/`hyperliquid.ts` are ported and tested in isolation, but
nothing in `index.ts` calls them -- capital currently lands in Hyperliquid
margin and stops there. This is the next piece of work.

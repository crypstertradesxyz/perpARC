# ArcPerp site

Marketing page (`index.html`) + an automated pairing endpoint (`pair.html` +
`server.js`) that generates a deposit wallet address for a token instantly,
with no human in the loop.

## Run it

```bash
npm install
npm start
# http://127.0.0.1:8090
```

## How pairing works

`POST /api/pair` takes `{tokenAddress, tokenSymbol, asset, direction, leverage, contact?}`,
validates it, and derives a deposit address as:

```
privateKey = keccak256(secret || tokenAddress)
address    = privateKeyToAccount(privateKey).address
```

The same scheme Longshot's keeper already uses per-pool
(`keccak256(HYPERLIQUID_DERIVATION_SECRET || pool)`), with the paired
token's own address standing in for "pool" -- ArcPerp doesn't deploy a
contract per pairing under this model, so the token address is the only
stable per-pairing identifier available.

This makes the endpoint **idempotent and stateless-safe**: the same token
always derives the same address, so a duplicate request (or a request that
updates the asset/direction/leverage later) never orphans funds already
sent to the first address. The pairing record itself (which asset/side/
leverage a token wants) is still persisted to `data/pairings.json` so a
keeper can enumerate what to watch and manage.

## Custody model

**The derivation secret is the whole security model.** Anyone who has it
can derive the private key for every deposit address ever handed out, past
or future -- this is centralized custody, not a smart-contract wallet or
MPC setup. Two real bars to clear before this handles real funds:

1. `PAIRING_DERIVATION_SECRET` must come from a real secrets manager in
   production, injected as an environment variable -- never written to disk
   as plaintext, never in git.
2. Absent that env var, `server.js` generates a random secret on first run
   and persists it to `.dev-secret` (gitignored) purely so addresses stay
   stable across local restarts. That file is explicitly **not** meant to
   survive a real deployment; losing it, or ever exposing it, invalidates
   every address already communicated to a token's team.

Nothing here does anything with received funds yet -- there's no keeper
watching these addresses, bridging balances, or opening Hyperliquid
positions. `server.js` only hands out the address and records what was
requested. Building that keeper is the next piece of work (see
`../SPEC.md` and the in-progress `ArcPerpVaultFactory`/`ArcPerpRelay`
contracts, which predate this pairing model and describe a different,
launch-it-ourselves flow -- SPEC.md needs reconciling with this simpler
"generate a wallet, you redirect your own claim" model before either is
built further).

## Static file serving

`server.js` serves exactly three files by an explicit path allowlist
(`/index.html`, `/pair.html`, `/style.css`) -- not by file extension. An
earlier version allowlisted `.js`/`.html`/etc. by extension and it happily
served `server.js` itself back to any requester. Extension-based allowlists
don't distinguish "safe to serve" from "safe-looking name"; only an
explicit per-path list does.

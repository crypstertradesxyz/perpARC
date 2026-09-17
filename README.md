# PerpArc

Autonomous fee redirection into leveraged Hyperliquid perpetuals for **Coinbarrel** and **Argus World** tokens on **Arc Mainnet** (`Chain ID 5042`).

Every trade fee on your token's pool is automatically routed:
- **80%** into an isolated, leveraged perpetual position on Hyperliquid L1 (ETH, BTC, SOL, HYPE, or any market up to 50x) via Circle CCTP v2.
- **20%** into an automated buyback wallet.

---

## Quick Start (Local)

```bash
npm install
npm start
# Server running at http://localhost:8090
```

---

## Deploy to Railway

This repository is pre-configured and Railway-ready (`railway.json`, `Procfile`, and dynamic `PORT`/`HOST` binding).

1. Go to [Railway.app](https://railway.app)
2. Click **New Project** &rarr; **Deploy from GitHub repo**
3. Select `crypstertradesxyz/perpARC`
4. Click **Deploy Now**
5. Under **Settings** &rarr; **Networking**, click **Generate Domain** to get a public URL.

### Optional Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port to listen on | `8090` (Railway injects automatically) |
| `HOST` | Bind host address | `0.0.0.0` |
| `ARC_RPC_URL` | Arc Mainnet RPC endpoint | `https://rpc.arc-scan.org` |
| `PAIRING_DERIVATION_SECRET` | 32-byte hex secret for deterministic wallet derivation | Auto-generated locally |

---

## Architecture

- **`site/`**: Interactive UI and pairing API
  - `index.html`: Hero with dynamic arc trajectory canvas and network metrics
  - `pair.html`: 3-step pairing wizard supporting Coinbarrel & Argus World with 150+ Hyperliquid perps
  - `explore.html`: Token directory with instant search, multi-filters, table/grid views, and simulator
  - `server.js`: Zero-dependency Node.js HTTP server + deterministic address derivation via `viem`
- **`keeper/`**: Automated execution agent (polls Arc launchpads, bridges USDC via CCTP, manages Hyperliquid orders)


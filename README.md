# Polymarket → Discord trade alerts

Watch a curated list of Polymarket wallets and post each new trade to Discord —
the amount, the trade, the market, and the wallet — with one channel per trader.

```
Polymarket Data API  ──►  this script (always-on)  ──►  Discord webhooks
   (/activity, public)        polls every ~15s            one per channel
```

It posts an embed styled like:

> **spartachio just bet $109.92**
> **BUY** Yakult Brothers @ 30¢ · +234 · 3.34
> 🎯 Open market on Polymarket
> **Market** Dota 2: Yakult Brothers vs Vici Gaming — Game 1 Winner
> **Size** $109.92 (367 shares)  **Wallet** spartachio — full record

## Why polling (not WebSocket)?

The Polymarket `/activity` endpoint is public, documented, and stable. On an
always-on host there's no per-execution billing, so polling every 15s is free
and far more robust than reverse-engineering the live WebSocket. Latency is
~15s, which is fine for "just bet" alerts. (A WebSocket upgrade can be added
later for sub-second latency.)

## 1. Get your wallets

Find traders on the [leaderboard](https://polymarket.com/leaderboard) (sort by
**Profit / Month** for skill). Open a trader's profile — the `0x…` in the URL
`polymarket.com/profile/0x…` is the **proxy wallet** you need.

## 2. Make a Discord webhook per channel

In each channel: **Edit Channel → Integrations → Webhooks → New Webhook → Copy
Webhook URL**. The webhook's name/avatar is what shows as the sender — no bot
token required.

## 3. Configure

```bash
cp wallets.example.json wallets.json
```

Edit `wallets.json` — one entry per trader, each pointing at its channel webhook:

```json
{
  "pollIntervalMs": 15000,
  "wallets": [
    { "address": "0xabc…", "name": "spartachio", "webhookUrl": "https://discord.com/api/webhooks/…" }
  ]
}
```

You can also set a single `defaultWebhookUrl` (or `DEFAULT_WEBHOOK_URL` env var)
to send everything to one feed channel.

## 4. Run locally

Requires Node 20+.

```bash
# fire a sample alert into a channel to check the look:
PREVIEW_WEBHOOK_URL="https://discord.com/api/webhooks/…" npm run test:embed

# start watching for real:
npm start
```

On first sight of a wallet the script records a baseline and only alerts on
trades that happen *after* startup (set `POST_HISTORICAL_ON_START=true` to also
post recent existing trades once).

## 5. Deploy to Railway (always-on, ~$5/mo)

This needs a host that keeps a process running 24/7 — **serverless platforms
like Vercel/Netlify won't work** (they sleep between requests).

1. Push this folder to a GitHub repo.
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**.
3. Railway auto-detects Node and runs `npm start`.
4. **Variables** tab → add `DEFAULT_WEBHOOK_URL` and any others from
   [`.env.example`](./.env.example). (You can keep per-wallet webhooks in
   `wallets.json` instead — but note `wallets.json` is gitignored, so either
   commit a version without secrets or supply wallets via env/volume.)
5. **(Recommended)** Add a **Volume** mounted at `/data` and set
   `STATE_FILE=/data/state.json` so redeploys don't replay old trades.

Free alternatives: Oracle Cloud Free Tier VM, Fly.io, Render, or a Raspberry Pi
at home — anything that runs `npm start` continuously.

## Config reference

| Env var | Default | Purpose |
|---|---|---|
| `DEFAULT_WEBHOOK_URL` | — | Fallback webhook for wallets without their own |
| `POLL_INTERVAL_MS` | `15000` | How often to check each wallet |
| `POST_HISTORICAL_ON_START` | `false` | Post existing trades on first run |
| `WALLETS_FILE` | `./wallets.json` | Path to the wallets config |
| `STATE_FILE` | `./.state.json` | Where seen-trade state is persisted |
| `ACTIVITY_LIMIT` | `20` | Recent activities pulled per wallet per poll |

## Files

| File | Role |
|---|---|
| `src/index.js` | Poll loop + dedupe orchestration |
| `src/polymarket.js` | Data API calls (`/activity`, leaderboard helper) |
| `src/discord.js` | Embed builder + webhook POST (handles 429s) |
| `src/format.js` | Price → cents/odds, names, URLs |
| `src/state.js` | Persisted "already posted" store |
| `src/preview.js` | Send/print a sample alert |

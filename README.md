# Polymarket → Discord Alerts

Watch a curated list of Polymarket traders and post every qualifying bet to Discord —
amount, side + odds, market, size, wallet, and the trader's recent PnL — auto-sorted into
per-sport channels, with a cross-category whale feed.

## Features

- **Verified-profitable wallets** — ranked by each trader's real profile PnL (the number on
  their Polymarket profile graph), not the unreliable leaderboard figure.
- **Per-sport channels** — each trade is routed by Polymarket's market tags.
- **🐳 Whale Alerts** — any bet ≥ $5,000 also posts to a dedicated whale channel.
- **Filters** — BUYS only + minimum bet size (defaults: buys-only, $100).
- **Rich cards** — ¢ + American/decimal odds, size in $/shares, last-7d & last-14d PnL.
- **Reliable** — de-dupes by tx, persists state immediately, rate-limit queue, runs 24/7.

## How it works
Polymarket Data API -> this bot (always-on) -> Discord webhooks
/activity (trades) polls ~every 20s one per sport channel
/user-pnl (PnL) filters + routes + a whale channel
Gamma /events (tags) de-dupes by tx

## Secrets policy
**No secrets live in this repo.** All Discord webhooks are supplied via environment
variables (see `.env.example`). `wallets.json` holds only public wallet addresses/names.
Locally, copy `.env.example` to `.env` (gitignored); in production, set them in your host's
Variables. Never commit real webhook URLs.
## Deploy your own (fork-friendly)

This repo contains **no secrets** — everything sensitive is an environment variable, so
running your own copy is pure configuration with **zero code changes**:

1. Fork or clone the repo.
2. Create your Discord channels and a webhook for each (one per sport, one whale, one
   catch-all "other").
3. Set the webhook **environment variables** in your host (Railway -> Variables):
   `DEFAULT_WEBHOOK_URL`, `WHALE_WEBHOOK_URL`, and a `CHANNEL_<SPORT>` for each channel.
4. Run `npm run pick-wallets` to fill `wallets.json`, then deploy. Thats it.

See **Configuration reference** below for the full list of variables.

## Quick start
Prerequisites: Node 20+, a Discord server you can add webhooks to.
1. **Pick wallets** (ranked by verified 30-day PnL):
   ```bash
   npm run pick-wallets -- --minVol=250000 --minPnl=10000 --limit=20
Flags: --minVol, --minPnl, --window (1d|7d|30d|all), --limit, --orderBy.
2. Create Discord webhooks — one per sport channel, one for whale, one catch-all
("other"). Edit Channel → Integrations → Webhooks → New → Copy URL.
3. Set env vars — copy .env.example to .env and fill in the webhook URLs
(DEFAULT_WEBHOOK_URL, WHALE_WEBHOOK_URL, CHANNEL_SOCCER, …).
4. Run: npm start. First run baselines each wallet and only alerts on new trades.

Add a category by creating a channel + CHANNEL_<NAME> env var and a rule in
src/categories.js.

Configuration reference
wallets.json: pollIntervalMs, wallets ([{ address, name }]).

Environment variables:

Variable	Default	Purpose
DEFAULT_WEBHOOK_URL	—	Catch-all "other" channel (required if no channels set)
WHALE_WEBHOOK_URL	—	Whale-alert channel
CHANNEL_<NAME>	—	One per sport channel, e.g. CHANNEL_SOCCER
MIN_BET_USD	100	Minimum bet size (numbers only — no $)
WHALE_MIN_USD	5000	Whale threshold
BUYS_ONLY	true	false to also alert on sells
POLL_INTERVAL_MS	20000	Poll frequency
STATE_FILE	./.state.json	State path (mount a volume here in prod)
POST_HISTORICAL_ON_START	false	true to post recent history on first run
Deploy (Railway)
Needs an always-on host (serverless like Vercel won't work).

Push to GitHub → New Project → Deploy from GitHub repo. It runs npm start.
Variables: add all the webhook env vars + any filter overrides.
Volume: set STATE_FILE=/data/state.json and mount a volume at /data.
Settings → Deploy → Teardown = ON, and run exactly one deployment of this repo.
Two services/projects (or a stray local npm start) = every alert posted twice.
Maintenance
Refresh roster: re-run npm run pick-wallets …, commit, push.
Add a category: new channel + CHANNEL_<NAME> var + a rule in src/categories.js.
Tune filters: MIN_BET_USD / WHALE_MIN_USD / BUYS_ONLY env vars.
Troubleshooting
Duplicate cards → more than one bot running (second service/project, stray local
npm start, or deploy overlap). Same tx in the footer = a true dupe.
400 {"embeds":["0"]} → invalid embed (e.g. image URL with a space); image URLs are
URL-encoded to prevent this.
429 → handled by the global send queue + retries.
min bet $NaN → MIN_BET_USD must be a bare number (100, not $100).
Quiet → normal until a watched trader places a qualifying bet.
Project layout
File	Role
src/index.js	Poll loop, filters, routing, whale, dedupe
src/polymarket.js	Data API: activity, leaderboard, PnL, market tags
src/categories.js	Market tags → sport channel rules
src/discord.js	Embed builder + rate-limited sender
src/format.js	Price → cents/odds, names, URLs
src/state.js	Persisted "already posted" store
src/config.js	Loads wallets.json + env (webhooks)
src/pick-wallets.js	Generates the wallet list from verified PnL
License
MIT

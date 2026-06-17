# Polymarket → Discord Alerts

Watch a curated list of Polymarket traders and post every qualifying bet to Discord —
amount, side + odds, market, size, wallet, and the trader's recent PnL — auto-sorted into
per-sport channels, with a cross-category whale feed.

---

## Features

- **Verified-profitable wallets** — ranked by each trader's real profile PnL (the number on
  their Polymarket profile graph), not the unreliable leaderboard figure.
- **Per-sport channels** — each trade is routed to the right channel using market tags.
- **🐳 Whale Alerts** — any bet ≥ $5,000 also posts to a dedicated whale channel.
- **📊 Daily PnL leaderboard** — a once-a-day summary ranking every watched wallet by its
  1-day PnL, posted to a dedicated summary channel (optional).
- **👁️ Personal watchlist + slash commands** — add one-off wallets on the fly from Discord
  with `/track`, drop them with `/untrack`, and list them with `/watchlist`. Watchlist trades
  post to their own channel and skip the roster's buys-only / category rules (only a small
  anti-dust minimum applies) (optional).
- **Filters** — BUYS only and a minimum bet size (defaults: buys-only, $100).
- **Rich cards** — price in ¢ + American/decimal odds, size in $/shares, last-7d & 14d PnL.
- **Reliable** — de-dupes by tx, persists state immediately, rate-limit queue, runs 24/7.

---

## How it works

The bot polls Polymarket's public API every ~20 seconds, filters and routes each new trade,
and posts it to the matching Discord webhook:

- `GET /activity` — each watched wallet's trades
- `GET /user-pnl` — the trader's recent PnL (the profile-graph numbers)
- Gamma `GET /events` — market tags, used to pick the sport channel

No API keys required, and de-duplication is keyed on each trade's transaction hash.

---

## No secrets in this repo

All Discord webhooks are supplied via **environment variables** (see `.env.example`).
`wallets.json` holds only public wallet addresses/names. Locally, copy `.env.example` to
`.env` (gitignored); in production, set them in your host's Variables. **Never commit real
webhook URLs.**

---

## Deploy your own (fork-friendly)

No code changes needed — it's pure configuration:

1. Fork or clone the repo.
2. Create your Discord channels and a webhook for each (one per sport, one whale, one
   catch-all "other").
3. Set the webhook environment variables in your host (`DEFAULT_WEBHOOK_URL`,
   `WHALE_WEBHOOK_URL`, and a `CHANNEL_<SPORT>` per channel).
4. Run `npm run pick-wallets` to fill `wallets.json`, then deploy. That's it.

---

## Quick start

**Prerequisites:** Node 20+, a Discord server you can add webhooks to.

**1. Pick wallets** (ranked by verified 30-day PnL):
npm run pick-wallets -- --minVol=250000 --minPnl=10000 --limit=20

Flags: `--minVol`, `--minPnl`, `--window` (`1d`/`7d`/`30d`/`all`), `--limit`, `--orderBy`.
**2. Create Discord webhooks** — one per sport channel, one for whale, one catch-all.
Edit Channel → Integrations → Webhooks → New → Copy URL.
**3. Set environment variables** — copy `.env.example` to `.env` and fill in the webhook URLs.
**4. Run:** `npm start`. The first run baselines each wallet and only alerts on new trades.
To add a category: create a channel + `CHANNEL_<NAME>` env var, and add a rule in
`src/categories.js`.
---
## Configuration
**`wallets.json`** holds only:
- `pollIntervalMs` — poll frequency
- `wallets` — a list of `{ "address": "0x…", "name": "…" }`
**Environment variables** (see `.env.example`):
- `DEFAULT_WEBHOOK_URL` — catch-all "other" channel (required if no channels are set)
- `WHALE_WEBHOOK_URL` — whale-alert channel
- `CHANNEL_<SPORT>` — one per sport channel, e.g. `CHANNEL_SOCCER`, `CHANNEL_ESPORTS`
- `SUMMARY_WEBHOOK_URL` — daily PnL leaderboard channel (optional; feature off if unset)
- `SUMMARY_HOUR_UTC` — hour of day (UTC, `0`–`23`) to post the leaderboard (default `12`)
- `WATCHLIST_WEBHOOK_URL` — `/track` watchlist channel (optional; falls back to default if unset)
- `MIN_BET_USD` — minimum bet size, numbers only (default `100`)
- `WHALE_MIN_USD` — whale threshold (default `5000`)
- `BUYS_ONLY` — `false` to also alert on sells (default `true`)
- `WATCHLIST_MIN_BET_USD` — anti-dust floor for watchlist trades (default `50`; `0` posts all)
- `POLL_INTERVAL_MS` — poll frequency (default `20000`)
- `STATE_FILE` — state path; mount a volume here in production (default `./.state.json`)
- `WATCHLIST_FILE` — watchlist path; mount on the same volume (default `./.watchlist.json`)
- `POST_HISTORICAL_ON_START` — `true` to post recent history on first run (default `false`)

**Discord bot — required only for the `/track` slash commands** (the rest of the bot uses
webhooks and needs no token):
- `DISCORD_BOT_TOKEN` — bot token from the Developer Portal. **Leave unset to disable slash
  commands entirely.** Keep this secret — never commit it.
- `DISCORD_GUILD_ID` — your server ID. Set it to register commands instantly; omit it and
  commands register globally (can take up to ~1h to appear).
- `TRACK_ALLOWED_USER_IDS` — optional comma-separated Discord user IDs allowed to use the
  commands. By default the commands require the **Manage Server** permission.
---
## Daily PnL leaderboard

Create a Discord channel + webhook for summaries, set `SUMMARY_WEBHOOK_URL` (and optionally
`SUMMARY_HOUR_UTC`), and the bot posts a ranked leaderboard once per UTC day. It covers the
**curated roster plus any `/track` watchlist wallets**, ranked by 1-day PnL (7-day shown
alongside). The last-posted date is persisted in the state file, so restarts won't double-post.

## Slash commands (`/track`, `/untrack`, `/watchlist`)

These let you manage a personal watchlist from Discord. Watchlist trades post to
`WATCHLIST_WEBHOOK_URL` and intentionally **skip** the roster's buys-only / category-routing
rules — every trade from a watched wallet is posted, except dust below
`WATCHLIST_MIN_BET_USD` (default $50).

Webhooks can only *send*, so the slash commands need a real bot. This is **optional** — leave
`DISCORD_BOT_TOKEN` unset and everything else still works.

1. **Create a bot:** [Discord Developer Portal](https://discord.com/developers/applications) →
   **New Application** → **Bot** → **Reset Token** → copy it into `DISCORD_BOT_TOKEN`. No
   privileged intents are required.
2. **Invite it:** **OAuth2 → URL Generator** → scope `applications.commands` (and `bot`) →
   open the URL and add it to your server.
3. **Set `DISCORD_GUILD_ID`** to your server ID for instant command registration.
4. **(Optional) lock it down:** the commands default to requiring **Manage Server**; set
   `TRACK_ALLOWED_USER_IDS` to a comma-separated list of user IDs to restrict further.

Then:
- `/track address:<0x…> [name:<label>]` — add a wallet to the watchlist.
- `/untrack address:<0x…>` — remove one (autocompletes from your current watchlist).
- `/watchlist` — show everything you're currently tracking.

> The watchlist is stored in `WATCHLIST_FILE` (mount it on your volume so it survives
> restarts). It's user data, not part of the repo, and is gitignored.

## Deploy to Railway
Needs an **always-on** host (serverless platforms like Vercel sleep between requests).
1. Push to GitHub, then **New Project → Deploy from GitHub repo**. It runs `npm start`.
2. **Variables:** add all the webhook env vars, plus any filter overrides, and (optionally)
   `DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID` for slash commands.
3. **Volume:** set `STATE_FILE=/data/state.json` and `WATCHLIST_FILE=/data/watchlist.json`,
   and mount a volume at `/data`.
4. **Settings → Deploy → Teardown = ON**, and run **exactly one** deployment of this repo.
> ⚠️ Two services/projects — or a stray local `npm start` — means two bots posting
> everything twice. Keep it to one.
---
## Maintenance
- **Refresh the roster:** re-run `npm run pick-wallets …`, commit, push. Channels untouched.
- **Add a category:** new channel + `CHANNEL_<NAME>` var + a rule in `src/categories.js`.
- **Tune filters:** `MIN_BET_USD` / `WHALE_MIN_USD` / `BUYS_ONLY` env vars.
---
## Troubleshooting
- **Duplicate cards** — more than one bot is running (a second service/project, a stray
  local `npm start`, or deploy overlap). The same `tx` in a card's footer = a true dupe.
- **`400 Bad Request {"embeds":["0"]}`** — an invalid embed, usually an image URL with a
  space. Image URLs are URL-encoded to prevent this.
- **`429` rate limits** — handled automatically by a global send queue with retries.
- **`min bet $NaN`** — `MIN_BET_USD` must be a bare number (`100`, not `$100`).
- **No alerts** — expected to be quiet until a watched trader places a qualifying bet.
---
## Project layout
- `src/index.js` — poll loop, filters, routing, whale, watchlist, daily summary, dedupe
- `src/polymarket.js` — Data API: activity, leaderboard, PnL (1/7/14/30d), market tags
- `src/categories.js` — market tags → sport channel rules
- `src/discord.js` — embed builder + rate-limited sender
- `src/format.js` — price → cents/odds, signed PnL, names, URLs
- `src/leaderboard.js` — daily PnL leaderboard embed builder
- `src/bot.js` — optional Discord gateway bot for `/track`, `/untrack`, `/watchlist`
- `src/watchlist.js` — persisted personal watchlist store
- `src/state.js` — persisted "already posted" store
- `src/config.js` — loads `wallets.json` + env webhooks/bot settings
- `src/pick-wallets.js` — generates the wallet list from verified PnL
---
## License
MIT

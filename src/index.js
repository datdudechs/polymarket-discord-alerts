import { loadConfig } from "./config.js";
import { fetchActivity, fetchWalletPnl, fetchEventTags } from "./polymarket.js";
import { categorize } from "./categories.js";
import { buildPayload, postToDiscord } from "./discord.js";
import { State } from "./state.js";
import { Watchlist } from "./watchlist.js";
import { startBot } from "./bot.js";
import { computeDailyLeaderboard, buildLeaderboardPayload } from "./leaderboard.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_BET_USD = Number(String(process.env.MIN_BET_USD ?? "100").replace(/[^0-9.]/g, "")) || 100;
const WHALE_MIN_USD = Number(String(process.env.WHALE_MIN_USD ?? "5000").replace(/[^0-9.]/g, "")) || 5000;
const BUYS_ONLY = String(process.env.BUYS_ONLY ?? "true").toLowerCase() === "true";

async function checkWallet(wallet, state, cfg) {
  state.reload();
  let activities;
  try {
    activities = await fetchActivity(wallet.address, cfg.activityLimit);
  } catch (err) {
    console.warn(`[poll] ${wallet.name || wallet.address}: ${err.message}`);
    return;
  }

  const trades = activities
    .filter((a) => (a.type || "TRADE") === "TRADE")
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  if (state.isNew(wallet.address) && !cfg.postHistoricalOnStart) {
    const newest = trades.at(-1);
    if (newest) state.setBaseline(wallet.address, newest.timestamp);
    return;
  }

  const watermark = state.forWallet(wallet.address).lastTimestamp;
  const fresh = trades.filter((t) => {
    if (Number(t.timestamp) < watermark) return false;
    if (t.transactionHash && state.hasSeen(wallet.address, t.transactionHash)) return false;
    return true;
  });
  if (fresh.length === 0) return;

  // Watchlist wallets are the owner's personal one-offs: they post every trade
  // to a dedicated channel and intentionally skip the buys-only / min-bet /
  // category-routing rules that govern the curated roster.
  const isWatch = wallet.source === "watchlist";

  let pnl = null;
  for (const trade of fresh) {
    if (trade.transactionHash && state.hasSeen(wallet.address, trade.transactionHash)) continue;
    const side = (trade.side || "").toUpperCase();
    if (!isWatch && BUYS_ONLY && side !== "BUY") {
      state.markPosted(wallet.address, trade.transactionHash, trade.timestamp);
      continue;
    }
    if (!isWatch && Number(trade.usdcSize) < MIN_BET_USD) {
      state.markPosted(wallet.address, trade.transactionHash, trade.timestamp);
      continue;
    }

    let category, webhook;
    if (isWatch) {
      category = "watchlist";
      webhook = cfg.watchlistWebhookUrl || cfg.defaultWebhookUrl;
    } else {
      category = categorize(await fetchEventTags(trade.eventSlug));
      webhook = cfg.channels[category] || cfg.defaultWebhookUrl;
    }
    if (!webhook) {
      state.markPosted(wallet.address, trade.transactionHash, trade.timestamp);
      continue;
    }

    if (!pnl) pnl = await fetchWalletPnl(wallet.address);
    const payload = buildPayload(trade, wallet.name, pnl);
    if (isWatch) payload.username = "👁️ Watchlist Alert";
    try {
      await postToDiscord(webhook, payload);
      state.markPosted(wallet.address, trade.transactionHash, trade.timestamp);
      console.log(
        `[alert:${category}] ${wallet.name || wallet.address}: ${trade.side} ${trade.outcome} ` +
          `$${Number(trade.usdcSize).toFixed(2)} — ${trade.title}`
      );
      if (!isWatch && cfg.whaleWebhookUrl && Number(trade.usdcSize) >= WHALE_MIN_USD) {
        try {
          await postToDiscord(cfg.whaleWebhookUrl, { ...payload, username: "🐳 Whale Alert" });
          console.log(`[whale] ${wallet.name || wallet.address}: $${Number(trade.usdcSize).toFixed(2)} — ${trade.title}`);
        } catch (err) {
          console.error(`[whale] ${wallet.name || wallet.address}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`[discord] ${wallet.name || wallet.address}: ${err.message}`);
    }
  }
}

// Merge the curated roster with the runtime watchlist, de-duping by address.
// The roster wins on conflict so an address stays in its category channel.
function buildWalletList(cfg, watchlist) {
  const seen = new Set();
  const list = [];
  for (const w of cfg.wallets) {
    if (seen.has(w.address)) continue;
    seen.add(w.address);
    list.push({ ...w, source: "roster" });
  }
  for (const w of watchlist.list()) {
    if (seen.has(w.address)) continue;
    seen.add(w.address);
    list.push({ address: w.address, name: w.name, source: "watchlist" });
  }
  return list;
}

// Post the daily PnL leaderboard once per UTC day, on the first poll cycle at
// or after SUMMARY_HOUR_UTC. The last-posted date is persisted so a restart
// won't double-post.
async function maybePostDailySummary(cfg, wallets, state) {
  if (!cfg.summaryWebhookUrl) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (now.getUTCHours() < cfg.summaryHourUtc) return;
  if (state.getLastSummaryDate() === today) return;

  console.log(`[summary] building daily leaderboard for ${wallets.length} wallet(s)…`);
  try {
    const rows = await computeDailyLeaderboard(wallets);
    await postToDiscord(cfg.summaryWebhookUrl, buildLeaderboardPayload(rows, { date: now }));
    state.setLastSummaryDate(today);
    console.log(`[summary] posted daily leaderboard for ${today}`);
  } catch (err) {
    console.error(`[summary] failed: ${err.message}`);
  }
}

async function main() {
  const cfg = loadConfig();
  const state = new State(cfg.stateFile);
  const watchlist = new Watchlist(cfg.watchlistFile);
  console.log(
    `[start] watching ${cfg.wallets.length} roster + ${watchlist.list().length} watchlist wallet(s), ` +
      `polling every ${cfg.pollIntervalMs}ms, ` +
      `min bet $${MIN_BET_USD}, whale ≥ $${WHALE_MIN_USD}, ${BUYS_ONLY ? "BUYS only" : "buys + sells"}, ` +
      `channels: ${Object.keys(cfg.channels).join(", ") || "(default only)"}` +
      (cfg.summaryWebhookUrl ? `, daily summary at ${String(cfg.summaryHourUtc).padStart(2, "0")}:00 UTC` : "")
  );

  const bot = await startBot(cfg, watchlist);

  let stopping = false;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      stopping = true;
      state.save();
      if (bot) bot.destroy().catch(() => {});
      console.log("[stop] state saved, exiting.");
      process.exit(0);
    });
  }

  while (!stopping) {
    const wallets = buildWalletList(cfg, watchlist);
    for (const wallet of wallets) {
      await checkWallet(wallet, state, cfg);
      await sleep(250);
    }
    await maybePostDailySummary(cfg, wallets, state);
    state.save();
    await sleep(cfg.pollIntervalMs);
  }
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});

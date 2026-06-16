import { loadConfig } from "./config.js";
import { fetchActivity, fetchWalletPnl, fetchEventTags } from "./polymarket.js";
import { categorize } from "./categories.js";
import { buildPayload, postToDiscord } from "./discord.js";
import { State } from "./state.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_BET_USD = Number(String(process.env.MIN_BET_USD ?? "100").replace(/[^0-9.]/g, "")) || 100;
const BUYS_ONLY = String(process.env.BUYS_ONLY ?? "true").toLowerCase() === "true";

async function checkWallet(wallet, state, cfg) {
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

  let pnl = null;
  for (const trade of fresh) {
    const side = (trade.side || "").toUpperCase();
    if (BUYS_ONLY && side !== "BUY") {
      state.markPosted(wallet.address, trade.transactionHash, trade.timestamp);
      continue;
    }
    if (Number(trade.usdcSize) < MIN_BET_USD) {
      state.markPosted(wallet.address, trade.transactionHash, trade.timestamp);
      continue;
    }

    const category = categorize(await fetchEventTags(trade.eventSlug));
    const webhook = cfg.channels[category] || cfg.defaultWebhookUrl;
    if (!webhook) {
      state.markPosted(wallet.address, trade.transactionHash, trade.timestamp);
      continue;
    }

    if (!pnl) pnl = await fetchWalletPnl(wallet.address);
    try {
      await postToDiscord(webhook, buildPayload(trade, wallet.name, pnl));
      state.markPosted(wallet.address, trade.transactionHash, trade.timestamp);
      console.log(
        `[alert:${category}] ${wallet.name || wallet.address}: ${trade.side} ${trade.outcome} ` +
          `$${Number(trade.usdcSize).toFixed(2)} — ${trade.title}`
      );
    } catch (err) {
      console.error(`[discord] ${wallet.name || wallet.address}: ${err.message}`);
    }
  }
}

async function main() {
  const cfg = loadConfig();
  const state = new State(cfg.stateFile);
  console.log(
    `[start] watching ${cfg.wallets.length} wallet(s), polling every ${cfg.pollIntervalMs}ms, ` +
      `min bet $${MIN_BET_USD}, ${BUYS_ONLY ? "BUYS only" : "buys + sells"}, ` +
      `channels: ${Object.keys(cfg.channels).join(", ") || "(default only)"}`
  );

  let stopping = false;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      stopping = true;
      state.save();
      console.log("[stop] state saved, exiting.");
      process.exit(0);
    });
  }

  while (!stopping) {
    for (const wallet of cfg.wallets) {
      await checkWallet(wallet, state, cfg);
      await sleep(250);
    }
    state.save();
    await sleep(cfg.pollIntervalMs);
  }
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});

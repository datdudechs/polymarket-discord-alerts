import { loadConfig } from "./config.js";
import { fetchActivity, fetchWalletPnl } from "./polymarket.js";
import { buildPayload, postToDiscord } from "./discord.js";
import { State } from "./state.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const toPost = trades.filter((t) => {
    if (Number(t.timestamp) < watermark) return false;
    if (t.transactionHash && state.hasSeen(wallet.address, t.transactionHash)) return false;
    return true;
  });
  if (toPost.length === 0) return;

  const pnl = await fetchWalletPnl(wallet.address);
  for (const trade of toPost) {
    try {
      await postToDiscord(wallet.webhookUrl, buildPayload(trade, wallet.name, pnl));
      state.markPosted(wallet.address, trade.transactionHash, trade.timestamp);
      console.log(
        `[alert] ${wallet.name || wallet.address}: ${trade.side} ${trade.outcome} ` +
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
    `[start] watching ${cfg.wallets.length} wallet(s), polling every ${cfg.pollIntervalMs}ms` +
      (cfg.postHistoricalOnStart ? " (posting historical trades on start)" : "")
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

import { loadConfig } from "./config.js";
import { fetchActivity } from "./polymarket.js";
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

  // API returns newest-first; process oldest-first so alerts arrive in order.
  const trades = activities
    .filter((a) => (a.type || "TRADE") === "TRADE")
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  // First time we ever see this wallet: set a baseline so we don't dump history.
  if (state.isNew(wallet.address) && !cfg.postHistoricalOnStart) {
    const newest = trades.at(-1);
    if (newest) state.setBaseline(wallet.address, newest.timestamp);
    return;
  }

  const watermark = state.forWallet(wallet.address).lastTimestamp;

  for (const trade of trades) {
    const tx = trade.transactionHash;
    if (Number(trade.timestamp) < watermark) continue;
    if (tx && state.hasSeen(wallet.address, tx)) continue;

    try {
      await postToDiscord(wallet.webhookUrl, buildPayload(trade, wallet.name));
      state.markPosted(wallet.address, tx, trade.timestamp);
      console.log(
        `[alert] ${wallet.name || wallet.address}: ${trade.side} ${trade.outcome} ` +
          `$${Number(trade.usdcSize).toFixed(2)} — ${trade.title}`
      );
    } catch (err) {
      console.error(`[discord] ${wallet.name || wallet.address}: ${err.message}`);
      // leave it unmarked so we retry next poll
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

  // Graceful shutdown: persist state so a redeploy doesn't replay trades.
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
      // small stagger so we don't hammer the API in one burst
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

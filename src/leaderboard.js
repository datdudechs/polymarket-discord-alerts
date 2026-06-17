import { fetchWalletPnl } from "./polymarket.js";
import { signedPnl, profileUrl } from "./format.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COLOR_SUMMARY = 0x5865f2; // Discord blurple
const MEDALS = ["🥇", "🥈", "🥉"];
const MAX_ROWS = 40; // keep the description well under Discord's 4096-char cap

const shortName = (w) =>
  w.name || `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;

/**
 * Fetch each wallet's recent PnL and return rows ranked by 1-day PnL (desc).
 * Wallets whose PnL can't be resolved are kept but sort to the bottom.
 */
export async function computeDailyLeaderboard(wallets, { gapMs = 200 } = {}) {
  const rows = [];
  for (const w of wallets) {
    const pnl = await fetchWalletPnl(w.address);
    rows.push({ address: w.address, name: shortName(w), source: w.source, pnl });
    if (gapMs) await sleep(gapMs);
  }
  return rows.sort((a, b) => {
    const av = Number(a.pnl?.l1), bv = Number(b.pnl?.l1);
    if (Number.isFinite(bv) && Number.isFinite(av)) return bv - av;
    if (Number.isFinite(bv)) return 1;
    if (Number.isFinite(av)) return -1;
    return 0;
  });
}

/** Build the Discord webhook payload for a ranked leaderboard. */
export function buildLeaderboardPayload(rows, { date = new Date() } = {}) {
  const day = date.toISOString().slice(0, 10);
  const shown = rows.slice(0, MAX_ROWS);

  const lines = shown.map((r, i) => {
    const rank = MEDALS[i] || `\`${String(i + 1).padStart(2)}\``;
    const tag = r.source === "watchlist" ? " 👁️" : "";
    return (
      `${rank} **[${r.name}](${profileUrl(r.address)})**${tag} — ${signedPnl(r.pnl?.l1)}` +
      `  ·  7d ${signedPnl(r.pnl?.l7)}`
    );
  });

  const description = lines.length
    ? lines.join("\n")
    : "No wallets are being watched yet.";

  return {
    username: "Polymarket Alerts",
    embeds: [
      {
        color: COLOR_SUMMARY,
        title: `📊 Daily PnL Leaderboard — ${day}`,
        description: description.slice(0, 4096),
        footer: {
          text:
            `Ranked by 1-day PnL · ${rows.length} wallet${rows.length === 1 ? "" : "s"}` +
            (rows.length > MAX_ROWS ? ` (top ${MAX_ROWS} shown)` : "") +
            " · 👁️ = watchlist",
        },
        timestamp: date.toISOString(),
      },
    ],
  };
}

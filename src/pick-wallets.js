import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { fetchLeaderboard, fetchWalletPnl, fetchActivity } from "./polymarket.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
};

const window = arg("window", "30d");
const orderBy = arg("orderBy", "pnl");
const limit = Number(arg("limit", "20"));
const minPnl = Number(arg("minPnl", "0"));
const minVol = Number(arg("minVol", "0"));
const minTrades = Number(arg("minTrades", "0"));
const outFile = resolve(projectRoot, arg("out", "wallets.json"));

const windowDays = { "1d": 1, "7d": 7, "30d": 30, all: 36500 }[window] || 30;
const sinceTs = Math.floor(Date.now() / 1000) - windowDays * 86400;

let prevPoll = 20000;
try {
  const prev = JSON.parse(readFileSync(outFile, "utf8"));
  if (prev.pollIntervalMs) prevPoll = prev.pollIntervalMs;
} catch {}

// Scan deeper into the leaderboard so the filters have more to choose from.
const poolSize = Math.min(500, Number(arg("pool", "")) || Math.max(limit * 10, 200));
const pool = (await fetchLeaderboard({ window, orderBy, limit: poolSize }))
  .filter((t) => /^0x[0-9a-f]{40}$/.test(t.address) && Number(t.vol) >= minVol);

async function tradeCount(address) {
  if (minTrades <= 0) return null;
  try {
    const acts = await fetchActivity(address, 100);
    return acts.filter((a) => (a.type || "TRADE") === "TRADE" && Number(a.timestamp) >= sinceTs).length;
  } catch {
    return 0;
  }
}

console.log(`Verifying ${pool.length} candidates (real PnL${minTrades ? " + trade count" : ""})... this can take a minute.`);
const verified = [];
for (const t of pool) {
  const pnl = await fetchWalletPnl(t.address);
  const trades = await tradeCount(t.address);
  verified.push({ ...t, pnl30: pnl.l30, trades });
  await sleep(180);
}

const picked = verified
  .filter((t) => Number.isFinite(t.pnl30) && t.pnl30 >= minPnl)
  .filter((t) => minTrades <= 0 || (t.trades ?? 0) >= minTrades)
  .sort((a, b) => b.pnl30 - a.pnl30)
  .slice(0, limit);

const wallets = picked.map((t) => ({ address: t.address, name: t.name || t.address.slice(0, 8) }));
writeFileSync(outFile, JSON.stringify({ pollIntervalMs: prevPoll, wallets }, null, 2) + "\n");

const fmt = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
console.log(
  `\nTop ${wallets.length} by VERIFIED 30d PnL (>= ${fmt(minPnl)}, vol >= ${fmt(minVol)}` +
    `${minTrades ? `, >= ${minTrades} trades/${window}` : ""}) -> wallets.json\n`
);
picked.forEach((t, i) => {
  const tc = minTrades ? `  ${String(t.trades).padStart(3)}t` : "";
  console.log(
    `${String(i + 1).padStart(2)}. ${(t.name || "").slice(0, 18).padEnd(18)} ` +
      `vol ${fmt(t.vol).padStart(13)}  real-30d ${fmt(t.pnl30).padStart(12)}${tc}`
  );
});
if (wallets.length < limit) console.log(`\nNote: only ${wallets.length} passed — loosen filters.`);
console.log("");

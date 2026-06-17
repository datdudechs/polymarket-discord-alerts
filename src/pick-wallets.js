import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { fetchLeaderboard, fetchWalletPnl } from "./polymarket.js";

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
const outFile = resolve(projectRoot, arg("out", "wallets.json"));

let prevPoll = 20000;
try {
  const prev = JSON.parse(readFileSync(outFile, "utf8"));
  if (prev.pollIntervalMs) prevPoll = prev.pollIntervalMs;
} catch {}

const poolSize = Math.min(500, Math.max(limit * 8, 100));
const pool = (await fetchLeaderboard({ window, orderBy, limit: poolSize }))
  .filter((t) => /^0x[0-9a-f]{40}$/.test(t.address) && Number(t.vol) >= minVol);

console.log(`Verifying real 30d PnL for ${pool.length} candidates...`);
const verified = [];
for (const t of pool) {
  const pnl = await fetchWalletPnl(t.address);
  verified.push({ ...t, pnl30: pnl.l30 });
  await sleep(200);
}

const picked = verified
  .filter((t) => Number.isFinite(t.pnl30) && t.pnl30 >= minPnl)
  .sort((a, b) => b.pnl30 - a.pnl30)
  .slice(0, limit);

const wallets = picked.map((t) => ({ address: t.address, name: t.name || t.address.slice(0, 8) }));
writeFileSync(outFile, JSON.stringify({ pollIntervalMs: prevPoll, wallets }, null, 2) + "\n");

const fmt = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
console.log(`\nTop ${wallets.length} by VERIFIED 30d PnL (>= ${fmt(minPnl)}, vol >= ${fmt(minVol)}) -> wallets.json\n`);
picked.forEach((t, i) => {
  console.log(
    `${String(i + 1).padStart(2)}. ${(t.name || "").slice(0, 18).padEnd(18)} ` +
      `vol ${fmt(t.vol).padStart(13)}  lb-pnl ${fmt(t.pnl).padStart(12)}  real-30d ${fmt(t.pnl30).padStart(12)}`
  );
});
if (wallets.length < limit) console.log(`\nNote: only ${wallets.length} passed — loosen filters.`);
console.log("");

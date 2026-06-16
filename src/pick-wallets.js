import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { fetchLeaderboard } from "./polymarket.js";

// Generate wallets.json from the Polymarket leaderboard.
//   npm run pick-wallets -- --orderBy=pnl --minVol=500000 --window=30d --limit=20
// Flags:
//   --orderBy  pnl (profit) | vol (activity)            default pnl
//   --minPnl   drop anyone below this profit            default 0  (profitable only)
//   --minVol   drop anyone below this volume (no dead channels)  default 0
//   --window   1d | 7d | 30d | all                      default 30d
//   --limit    how many wallets to keep                 default 20
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
}

const window = arg("window", "30d");
const orderBy = arg("orderBy", "pnl");
const limit = Number(arg("limit", "20"));
const minPnl = Number(arg("minPnl", "0"));
const minVol = Number(arg("minVol", "0"));
const outFile = resolve(projectRoot, arg("out", "wallets.json"));
const envWebhook = process.env.DEFAULT_WEBHOOK_URL || "";
const placeholder = "https://discord.com/api/webhooks/REPLACE_ME";

// Preserve webhooks you've already mapped so re-running keeps your channel links.
const existing = {};
let prevDefault = "";
try {
  const prev = JSON.parse(readFileSync(outFile, "utf8"));
  prevDefault = prev.defaultWebhookUrl || "";
  for (const w of prev.wallets || []) existing[String(w.address).toLowerCase()] = w.webhookUrl;
} catch {}
const fallbackWebhook = envWebhook || prevDefault || placeholder;

// Pull a bigger pool than we need, then filter down — so a volume floor still
// leaves us enough profitable, active traders to fill the list.
const poolSize = Math.min(500, Math.max(limit * 5, 100));
const pool = await fetchLeaderboard({ window, orderBy, limit: poolSize });

const picked = pool
  .filter((t) => /^0x[0-9a-f]{40}$/.test(t.address))
  .filter((t) => Number(t.pnl) >= minPnl && Number(t.vol) >= minVol)
  .slice(0, limit);

const wallets = picked.map((t) => ({
  address: t.address,
  name: t.name || t.address.slice(0, 8),
  webhookUrl: existing[t.address] || fallbackWebhook,
}));

const config = { pollIntervalMs: 15000, defaultWebhookUrl: fallbackWebhook, wallets };
writeFileSync(outFile, JSON.stringify(config, null, 2) + "\n");

const fmt = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
console.log(
  `\nTop ${wallets.length} by ${orderBy} (${window}), minPnl ${fmt(minPnl)}, minVol ${fmt(minVol)} -> wallets.json\n`
);
picked.forEach((t, i) => {
  console.log(
    `${String(i + 1).padStart(2)}. ${(t.name || "").slice(0, 20).padEnd(20)} ` +
      `vol ${fmt(t.vol).padStart(13)}  pnl ${fmt(t.pnl).padStart(13)}  ${t.address}`
  );
});
if (wallets.length < limit) {
  console.log(`\nNote: only ${wallets.length} passed the filters — loosen --minVol/--minPnl for more.`);
}
console.log("");

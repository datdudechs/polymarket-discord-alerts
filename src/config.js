import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

/**
 * Loads runtime configuration from environment variables and a wallets file.
 *
 * Env vars (all optional except a webhook somewhere):
 *   WALLETS_FILE                 path to wallets JSON   (default ./wallets.json)
 *   DEFAULT_WEBHOOK_URL          fallback Discord webhook for wallets with none of their own
 *   POLL_INTERVAL_MS             how often to check each wallet (default 15000)
 *   POST_HISTORICAL_ON_START     "true" to post existing trades on first run (default false)
 *   STATE_FILE                   where to persist seen-trade state (default ./.state.json)
 *   ACTIVITY_LIMIT               how many recent activities to pull per wallet (default 20)
 */
export function loadConfig() {
  const walletsFile = process.env.WALLETS_FILE
    ? resolve(process.env.WALLETS_FILE)
    : resolve(projectRoot, "wallets.json");

  let fileConfig = {};
  try {
    fileConfig = JSON.parse(readFileSync(walletsFile, "utf8"));
  } catch (err) {
    throw new Error(
      `Could not read wallets file at ${walletsFile}. ` +
        `Copy wallets.example.json to wallets.json and fill it in. (${err.message})`
    );
  }

  const defaultWebhook = process.env.DEFAULT_WEBHOOK_URL || fileConfig.defaultWebhookUrl || "";

  const wallets = (fileConfig.wallets || [])
    .map((w) => ({
      address: String(w.address || "").toLowerCase().trim(),
      name: w.name || "",
      webhookUrl: w.webhookUrl || defaultWebhook,
    }))
    .filter((w) => {
      if (!/^0x[0-9a-f]{40}$/.test(w.address)) {
        console.warn(`[config] Skipping wallet with invalid address: ${JSON.stringify(w.address)}`);
        return false;
      }
      if (!w.webhookUrl) {
        console.warn(`[config] Skipping ${w.address} — no webhookUrl and no DEFAULT_WEBHOOK_URL set.`);
        return false;
      }
      return true;
    });

  if (wallets.length === 0) {
    throw new Error("No valid wallets configured. Add at least one wallet with a webhook.");
  }

  return {
    wallets,
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || fileConfig.pollIntervalMs || 15000),
    postHistoricalOnStart:
      String(process.env.POST_HISTORICAL_ON_START || "false").toLowerCase() === "true",
    stateFile: process.env.STATE_FILE
      ? resolve(process.env.STATE_FILE)
      : resolve(projectRoot, ".state.json"),
    activityLimit: Number(process.env.ACTIVITY_LIMIT || 20),
  };
}

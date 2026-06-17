import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

export function loadConfig() {
  const walletsFile = process.env.WALLETS_FILE
    ? resolve(process.env.WALLETS_FILE)
    : resolve(projectRoot, "wallets.json");
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(readFileSync(walletsFile, "utf8"));
  } catch (err) {
    throw new Error(`Could not read wallets file at ${walletsFile}. (${err.message})`);
  }

  // Webhooks come from environment variables so no secrets live in the repo:
  //   DEFAULT_WEBHOOK_URL, WHALE_WEBHOOK_URL, and one CHANNEL_<NAME> per channel
  //   (e.g. CHANNEL_SOCCER, CHANNEL_ESPORTS). wallets.json values are a local fallback.
  const channels = { ...(fileConfig.channels || {}) };
  for (const [k, v] of Object.entries(process.env)) {
    const m = k.match(/^CHANNEL_(.+)$/);
    if (m && v) channels[m[1].toLowerCase()] = v;
  }
  const defaultWebhookUrl = process.env.DEFAULT_WEBHOOK_URL || fileConfig.defaultWebhookUrl || "";
  const whaleWebhookUrl = process.env.WHALE_WEBHOOK_URL || fileConfig.whaleWebhookUrl || "";

  const wallets = (fileConfig.wallets || [])
    .map((w) => ({ address: String(w.address || "").toLowerCase().trim(), name: w.name || "" }))
    .filter((w) => {
      if (!/^0x[0-9a-f]{40}$/.test(w.address)) {
        console.warn(`[config] Skipping invalid address: ${JSON.stringify(w.address)}`);
        return false;
      }
      return true;
    });

  if (wallets.length === 0) throw new Error("No valid wallets configured.");
  if (!defaultWebhookUrl && Object.keys(channels).length === 0)
    throw new Error("No webhooks configured. Set DEFAULT_WEBHOOK_URL and/or CHANNEL_<NAME> env vars.");

  return {
    wallets,
    channels,
    defaultWebhookUrl,
    whaleWebhookUrl,
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || fileConfig.pollIntervalMs || 20000),
    postHistoricalOnStart: String(process.env.POST_HISTORICAL_ON_START || "false").toLowerCase() === "true",
    stateFile: process.env.STATE_FILE ? resolve(process.env.STATE_FILE) : resolve(projectRoot, ".state.json"),
    activityLimit: Number(process.env.ACTIVITY_LIMIT || 20),
  };
}

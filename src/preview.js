import { buildPayload } from "./discord.js";
import { postToDiscord } from "./discord.js";

// A sample trade shaped exactly like the Data API's /activity response,
// using the numbers from the reference screenshot.
const sampleTrade = {
  proxyWallet: "0x6af75d4e4aaf700450efbac3708cce1665810ff1",
  timestamp: Math.floor(Date.now() / 1000),
  conditionId: "0xexample",
  type: "TRADE",
  size: 367,
  usdcSize: 109.92,
  transactionHash: "0xpreview",
  price: 0.2994,
  side: "BUY",
  outcome: "Yakult Brothers",
  title: "Dota 2: Yakult Brothers vs Vici Gaming - Game 1 Winner",
  slug: "dota-2-yakult-brothers-vs-vici-gaming-game-1-winner",
  eventSlug: "dota-2-yakult-brothers-vs-vici-gaming",
  icon: "",
  name: "spartachio",
};

const payload = buildPayload(sampleTrade, "spartachio");
console.log(JSON.stringify(payload, null, 2));

// If PREVIEW_WEBHOOK_URL is set, actually fire the test alert into Discord.
const webhook = process.env.PREVIEW_WEBHOOK_URL;
if (webhook) {
  postToDiscord(webhook, payload)
    .then(() => console.log("\nSent preview alert to Discord ✅"))
    .catch((err) => {
      console.error("\nFailed to send:", err.message);
      process.exit(1);
    });
} else {
  console.log("\n(Set PREVIEW_WEBHOOK_URL to send this to a real Discord channel.)");
}

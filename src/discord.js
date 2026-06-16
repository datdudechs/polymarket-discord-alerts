import {
  usd,
  shares,
  cents,
  decimalOdds,
  americanOdds,
  displayName,
  profileUrl,
  marketUrl,
} from "./format.js";

const COLOR_BUY = 0x2ecc71; // green
const COLOR_SELL = 0xe74c3c; // red

/**
 * Build a Discord webhook payload for a single trade, styled to match the
 * "spartachio just bet $109.92" alert format.
 *
 * @param {object} trade        one activity object from the Data API
 * @param {string} walletName   friendly name override from your wallets file
 */
export function buildPayload(trade, walletName) {
  const name = displayName(trade, walletName);
  const side = (trade.side || "").toUpperCase();
  const amount = usd(trade.usdcSize);

  const oddsLine = `${cents(trade.price)}¢ · ${americanOdds(trade.price)} · ${decimalOdds(trade.price)}`;
  const description =
    `**${side}** ${trade.outcome} @ ${oddsLine}\n\n` +
    `🎯 [Open market on Polymarket](${marketUrl(trade)})`;

  return {
    username: "Polymarket Alerts",
    embeds: [
      {
        color: side === "SELL" ? COLOR_SELL : COLOR_BUY,
        author: {
          name: `${name} just bet $${amount}`,
          icon_url: trade.profileImage || undefined,
          url: profileUrl(trade.proxyWallet),
        },
        description,
        fields: [
          { name: "Market", value: trade.title || "—", inline: false },
          { name: "Size", value: `$${amount} (${shares(trade.size)} shares)`, inline: true },
          {
            name: "Wallet",
            value: `[${name} — full record](${profileUrl(trade.proxyWallet)})`,
            inline: true,
          },
        ],
        thumbnail: trade.icon ? { url: trade.icon } : undefined,
        timestamp: new Date(Number(trade.timestamp) * 1000).toISOString(),
      },
    ],
  };
}

/** POST a payload to a Discord webhook, honoring 429 rate-limit retries. */
export async function postToDiscord(webhookUrl, payload) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const waitMs = Math.ceil((body.retry_after ?? 1) * 1000) + 250;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (!res.ok) {
      throw new Error(`discord ${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`);
    }
    return;
  }
  throw new Error("discord: gave up after repeated 429s");
}

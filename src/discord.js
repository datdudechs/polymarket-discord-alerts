import {
  usd, shares, cents, decimalOdds, americanOdds, displayName, profileUrl, marketUrl,
} from "./format.js";

const COLOR_BUY = 0x2ecc71;
const COLOR_SELL = 0xe74c3c;

/** Signed PnL like "🟢 +$12,340" / "🔴 −$3,210", or "—" when unknown. */
function signedPnl(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const r = Math.round(Number(n));
  const mark = r >= 0 ? "🟢 +" : "🔴 −";
  return `${mark}$${Math.abs(r).toLocaleString("en-US")}`;
}

/**
 * Build the Discord webhook payload for a trade.
 * @param {object} trade       activity object from the Data API
 * @param {string} walletName  friendly name override
 * @param {{l7:number|null,l14:number|null}} [pnl]  recent PnL for this wallet
 */
export function buildPayload(trade, walletName, pnl = {}) {
  const name = displayName(trade, walletName);
  const side = (trade.side || "").toUpperCase();
  const amount = usd(trade.usdcSize);
  const oddsLine = `${cents(trade.price)}¢ · ${americanOdds(trade.price)} · ${decimalOdds(trade.price)}`;

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
        description:
          `**${side}** ${trade.outcome} @ ${oddsLine}\n\n` +
          `🎯 [Open market on Polymarket](${marketUrl(trade)})`,
        fields: [
          { name: "Market", value: trade.title || "—", inline: false },
          { name: "Size", value: `$${amount} (${shares(trade.size)} shares)`, inline: true },
          { name: "PnL 7d", value: signedPnl(pnl.l7), inline: true },
          { name: "PnL 14d", value: signedPnl(pnl.l14), inline: true },
          { name: "Wallet", value: `[${name} — full record](${profileUrl(trade.proxyWallet)})`, inline: false },
        ],
        thumbnail: trade.icon ? { url: trade.icon } : undefined,
        timestamp: new Date(Number(trade.timestamp) * 1000).toISOString(),
      },
    ],
  };
}

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
    if (!res.ok) throw new Error(`discord ${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`);
    return;
  }
  throw new Error("discord: gave up after repeated 429s");
}

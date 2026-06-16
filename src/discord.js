import {
  usd, shares, cents, decimalOdds, americanOdds, displayName, profileUrl, marketUrl,
} from "./format.js";

const COLOR_BUY = 0x2ecc71;
const COLOR_SELL = 0xe74c3c;

const clamp = (s, n) => {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};
const nonEmpty = (s) => {
  const t = clamp(s, 1024).trim();
  return t.length ? t : "—";
};
const httpUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? encodeURI(u) : undefined);

function signedPnl(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const r = Math.round(Number(n));
  const mark = r >= 0 ? "🟢 +" : "🔴 −";
  return `${mark}$${Math.abs(r).toLocaleString("en-US")}`;
}

export function buildPayload(trade, walletName, pnl = {}) {
  const name = displayName(trade, walletName);
  const side = (trade.side || "").toUpperCase();
  const amount = usd(trade.usdcSize);
  const oddsLine = `${cents(trade.price)}¢ · ${americanOdds(trade.price)} · ${decimalOdds(trade.price)}`;
  const icon = httpUrl(trade.profileImage);
  const thumb = httpUrl(trade.icon);

  return {
    username: "Polymarket Alerts",
    embeds: [
      {
        color: side === "SELL" ? COLOR_SELL : COLOR_BUY,
        author: {
          name: clamp(`${name} just bet $${amount}`, 256),
          ...(icon ? { icon_url: icon } : {}),
          url: profileUrl(trade.proxyWallet),
        },
        description: clamp(
          `**${side}** ${nonEmpty(trade.outcome)} @ ${oddsLine}\n\n` +
            `🎯 [Open market on Polymarket](${marketUrl(trade)})`,
          4096
        ),
        fields: [
          { name: "Market", value: nonEmpty(trade.title), inline: false },
          { name: "Size", value: nonEmpty(`$${amount} (${shares(trade.size)} shares)`), inline: true },
          { name: "PnL 7d", value: signedPnl(pnl.l7), inline: true },
          { name: "PnL 14d", value: signedPnl(pnl.l14), inline: true },
          { name: "Wallet", value: nonEmpty(`[${name} — full record](${profileUrl(trade.proxyWallet)})`), inline: false },
        ],
        ...(thumb ? { thumbnail: { url: thumb } } : {}),
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
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`discord ${res.status} ${res.statusText}: ${detail.slice(0, 800)}`);
    }
    return;
  }
  throw new Error("discord: gave up after repeated 429s");
}

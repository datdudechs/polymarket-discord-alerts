/**
 * Pure formatting helpers — turn a raw Polymarket trade into the pieces
 * shown in the Discord embed. Kept dependency-free so they're easy to unit test.
 */

/** Format a USD number like 109.92 -> "109.92" (with thousands separators). */
export function usd(n) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Round share count and add thousands separators. */
export function shares(n) {
  return Math.round(Number(n)).toLocaleString("en-US");
}

/** Probability price (0..1) -> whole cents, e.g. 0.2994 -> "30". */
export function cents(price) {
  return Math.round(Number(price) * 100).toString();
}

/** Probability price (0..1) -> decimal odds string, e.g. 0.30 -> "3.33". */
export function decimalOdds(price) {
  const p = Number(price);
  if (p <= 0) return "—";
  return (1 / p).toFixed(2);
}

/** Probability price (0..1) -> American/moneyline odds string, e.g. 0.30 -> "+233". */
export function americanOdds(price) {
  const p = Number(price);
  if (p <= 0 || p >= 1) return "—";
  if (p >= 0.5) {
    return `-${Math.round((p / (1 - p)) * 100)}`;
  }
  return `+${Math.round(((1 - p) / p) * 100)}`;
}

/** Best human label for a trader. */
export function displayName(trade, fallbackName) {
  return (
    fallbackName ||
    trade.name ||
    trade.pseudonym ||
    `${trade.proxyWallet.slice(0, 6)}…${trade.proxyWallet.slice(-4)}`
  );
}

export function profileUrl(address) {
  return `https://polymarket.com/profile/${address}`;
}

export function marketUrl(trade) {
  if (trade.eventSlug) return `https://polymarket.com/event/${trade.eventSlug}`;
  if (trade.slug) return `https://polymarket.com/market/${trade.slug}`;
  return "https://polymarket.com";
}

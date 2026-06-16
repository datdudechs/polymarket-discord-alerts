const DATA_API = "https://data-api.polymarket.com";
const PNL_API = "https://user-pnl-api.polymarket.com";

const headers = { accept: "application/json", "user-agent": "polymarket-discord-alerts/1.0" };

/** Recent TRADE activity for a wallet, newest first. Public, no key. */
export async function fetchActivity(address, limit = 20) {
  const url = `${DATA_API}/activity?user=${address}&type=TRADE&limit=${limit}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`activity ${res.status} ${res.statusText} for ${address}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Top traders from the leaderboard (data-api/v1/leaderboard). */
export async function fetchLeaderboard({ window = "30d", orderBy = "pnl", limit = 20 } = {}) {
  const url = `${DATA_API}/v1/leaderboard?window=${window}&orderBy=${orderBy}&limit=${limit}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`leaderboard ${res.status} ${res.statusText}`);
  const data = await res.json();
  const rows = Array.isArray(data) ? data : data.data || [];
  return rows.map((r) => ({
    address: String(r.proxyWallet || r.wallet || "").toLowerCase(),
    name: r.userName || r.name || "",
    pnl: r.pnl,
    vol: r.vol,
  }));
}

// --- per-wallet PnL (last 7 / 14 days), cached so trade bursts don't hammer it.
const PNL_TTL_MS = 5 * 60 * 1000;
const pnlCache = new Map();

export async function fetchWalletPnl(address) {
  const cached = pnlCache.get(address);
  if (cached && Date.now() - cached.at < PNL_TTL_MS) return cached.value;

  let value = { l7: null, l14: null };
  try {
    const url = `${PNL_API}/user-pnl?user_address=${address}&interval=1m&fidelity=1d`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const series = await res.json();
      if (Array.isArray(series) && series.length) {
        const latest = series[series.length - 1];
        const valueDaysAgo = (days) => {
          const cutoff = latest.t - days * 86400;
          let chosen = series[0];
          for (const pt of series) {
            if (pt.t <= cutoff) chosen = pt;
            else break;
          }
          return chosen.p;
        };
        value = { l7: latest.p - valueDaysAgo(7), l14: latest.p - valueDaysAgo(14) };
      }
    }
  } catch (err) {
    console.warn(`[pnl] ${address}: ${err.message}`);
  }
  pnlCache.set(address, { at: Date.now(), value });
  return value;
}

const DATA_API = "https://data-api.polymarket.com";
const PNL_API = "https://user-pnl-api.polymarket.com";
const headers = { accept: "application/json", "user-agent": "polymarket-discord-alerts/1.0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchActivity(address, limit = 20) {
  const url = `${DATA_API}/activity?user=${address}&type=TRADE&limit=${limit}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`activity ${res.status} ${res.statusText} for ${address}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

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

// Profile-accurate PnL (same source as the profile graph): last 7/14/30 days.
const PNL_TTL_MS = 5 * 60 * 1000;
const pnlCache = new Map();

export async function fetchWalletPnl(address) {
  const cached = pnlCache.get(address);
  if (cached && Date.now() - cached.at < PNL_TTL_MS) return cached.value;

  let value = { l7: null, l14: null, l30: null };
  const url = `${PNL_API}/user-pnl?user_address=${address}&interval=1m&fidelity=1d`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) { await sleep(800); continue; }
      if (res.ok) {
        const series = await res.json();
        if (Array.isArray(series) && series.length) {
          const latest = series[series.length - 1];
          const valueDaysAgo = (days) => {
            const cutoff = latest.t - days * 86400;
            let chosen = series[0];
            for (const pt of series) { if (pt.t <= cutoff) chosen = pt; else break; }
            return chosen.p;
          };
          value = {
            l7: latest.p - valueDaysAgo(7),
            l14: latest.p - valueDaysAgo(14),
            l30: latest.p - valueDaysAgo(30),
          };
        }
      }
      break;
    } catch (err) {
      console.warn(`[pnl] ${address}: ${err.message}`);
    }
  }
  pnlCache.set(address, { at: Date.now(), value });
  return value;
}

const DATA_API = "https://data-api.polymarket.com";

/**
 * Fetch recent on-chain activity for a wallet, newest first.
 * Public endpoint — no API key required.
 * Docs: https://docs.polymarket.com/api-reference/introduction
 *
 * @param {string} address  proxy wallet address (0x...)
 * @param {number} limit    max activities to return (<=500)
 * @returns {Promise<Array>} array of activity objects
 */
export async function fetchActivity(address, limit = 20) {
  const url = `${DATA_API}/activity?user=${address}&type=TRADE&limit=${limit}`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "polymarket-discord-alerts/1.0" },
  });
  if (!res.ok) {
    throw new Error(`activity ${res.status} ${res.statusText} for ${address}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Convenience helper: pull the top traders from the leaderboard so you can
 * seed your wallets file without hand-hunting addresses.
 *
 * NOTE: The leaderboard host/params have changed over time. If this returns
 * nothing, check the current endpoint in Polymarket's docs and adjust here.
 *
 * @param {object} opts
 * @param {"1d"|"7d"|"30d"|"all"} opts.window
 * @param {"pnl"|"vol"} opts.orderBy
 * @param {number} opts.limit
 */
export async function fetchLeaderboard({ window = "30d", orderBy = "pnl", limit = 20 } = {}) {
  const url = `${DATA_API}/v1/leaderboard?window=${window}&orderBy=${orderBy}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "polymarket-discord-alerts/1.0" },
  });
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

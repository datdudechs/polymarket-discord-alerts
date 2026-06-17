import { readFileSync, writeFileSync, renameSync } from "node:fs";

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const MAX_NAME_LEN = 64;

/** Normalize a user-supplied address: trim + lowercase. */
export function normalizeAddress(address) {
  return String(address || "").trim().toLowerCase();
}

/**
 * Personal watchlist of one-off wallets added at runtime via Discord's /track
 * command. Persisted as JSON and shared in-process with the poll loop, which
 * routes these wallets to a dedicated channel and skips the normal filters.
 *
 * Stored separately from the curated wallets.json roster so it can be mounted
 * on a volume (it's user data, not part of the repo) — see WATCHLIST_FILE.
 */
export class Watchlist {
  constructor(file) {
    this.file = file;
    this.reload();
  }

  reload() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      this.entries = Array.isArray(parsed?.wallets) ? parsed.wallets : [];
    } catch {
      if (!this.entries) this.entries = [];
    }
  }

  /** All watched wallets as { address, name, addedBy, addedAt }. */
  list() {
    return this.entries.slice();
  }

  has(address) {
    const a = normalizeAddress(address);
    return this.entries.some((w) => w.address === a);
  }

  /**
   * Add a wallet. Returns { ok, reason?, entry? }.
   * reason is one of "invalid" | "exists" when ok is false.
   */
  add({ address, name = "", addedBy = "" } = {}) {
    const a = normalizeAddress(address);
    if (!ADDRESS_RE.test(a)) return { ok: false, reason: "invalid" };
    if (this.has(a)) return { ok: false, reason: "exists" };
    const entry = {
      address: a,
      name: String(name || "").trim().slice(0, MAX_NAME_LEN),
      addedBy: String(addedBy || "").slice(0, MAX_NAME_LEN),
      addedAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    this.save();
    return { ok: true, entry };
  }

  /** Remove a wallet by address. Returns the removed entry, or null. */
  remove(address) {
    const a = normalizeAddress(address);
    const idx = this.entries.findIndex((w) => w.address === a);
    if (idx === -1) return null;
    const [removed] = this.entries.splice(idx, 1);
    this.save();
    return removed;
  }

  save() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ wallets: this.entries }, null, 2) + "\n");
    renameSync(tmp, this.file);
  }
}

import { readFileSync, writeFileSync, renameSync } from "node:fs";

const MAX_SEEN_PER_WALLET = 300;

/**
 * Tiny JSON-file store that remembers which trades we've already posted, so a
 * restart (or a redeploy on Railway) doesn't re-spam old trades.
 *
 * Shape: { "0xabc...": { lastTimestamp: 1718553600, seen: ["0xtx1", ...] } }
 */
export class State {
  constructor(file) {
    this.file = file;
    try {
      this.data = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      this.data = {};
    }
  }

  forWallet(address) {
    if (!this.data[address]) this.data[address] = { lastTimestamp: 0, seen: [] };
    return this.data[address];
  }

  hasSeen(address, txHash) {
    return this.forWallet(address).seen.includes(txHash);
  }

  /** Mark a trade posted and advance the watermark timestamp. */
  markPosted(address, txHash, timestamp) {
    const w = this.forWallet(address);
    if (!w.seen.includes(txHash)) w.seen.push(txHash);
    if (w.seen.length > MAX_SEEN_PER_WALLET) w.seen = w.seen.slice(-MAX_SEEN_PER_WALLET);
    if (Number(timestamp) > w.lastTimestamp) w.lastTimestamp = Number(timestamp);
  }

  /** Set the baseline so only future trades post (used on first sight of a wallet). */
  setBaseline(address, timestamp) {
    const w = this.forWallet(address);
    if (Number(timestamp) > w.lastTimestamp) w.lastTimestamp = Number(timestamp);
  }

  isNew(address) {
    return this.forWallet(address).lastTimestamp === 0;
  }

  save() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file); // atomic-ish: avoids a half-written state file
  }
}

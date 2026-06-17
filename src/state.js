import { readFileSync, writeFileSync, renameSync } from "node:fs";

const MAX_SEEN_PER_WALLET = 300;

export class State {
  constructor(file) {
    this.file = file;
    this.reload();
  }

  reload() {
    try {
      this.data = JSON.parse(readFileSync(this.file, "utf8"));
    } catch {
      if (!this.data) this.data = {};
    }
  }

  forWallet(address) {
    if (!this.data[address]) this.data[address] = { lastTimestamp: 0, seen: [] };
    return this.data[address];
  }

  hasSeen(address, txHash) {
    return this.forWallet(address).seen.includes(txHash);
  }

  markPosted(address, txHash, timestamp) {
    const w = this.forWallet(address);
    if (txHash && !w.seen.includes(txHash)) w.seen.push(txHash);
    if (w.seen.length > MAX_SEEN_PER_WALLET) w.seen = w.seen.slice(-MAX_SEEN_PER_WALLET);
    if (Number(timestamp) > w.lastTimestamp) w.lastTimestamp = Number(timestamp);
    this.save();
  }

  setBaseline(address, timestamp) {
    const w = this.forWallet(address);
    if (Number(timestamp) > w.lastTimestamp) w.lastTimestamp = Number(timestamp);
    this.save();
  }

  isNew(address) {
    return this.forWallet(address).lastTimestamp === 0;
  }

  // Generic metadata, kept under a non-address key so it never collides with
  // per-wallet records. Used to remember when the daily summary last posted.
  getLastSummaryDate() {
    return this.data.__meta?.lastSummaryDate || "";
  }

  setLastSummaryDate(date) {
    if (!this.data.__meta) this.data.__meta = {};
    this.data.__meta.lastSummaryDate = date;
    this.save();
  }

  save() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}

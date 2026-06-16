import { readFileSync, writeFileSync, renameSync } from "node:fs";

const MAX_SEEN_PER_WALLET = 300;

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

  markPosted(address, txHash, timestamp) {
    const w = this.forWallet(address);
    if (txHash && !w.seen.includes(txHash)) w.seen.push(txHash);
    if (w.seen.length > MAX_SEEN_PER_WALLET) w.seen = w.seen.slice(-MAX_SEEN_PER_WALLET);
    if (Number(timestamp) > w.lastTimestamp) w.lastTimestamp = Number(timestamp);
    this.save(); // persist immediately so a redeploy can't replay this trade
  }

  setBaseline(address, timestamp) {
    const w = this.forWallet(address);
    if (Number(timestamp) > w.lastTimestamp) w.lastTimestamp = Number(timestamp);
    this.save();
  }

  isNew(address) {
    return this.forWallet(address).lastTimestamp === 0;
  }

  save() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}

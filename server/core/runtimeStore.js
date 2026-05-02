const { env } = require('../config/env');

function now() { return Date.now(); }

class TtlMap {
  constructor({ ttlMs, maxEntries }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }
  set(key, value, ttlMs = this.ttlMs) {
    this.map.set(key, { value, expiresAt: now() + ttlMs, createdAt: now() });
    this.prune();
    return value;
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }
  delete(key) { return this.map.delete(key); }
  values() {
    this.prune();
    return Array.from(this.map.values()).map((entry) => entry.value);
  }
  entries() {
    this.prune();
    return Array.from(this.map.entries()).map(([key, entry]) => [key, entry.value]);
  }
  prune() {
    const ts = now();
    for (const [key, entry] of this.map.entries()) {
      if (entry.expiresAt <= ts) this.map.delete(key);
    }
    while (this.map.size > this.maxEntries) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }
}

const runtimeStore = {
  rooms: new TtlMap({ ttlMs: 60 * 60 * 1000, maxEntries: 1000 }),
  presence: new TtlMap({ ttlMs: env.ttl.socketConnectionTtlMs, maxEntries: 5000 }),
  notifications: new TtlMap({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 10000 }),
  errors: new TtlMap({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 1000 }),
  adminLogs: [],
  memoryBalances: new Map()
};

function pushAdminLog(log) {
  const record = { ...log, createdAt: new Date().toISOString() };
  runtimeStore.adminLogs.push(record);
  while (runtimeStore.adminLogs.length > 500) runtimeStore.adminLogs.shift();
  return record;
}

function pushRuntimeError(error) {
  const id = `err_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const record = { id, ...error, createdAt: new Date().toISOString() };
  runtimeStore.errors.set(id, record);
  return record;
}

function startRuntimeSweep() {
  setInterval(() => {
    runtimeStore.rooms.prune();
    runtimeStore.presence.prune();
    runtimeStore.notifications.prune();
    runtimeStore.errors.prune();
  }, env.ttl.socketMemorySweepIntervalMs).unref();
}

module.exports = { TtlMap, runtimeStore, pushAdminLog, pushRuntimeError, startRuntimeSweep };

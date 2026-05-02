'use strict';

const config = require('../config/env');

class TtlMap {
  constructor({ ttlMs, maxSize, name }) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.name = name;
    this.map = new Map();
  }

  set(key, value, ttlMs = this.ttlMs) {
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs, touchedAt: Date.now() });
    this.prune();
    return value;
  }

  get(key) {
    const item = this.map.get(key);
    if (!item) return null;
    if (item.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    item.touchedAt = Date.now();
    return item.value;
  }

  has(key) {
    return Boolean(this.get(key));
  }

  delete(key) {
    return this.map.delete(key);
  }

  values() {
    this.pruneExpired();
    return [...this.map.values()].map((item) => item.value);
  }

  entries() {
    this.pruneExpired();
    return [...this.map.entries()].map(([key, item]) => [key, item.value]);
  }

  pruneExpired() {
    const now = Date.now();
    for (const [key, item] of this.map.entries()) {
      if (item.expiresAt <= now) this.map.delete(key);
    }
  }

  prune() {
    this.pruneExpired();
    while (this.map.size > this.maxSize) {
      let oldestKey = null;
      let oldest = Number.MAX_SAFE_INTEGER;
      for (const [key, item] of this.map.entries()) {
        if (item.touchedAt < oldest) {
          oldest = item.touchedAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      this.map.delete(oldestKey);
    }
  }

  size() {
    this.pruneExpired();
    return this.map.size;
  }
}

const runtimeStore = {
  adminLogs: [],
  rooms: new TtlMap({ ttlMs: config.timers.gameRoomTtlMs, maxSize: 500, name: 'rooms' }),
  matchmakingQueues: new TtlMap({ ttlMs: config.timers.matchQueueTtlMs, maxSize: 3000, name: 'queues' }),
  presence: new TtlMap({ ttlMs: config.timers.socketStaleTimeoutMs, maxSize: 10000, name: 'presence' }),
  notifications: new TtlMap({ ttlMs: config.timers.notificationRuntimeTtlMs, maxSize: 20000, name: 'notifications' }),
  rewardLocks: new TtlMap({ ttlMs: config.timers.notificationRuntimeTtlMs, maxSize: 20000, name: 'rewardLocks' }),
  sessions: new TtlMap({ ttlMs: 30 * 24 * 60 * 60 * 1000, maxSize: 5000, name: 'sessions' })
};

function pushRuntimeLog(log) {
  const entry = {
    type: log.type || 'runtime',
    level: log.level || 'info',
    message: String(log.message || '').slice(0, 500),
    userId: log.userId || null,
    payload: log.payload || null,
    createdAt: Date.now()
  };
  runtimeStore.adminLogs.push(entry);
  if (runtimeStore.adminLogs.length > 500) runtimeStore.adminLogs.shift();
  if (entry.level === 'error') console.error('[RUNTIME_ERROR]', entry);
  else if (entry.level === 'warn') console.warn('[RUNTIME_WARN]', entry);
  else console.log('[RUNTIME_INFO]', entry);
  return entry;
}

function createRoom(gameId, room) {
  const record = {
    ...room,
    gameId,
    roomId: room.roomId,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  runtimeStore.rooms.set(`${gameId}:${room.roomId}`, record);
  return record;
}

function getRoom(gameId, roomId) {
  return runtimeStore.rooms.get(`${gameId}:${roomId}`);
}

function saveRoom(gameId, roomId, updater) {
  const current = getRoom(gameId, roomId);
  if (!current) return null;
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  next.updatedAt = Date.now();
  runtimeStore.rooms.set(`${gameId}:${roomId}`, next);
  return next;
}

function deleteRoom(gameId, roomId) {
  return runtimeStore.rooms.delete(`${gameId}:${roomId}`);
}

function sweepRuntimeStore() {
  runtimeStore.rooms.pruneExpired();
  runtimeStore.matchmakingQueues.pruneExpired();
  runtimeStore.presence.pruneExpired();
  runtimeStore.notifications.pruneExpired();
  runtimeStore.rewardLocks.pruneExpired();
  runtimeStore.sessions.pruneExpired();
}

module.exports = {
  TtlMap,
  runtimeStore,
  pushRuntimeLog,
  createRoom,
  getRoom,
  saveRoom,
  deleteRoom,
  sweepRuntimeStore
};

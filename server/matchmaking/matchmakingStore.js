const { env } = require('../config/env');

const queues = new Map();
const users = new Map();

function getQueue(game) {
  if (!queues.has(game)) queues.set(game, []);
  return queues.get(game);
}

function removeUser(uid) {
  const current = users.get(uid);
  if (!current) return null;
  const queue = getQueue(current.game);
  const index = queue.findIndex((entry) => entry.uid === uid);
  if (index >= 0) queue.splice(index, 1);
  users.delete(uid);
  return current;
}

function enqueue(entry) {
  removeUser(entry.uid);
  const normalized = { ...entry, createdAt: Date.now(), expiresAt: Date.now() + env.ttl.matchQueueTtlMs };
  getQueue(entry.game).push(normalized);
  users.set(entry.uid, normalized);
  return normalized;
}

function findMatch(game, uid) {
  pruneExpired();
  const queue = getQueue(game);
  const me = users.get(uid);
  if (!me) return null;
  const opponent = queue.find((entry) => entry.uid !== uid && entry.game === game);
  if (!opponent) return null;
  removeUser(uid);
  removeUser(opponent.uid);
  return [me, opponent];
}

function pruneExpired() {
  const now = Date.now();
  for (const [game, queue] of queues.entries()) {
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i].expiresAt <= now) {
        users.delete(queue[i].uid);
        queue.splice(i, 1);
      }
    }
    if (!queue.length) queues.delete(game);
  }
}

function snapshot() {
  pruneExpired();
  return Array.from(queues.entries()).map(([game, queue]) => ({ game, waiting: queue.length }));
}

module.exports = { enqueue, findMatch, removeUser, pruneExpired, snapshot };

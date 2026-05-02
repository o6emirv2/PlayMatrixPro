'use strict';

const { runtimeStore } = require('../core/runtimeStore');

function queueKey(gameId) {
  return `queue:${gameId}`;
}

function getQueue(gameId) {
  return runtimeStore.matchmakingQueues.get(queueKey(gameId)) || [];
}

function setQueue(gameId, queue, ttlMs) {
  runtimeStore.matchmakingQueues.set(queueKey(gameId), queue, ttlMs);
  return queue;
}

function removeUserFromAllQueues(userId) {
  const changed = [];
  for (const [key, queue] of runtimeStore.matchmakingQueues.entries()) {
    const next = queue.filter((entry) => entry.userId !== userId);
    if (next.length !== queue.length) {
      const gameId = key.replace(/^queue:/, '');
      setQueue(gameId, next);
      changed.push(gameId);
    }
  }
  return changed;
}

module.exports = { queueKey, getQueue, setQueue, removeUserFromAllQueues };

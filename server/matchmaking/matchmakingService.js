'use strict';

const config = require('../config/env');
const { createId } = require('../core/security');
const { pushRuntimeLog } = require('../core/runtimeStore');
const { getQueue, setQueue, removeUserFromAllQueues } = require('./matchmakingStore');

function cleanQueue(queue) {
  const now = Date.now();
  return queue.filter((entry) => entry.expiresAt > now);
}

function leaveQueue({ gameId, userId }) {
  const queue = cleanQueue(getQueue(gameId)).filter((entry) => entry.userId !== userId);
  setQueue(gameId, queue, config.timers.matchQueueTtlMs);
  return { ok: true, waiting: queue.length };
}

function joinQueue({ gameId, user, socketId, createRoom }) {
  removeUserFromAllQueues(user.uid);
  const queue = cleanQueue(getQueue(gameId)).filter((entry) => entry.userId !== user.uid);
  const opponentIndex = queue.findIndex((entry) => entry.userId !== user.uid);

  if (opponentIndex >= 0) {
    const opponent = queue.splice(opponentIndex, 1)[0];
    setQueue(gameId, queue, config.timers.matchQueueTtlMs);
    const roomId = createId(`${gameId}_room`);
    const room = createRoom({
      roomId,
      gameId,
      players: [opponent.user, user],
      sockets: [opponent.socketId, socketId],
      createdBy: 'matchmaking'
    });
    pushRuntimeLog({ type: 'matchmaking_match', message: `${gameId} quick match created`, payload: { roomId, players: room.players.map((p) => p.uid) } });
    return { status: 'matched', room, opponent };
  }

  const entry = {
    userId: user.uid,
    user,
    socketId,
    createdAt: Date.now(),
    expiresAt: Date.now() + config.timers.matchQueueTtlMs
  };
  queue.push(entry);
  setQueue(gameId, queue, config.timers.matchQueueTtlMs);
  pushRuntimeLog({ type: 'matchmaking_wait', message: `${gameId} quick match wait`, userId: user.uid });
  return { status: 'waiting', waiting: queue.length, expiresAt: entry.expiresAt };
}

module.exports = { joinQueue, leaveQueue, cleanQueue };

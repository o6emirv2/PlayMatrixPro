'use strict';

const { socketAuthMiddleware } = require('../../core/socketAuth');
const { createRoom, getRoom, saveRoom, deleteRoom } = require('../../core/runtimeStore');
const { joinQueue, leaveQueue } = require('../../matchmaking/matchmakingService');
const { createGameState, playCard, publicPistiState } = require('./pisti.logic');
const { applyBalanceDelta } = require('../../core/userService');

function emitRoomState(nsp, roomId, room) {
  for (const player of room.players) {
    const sid = room.sockets[room.players.findIndex((p) => p.uid === player.uid)];
    const target = nsp.sockets.get(sid);
    if (target) target.emit('game:state', { roomId, state: publicPistiState(room.state, player.uid) });
  }
}

function registerPistiSocket(io) {
  const nsp = io.of('/pisti');
  nsp.use(socketAuthMiddleware());

  nsp.on('connection', (socket) => {
    socket.emit('ready', { ok: true, user: socket.user });

    socket.on('quickmatch:join', () => {
      const result = joinQueue({
        gameId: 'pisti',
        user: socket.user,
        socketId: socket.id,
        createRoom: ({ roomId, players, sockets }) => {
          const state = createGameState(players);
          return createRoom('pisti', { roomId, players, sockets, state });
        }
      });

      if (result.status === 'waiting') return socket.emit('quickmatch:waiting', result);
      const { room } = result;
      for (const socketId of room.sockets) nsp.sockets.get(socketId)?.join(room.roomId);
      nsp.to(room.roomId).emit('quickmatch:matched', { roomId: room.roomId });
      emitRoomState(nsp, room.roomId, room);
    });

    socket.on('quickmatch:leave', () => socket.emit('quickmatch:left', leaveQueue({ gameId: 'pisti', userId: socket.user.uid })));

    socket.on('card:play', async ({ roomId, card }) => {
      const room = getRoom('pisti', roomId);
      if (!room) return socket.emit('game:error', { message: 'Oda bulunamadı.' });
      const result = playCard(room.state, socket.user.uid, card);
      if (!result.ok) return socket.emit('game:error', { message: result.error });
      saveRoom('pisti', roomId, room);
      emitRoomState(nsp, roomId, room);
      if (room.state.status === 'finished') {
        if (room.state.winnerUid) {
          await applyBalanceDelta(room.state.winnerUid, 25, 'pisti_win', `pisti_${roomId}_${room.state.winnerUid}`);
        }
        nsp.to(roomId).emit('game:finished', { roomId, winnerUid: room.state.winnerUid, scores: room.state.scores });
        deleteRoom('pisti', roomId);
      }
    });

    socket.on('disconnect', () => leaveQueue({ gameId: 'pisti', userId: socket.user.uid }));
  });
}

module.exports = { registerPistiSocket };

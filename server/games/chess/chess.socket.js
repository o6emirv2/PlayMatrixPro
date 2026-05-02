'use strict';

const { socketAuthMiddleware } = require('../../core/socketAuth');
const { createRoom, getRoom, saveRoom, deleteRoom } = require('../../core/runtimeStore');
const { joinQueue, leaveQueue } = require('../../matchmaking/matchmakingService');
const { createGameState, applyMove, publicChessState } = require('./chess.logic');

function registerChessSocket(io) {
  const nsp = io.of('/chess');
  nsp.use(socketAuthMiddleware());

  nsp.on('connection', (socket) => {
    socket.emit('ready', { ok: true, user: socket.user });

    socket.on('quickmatch:join', () => {
      const result = joinQueue({
        gameId: 'chess',
        user: socket.user,
        socketId: socket.id,
        createRoom: ({ roomId, players, sockets }) => {
          const state = createGameState(players);
          return createRoom('chess', { roomId, players, sockets, state });
        }
      });

      if (result.status === 'waiting') {
        socket.emit('quickmatch:waiting', result);
        return;
      }
      const { room } = result;
      for (const socketId of room.sockets) nsp.sockets.get(socketId)?.join(room.roomId);
      nsp.to(room.roomId).emit('quickmatch:matched', { roomId: room.roomId, state: publicChessState(room.state) });
    });

    socket.on('quickmatch:leave', () => {
      socket.emit('quickmatch:left', leaveQueue({ gameId: 'chess', userId: socket.user.uid }));
    });

    socket.on('room:join', ({ roomId }) => {
      const room = getRoom('chess', roomId);
      if (!room) return socket.emit('game:error', { message: 'Oda bulunamadı.' });
      socket.join(roomId);
      socket.emit('game:state', { roomId, state: publicChessState(room.state) });
    });

    socket.on('move', ({ roomId, move }) => {
      const room = getRoom('chess', roomId);
      if (!room) return socket.emit('game:error', { message: 'Oda bulunamadı.' });
      const result = applyMove(room.state, socket.user.uid, move);
      if (!result.ok) return socket.emit('game:error', { message: result.error });
      saveRoom('chess', roomId, room);
      nsp.to(roomId).emit('game:state', { roomId, state: result.state });
      if (room.state.status === 'finished') deleteRoom('chess', roomId);
    });

    socket.on('disconnect', () => {
      leaveQueue({ gameId: 'chess', userId: socket.user.uid });
    });
  });
}

module.exports = { registerChessSocket };

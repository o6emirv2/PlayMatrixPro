const { runtimeStore } = require('../../core/runtimeStore');
const { applyMove } = require('./chess.logic');

function registerChessSocket(io) {
  io.on('connection', (socket) => {
    socket.on('chess:join', ({ roomId } = {}) => {
      const room = runtimeStore.rooms.get(`chess:${roomId}`);
      if (!room) return socket.emit('chess:error', { error: 'ROOM_NOT_FOUND' });
      socket.join(`chess:${roomId}`);
      return socket.emit('chess:state', room);
    });

    socket.on('chess:move', ({ roomId, from, to } = {}) => {
      try {
        const room = runtimeStore.rooms.get(`chess:${roomId}`);
        const updated = applyMove(room, socket.user.uid, from, to);
        runtimeStore.rooms.set(`chess:${roomId}`, updated);
        io.to(`chess:${roomId}`).emit('chess:state', updated);
      } catch (error) {
        socket.emit('chess:error', { error: error.message });
      }
    });

    socket.on('chess:resign', ({ roomId } = {}) => {
      const room = runtimeStore.rooms.get(`chess:${roomId}`);
      if (!room) return;
      room.status = 'finished';
      room.winner = room.players.find((p) => p.uid !== socket.user.uid)?.uid || null;
      runtimeStore.rooms.set(`chess:${roomId}`, room);
      io.to(`chess:${roomId}`).emit('chess:state', room);
    });
  });
}

module.exports = { registerChessSocket };

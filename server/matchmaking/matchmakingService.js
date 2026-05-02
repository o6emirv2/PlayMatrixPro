const { assertEnum, toPositiveNumber } = require('../core/validation');
const store = require('./matchmakingStore');

const supportedGames = ['chess', 'pisti'];

function registerMatchmaking(io, modules) {
  io.on('connection', (socket) => {
    socket.on('quick-match:join', async (payload = {}) => {
      try {
        if (!socket.user?.uid) return socket.emit('quick-match:error', { error: 'AUTH_REQUIRED' });
        const game = assertEnum(payload.game, supportedGames, 'game');
        const bet = toPositiveNumber(payload.bet, 0, 100000);
        const mode = String(payload.mode || 'classic').slice(0, 40);
        const entry = store.enqueue({ game, uid: socket.user.uid, socketId: socket.id, bet, mode, displayName: socket.user.email || socket.user.uid });
        socket.join(`queue:${game}`);
        socket.emit('quick-match:queued', { game, timeoutMs: entry.expiresAt - Date.now() });
        const pair = store.findMatch(game, socket.user.uid);
        if (!pair) return;
        const module = modules[game];
        if (!module || typeof module.createQuickMatchRoom !== 'function') throw new Error('GAME_MODULE_UNAVAILABLE');
        const room = module.createQuickMatchRoom(pair.map((item) => ({ uid: item.uid, displayName: item.displayName })), { bet, mode });
        for (const player of pair) {
          const target = io.sockets.sockets.get(player.socketId);
          if (target) {
            target.leave(`queue:${game}`);
            target.join(`${game}:${room.roomId}`);
            target.emit('quick-match:found', { game, roomId: room.roomId, path: `/games/${game}/?room=${encodeURIComponent(room.roomId)}` });
          }
        }
      } catch (error) {
        socket.emit('quick-match:error', { error: error.code || error.message || 'QUICK_MATCH_FAILED' });
      }
    });

    socket.on('quick-match:cancel', () => {
      if (socket.user?.uid) store.removeUser(socket.user.uid);
      socket.emit('quick-match:cancelled');
    });

    socket.on('disconnect', () => {
      if (socket.user?.uid) store.removeUser(socket.user.uid);
    });
  });
}

module.exports = { registerMatchmaking };

const { runtimeStore } = require('../../core/runtimeStore');
const { playCard } = require('./pisti.logic');
const { adjustBalance } = require('../../core/economyService');
const { createNotification } = require('../../core/notificationService');

function publicRoom(room, uid) {
  return {
    ...room,
    deck: { count: room.deck.length },
    players: room.players.map((player) => ({
      uid: player.uid,
      displayName: player.displayName,
      seat: player.seat,
      hand: player.uid === uid ? player.hand : { count: player.hand.length },
      captured: { count: player.captured.length },
      score: player.score
    }))
  };
}

async function settle(room) {
  if (room.settled || room.status !== 'finished' || !room.winner || !room.bet) return;
  room.settled = true;
  await adjustBalance({ uid: room.winner, amount: room.bet * 2, reason: 'PISTI_WIN', idempotencyKey: `pisti:${room.roomId}:win:${room.winner}` });
  createNotification({ type: 'reward', userId: room.winner, source: 'pisti', rewardId: room.roomId, title: 'Pişti ödülü', message: `${room.bet * 2} MC kazandın.`, critical: true });
}

function registerPistiSocket(io) {
  io.on('connection', (socket) => {
    socket.on('pisti:join', ({ roomId } = {}) => {
      const room = runtimeStore.rooms.get(`pisti:${roomId}`);
      if (!room) return socket.emit('pisti:error', { error: 'ROOM_NOT_FOUND' });
      socket.join(`pisti:${roomId}`);
      return socket.emit('pisti:state', publicRoom(room, socket.user.uid));
    });

    socket.on('pisti:play-card', async ({ roomId, cardId } = {}) => {
      try {
        const room = runtimeStore.rooms.get(`pisti:${roomId}`);
        const updated = playCard(room, socket.user.uid, cardId);
        await settle(updated);
        runtimeStore.rooms.set(`pisti:${roomId}`, updated);
        for (const client of await io.in(`pisti:${roomId}`).fetchSockets()) {
          client.emit('pisti:state', publicRoom(updated, client.data?.user?.uid || client.user?.uid));
        }
      } catch (error) {
        socket.emit('pisti:error', { error: error.message });
      }
    });
  });
}

module.exports = { registerPistiSocket };

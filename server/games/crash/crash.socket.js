const { runtimeStore } = require('../../core/runtimeStore');
const { createCrashRound, cashout } = require('./crash.logic');
const { adjustBalance } = require('../../core/economyService');
const { createNotification } = require('../../core/notificationService');

function registerCrashSocket(io) {
  io.on('connection', (socket) => {
    socket.on('crash:bet', async ({ bet } = {}) => {
      try {
        const amount = Number(bet || 0);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error('INVALID_BET');
        await adjustBalance({ uid: socket.user.uid, amount: -amount, reason: 'CRASH_BET', idempotencyKey: `crash:bet:${socket.user.uid}:${Date.now()}` });
        const round = createCrashRound(socket.user.uid, amount);
        runtimeStore.rooms.set(`crash:${round.roundId}`, round, 10 * 60 * 1000);
        socket.emit('crash:round', round);
      } catch (error) {
        socket.emit('crash:error', { error: error.message });
      }
    });

    socket.on('crash:cashout', async ({ roundId } = {}) => {
      try {
        const round = runtimeStore.rooms.get(`crash:${roundId}`);
        if (!round || round.uid !== socket.user.uid) throw new Error('ROUND_NOT_FOUND');
        const result = cashout(round);
        runtimeStore.rooms.set(`crash:${round.roundId}`, result.round, 10 * 60 * 1000);
        if (result.payout > 0) {
          await adjustBalance({ uid: socket.user.uid, amount: result.payout, reason: 'CRASH_CASHOUT', idempotencyKey: `crash:cashout:${round.roundId}` });
          createNotification({ type: 'reward', userId: socket.user.uid, source: 'crash', rewardId: round.roundId, title: 'Crash kazancı', message: `${result.payout} MC kazandın.`, critical: true });
        }
        socket.emit('crash:result', result);
      } catch (error) {
        socket.emit('crash:error', { error: error.message });
      }
    });
  });
}

module.exports = { registerCrashSocket };

'use strict';

const { socketAuthMiddleware } = require('../../core/socketAuth');
const { runtimeStore } = require('../../core/runtimeStore');
const { safeNumber } = require('../../core/security');
const { createCrashRound, currentMultiplier, cashout } = require('./crash.logic');
const { applyBalanceDelta } = require('../../core/userService');

function registerCrashSocket(io) {
  const nsp = io.of('/crash');
  nsp.use(socketAuthMiddleware());

  nsp.on('connection', (socket) => {
    socket.emit('ready', { ok: true, user: socket.user });

    socket.on('round:start', async ({ stake }) => {
      const amount = safeNumber(stake, 0, 1, 10000);
      if (!amount) return socket.emit('game:error', { message: 'Geçerli bahis girin.' });
      const debit = await applyBalanceDelta(socket.user.uid, -amount, 'crash_stake', `crash_stake_${socket.user.uid}_${Date.now()}`);
      if (!debit.applied) return socket.emit('game:error', { message: 'Bahis işlenemedi.' });
      const round = createCrashRound({ userId: socket.user.uid, stake: amount });
      runtimeStore.rooms.set(`crash:${round.roundId}`, round, 5 * 60 * 1000);
      socket.join(round.roundId);
      socket.emit('round:started', { roundId: round.roundId, stake: amount, profile: debit.profile });
    });

    socket.on('round:tick', ({ roundId }) => {
      const round = runtimeStore.rooms.get(`crash:${roundId}`);
      if (!round) return socket.emit('game:error', { message: 'Round bulunamadı.' });
      const multiplier = currentMultiplier(round);
      if (multiplier >= round.crashAt) {
        round.status = 'crashed';
        runtimeStore.rooms.delete(`crash:${roundId}`);
        return socket.emit('round:crashed', { roundId, multiplier: round.crashAt });
      }
      socket.emit('round:tick', { roundId, multiplier });
    });

    socket.on('round:cashout', async ({ roundId }) => {
      const round = runtimeStore.rooms.get(`crash:${roundId}`);
      if (!round) return socket.emit('game:error', { message: 'Round bulunamadı.' });
      if (round.userId !== socket.user.uid) return socket.emit('game:error', { message: 'Bu round bu kullanıcıya ait değil.' });
      const result = cashout(round);
      runtimeStore.rooms.delete(`crash:${roundId}`);
      if (!result.ok) return socket.emit('round:crashed', { roundId, multiplier: round.crashAt });
      const credit = await applyBalanceDelta(socket.user.uid, result.payout, 'crash_cashout', `crash_cashout_${roundId}`);
      socket.emit('round:cashedout', { roundId, payout: result.payout, multiplier: result.multiplier, profile: credit.profile });
    });
  });
}

module.exports = { registerCrashSocket };

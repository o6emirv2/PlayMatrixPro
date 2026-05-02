const { makeId } = require('../../core/security');

function createCrashRound(uid, bet) {
  const crashAt = Math.round((1.2 + Math.random() * 8.8) * 100) / 100;
  return { roundId: makeId('crash'), uid, bet: Number(bet), crashAt, startedAt: Date.now(), status: 'running', cashedOutAt: null };
}

function currentMultiplier(round) {
  const elapsed = Math.max(0, Date.now() - round.startedAt);
  return Math.min(round.crashAt, Math.round((1 + elapsed / 4000) * 100) / 100);
}

function cashout(round) {
  if (!round || round.status !== 'running') throw new Error('ROUND_NOT_RUNNING');
  const multiplier = currentMultiplier(round);
  if (multiplier >= round.crashAt) {
    round.status = 'crashed';
    return { round, payout: 0, multiplier: round.crashAt };
  }
  round.status = 'cashed_out';
  round.cashedOutAt = Date.now();
  return { round, payout: Math.round(round.bet * multiplier * 100) / 100, multiplier };
}

module.exports = { createCrashRound, currentMultiplier, cashout };

'use strict';

const crypto = require('crypto');

function createCrashRound({ userId, stake }) {
  const seed = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${seed}:${userId}:${Date.now()}`).digest('hex');
  const n = parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  const crashAt = Math.max(1.05, Math.min(50, Number((1 / Math.max(0.02, 1 - n)).toFixed(2))));
  return {
    roundId: `crash_${crypto.randomUUID()}`,
    userId,
    stake: Number(stake),
    crashAt,
    startedAt: Date.now(),
    status: 'active',
    cashedOutAt: null,
    multiplier: 1
  };
}

function currentMultiplier(round) {
  const elapsed = Math.max(0, Date.now() - round.startedAt);
  const value = Number((1 + elapsed / 6000).toFixed(2));
  return Math.min(value, round.crashAt);
}

function cashout(round) {
  if (!round || round.status !== 'active') return { ok: false, error: 'Round aktif değil.' };
  const multiplier = currentMultiplier(round);
  if (multiplier >= round.crashAt) {
    round.status = 'crashed';
    round.multiplier = round.crashAt;
    return { ok: false, error: 'Round patladı.', round };
  }
  round.status = 'cashed_out';
  round.cashedOutAt = Date.now();
  round.multiplier = multiplier;
  return { ok: true, payout: Math.floor(round.stake * multiplier), multiplier, round };
}

module.exports = { createCrashRound, currentMultiplier, cashout };

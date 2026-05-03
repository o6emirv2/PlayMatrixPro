const express = require('express');
const { requireAuth } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { creditBalance } = require('../core/economyService');
const router = express.Router();
const REWARDS = Object.freeze([
  { amount: 10000, weight: 40 }, { amount: 20000, weight: 30 }, { amount: 25000, weight: 20 }, { amount: 45000, weight: 15 },
  { amount: 65000, weight: 10 }, { amount: 90000, weight: 5 }, { amount: 120000, weight: 3 }, { amount: 1000000, weight: 2 }
]);
function istanbulDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function pickReward() {
  const total = REWARDS.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * total;
  for (const reward of REWARDS) { roll -= reward.weight; if (roll <= 0) return reward; }
  return REWARDS[0];
}
router.get('/wheel/config', (_req, res) => res.json({ ok: true, resetTimezone: 'Europe/Istanbul', reset: '00:00', rewards: REWARDS.map(r => ({ ...r, probability: r.weight / 125 })) }));
router.post('/wheel/spin', requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const day = istanbulDayKey();
  const key = `wheel:${uid}:${day}`;
  const { db } = initFirebaseAdmin();
  if (db) {
    const ref = db.collection('wheelClaims').doc(key);
    const snap = await ref.get();
    if (snap.exists) return res.status(409).json({ ok: false, error: 'WHEEL_ALREADY_CLAIMED_TODAY', day });
    const reward = pickReward();
    const economy = await creditBalance({ uid, amount: reward.amount, reason: 'daily-wheel', idempotencyKey: key });
    if (!economy.ok) return res.status(400).json(economy);
    await ref.set({ uid, day, reward: reward.amount, at: Date.now() }, { merge: false });
    return res.json({ ok: true, day, reward: reward.amount, balance: economy.balance });
  }
  const memory = require('../core/runtimeStore').runtimeStore.temporary;
  if (memory.get(key)) return res.status(409).json({ ok: false, error: 'WHEEL_ALREADY_CLAIMED_TODAY', day });
  const reward = pickReward();
  const economy = await creditBalance({ uid, amount: reward.amount, reason: 'daily-wheel', idempotencyKey: key });
  memory.set(key, true, 30 * 3600000);
  res.json({ ok: true, day, reward: reward.amount, balance: economy.balance });
});
module.exports = router;

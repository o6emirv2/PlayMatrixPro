const express = require('express');
const crypto = require('crypto');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('../core/runtimeStore');
const { getProgression, normalizeXpBigInt } = require('../core/progressionService');

function optionalAuth(req, _res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const { auth } = initFirebaseAdmin();
  if (!auth || !token) return next();
  auth.verifyIdToken(token).then((user) => { req.user = user; next(); }).catch(() => next());
}
function gameConfig(game) {
  const map = {
    'pattern-master': { maxScore: 25000, minDurationMs: 1500, xpPerPoint: 1, maxXpPerRun: 25000 },
    'space-pro': { maxScore: 200000, minDurationMs: 2500, xpPerPoint: 0.25, maxXpPerRun: 50000 },
    'snake-pro': { maxScore: 100000, minDurationMs: 1800, xpPerPoint: 0.5, maxXpPerRun: 35000 }
  };
  return map[game] || map['pattern-master'];
}
function calculateXp(game, score, durationMs) {
  const cfg = gameConfig(game);
  const safeScore = Math.max(0, Math.min(cfg.maxScore, Math.trunc(Number(score) || 0)));
  const safeDuration = Math.max(0, Math.trunc(Number(durationMs) || 0));
  const impossible = safeScore > cfg.maxScore || safeDuration < cfg.minDurationMs || safeScore / Math.max(1, safeDuration / 1000) > cfg.maxScore / 20;
  const xp = impossible ? 0 : Math.min(cfg.maxXpPerRun, Math.floor(safeScore * cfg.xpPerPoint));
  return { score: safeScore, durationMs: safeDuration, xp, suspicious: impossible };
}
function createClassicRouter(game) {
  const router = express.Router();
  router.post('/start', optionalAuth, (req, res) => {
    const runId = `${game}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    runtimeStore.temporary.set(`classic:${runId}`, { game, uid: req.user?.uid || '', startedAt: Date.now(), finished: false }, 6 * 3600000);
    res.json({ ok: true, game, runId, startedAt: Date.now() });
  });
  router.post('/submit', optionalAuth, async (req, res) => {
    const runId = String(req.body.runId || `${game}_legacy_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`);
    const existing = runtimeStore.temporary.get(`classic:done:${runId}`);
    if (existing) return res.json({ ok: true, duplicate: true, ...existing });
    const calc = calculateXp(game, req.body.score, req.body.durationMs);
    const uid = req.user?.uid || String(req.body.uid || '');
    let progression = getProgression(0);
    if (uid && calc.xp > 0) {
      const { db, admin } = initFirebaseAdmin();
      if (db && admin) {
        const userRef = db.collection('users').doc(uid);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(userRef);
          const current = normalizeXpBigInt(snap.exists ? (snap.data().xp ?? snap.data().accountXp ?? 0) : 0);
          const next = current + BigInt(calc.xp);
          progression = getProgression(next);
          tx.set(userRef, { xp: next.toString(), accountXp: next.toString(), accountLevel: progression.level, accountLevelProgressPct: progression.progressPercent, updatedAt: Date.now() }, { merge: true });
          tx.set(db.collection('classicGameRuns').doc(runId), { uid, game, score: calc.score, durationMs: calc.durationMs, xp: calc.xp, suspicious: calc.suspicious, at: Date.now() }, { merge: false });
        });
      } else {
        const key = `xp:${uid}`;
        const current = normalizeXpBigInt(runtimeStore.temporary.get(key) || 0);
        const next = current + BigInt(calc.xp);
        runtimeStore.temporary.set(key, next.toString(), 30 * 86400000);
        progression = getProgression(next);
      }
    }
    const result = { game, runId, score: calc.score, durationMs: calc.durationMs, xpAwarded: uid ? calc.xp : 0, suspicious: calc.suspicious, progression };
    runtimeStore.temporary.set(`classic:done:${runId}`, result, 30 * 86400000);
    res.json({ ok: true, ...result });
  });
  return router;
}
module.exports = { createClassicRouter, calculateXp };

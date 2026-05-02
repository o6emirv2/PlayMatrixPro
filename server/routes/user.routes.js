const express = require('express');
const { getDb } = require('../config/firebaseAdmin');
const { verifyBearerToken, ensureUserProfile } = require('../core/security');
const { calculateProgression } = require('../core/progressionService');
const { getBalance } = require('../core/economyService');

const router = express.Router();

router.get('/me', verifyBearerToken, async (req, res) => {
  await ensureUserProfile(req.user);
  const db = getDb();
  let profile = { uid: req.user.uid, email: req.user.email, displayName: req.user.name, xp: '0', avatarId: 'avatar-1', selectedFrame: 0, ownedFrames: [0] };
  if (db) {
    const snap = await db.collection('users').doc(req.user.uid).get();
    if (snap.exists) profile = { ...profile, ...snap.data() };
  }
  const balance = await getBalance(req.user.uid);
  return res.json({ ok: true, profile: { ...profile, balance, progression: calculateProgression(profile.xp || '0') } });
});

router.post('/profile/avatar', verifyBearerToken, async (req, res) => {
  const avatarId = String(req.body.avatarId || 'avatar-1').slice(0, 40);
  const selectedFrame = Number.isInteger(req.body.selectedFrame) ? req.body.selectedFrame : Number(req.body.selectedFrame || 0);
  const db = getDb();
  if (db) {
    const ref = db.collection('users').doc(req.user.uid);
    const snap = await ref.get();
    const ownedFrames = Array.isArray(snap.get('ownedFrames')) ? snap.get('ownedFrames') : [0];
    if (!ownedFrames.includes(selectedFrame)) return res.status(403).json({ ok: false, error: 'FRAME_LOCKED' });
    await ref.set({ avatarId, selectedFrame, updatedAt: new Date().toISOString() }, { merge: true });
  }
  return res.json({ ok: true, avatarId, selectedFrame });
});

module.exports = router;

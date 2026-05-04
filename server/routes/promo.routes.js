const express = require('express');
const { requireAuth, requireAdmin } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { creditBalance } = require('../core/economyService');
const { runtimeStore } = require('../core/runtimeStore');
const router = express.Router();
const normalizeCode = (v) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
router.post('/admin/promo', requireAuth, requireAdmin, async (req, res) => {
  const code = normalizeCode(req.body.code);
  const amount = Math.max(0, Math.trunc(Number(req.body.amount) || 0));
  if (!code || !amount) return res.status(400).json({ ok:false, error:'CODE_AMOUNT_REQUIRED' });
  const payload = { code, amount, active: req.body.active !== false, maxClaims: Math.max(1, Math.trunc(Number(req.body.maxClaims) || 1)), createdBy: req.user.uid, updatedAt: Date.now() };
  const { db } = initFirebaseAdmin();
  if (db) { await Promise.all([db.collection('promoCodes').doc(code).set(payload, { merge: true }), db.collection('promos').doc(code).set(payload, { merge: true })]); }
  else runtimeStore.temporary.set(`promo:${code}`, payload, 30 * 86400000);
  res.json({ ok:true, promo: payload });
});
router.post('/promo/claim', requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const code = normalizeCode(req.body.code);
  if (!code) return res.status(400).json({ ok:false, error:'CODE_REQUIRED' });
  const claimKey = `promo:${code}:${uid}`;
  const { db } = initFirebaseAdmin();
  let promo = null;
  if (db) {
    const promoCodeRef = db.collection('promoCodes').doc(code);
    const legacyPromoRef = db.collection('promos').doc(code);
    let promoSnap = await promoCodeRef.get();
    if (!promoSnap.exists) promoSnap = await legacyPromoRef.get();
    if (!promoSnap.exists) return res.status(404).json({ ok:false, error:'PROMO_NOT_FOUND' });
    promo = promoSnap.data();
    if (promo.active === false) return res.status(409).json({ ok:false, error:'PROMO_INACTIVE' });
    const maxClaims = Math.max(1, Math.trunc(Number(promo.maxClaims || promo.usageLimit || 1)));
    const claimedCount = Math.max(0, Math.trunc(Number(promo.claimedCount || 0)));
    if (claimedCount >= maxClaims) return res.status(409).json({ ok:false, error:'PROMO_LIMIT_REACHED' });
    const claimRef = db.collection('promoClaims').doc(claimKey);
    if ((await claimRef.get()).exists) return res.status(409).json({ ok:false, error:'PROMO_ALREADY_CLAIMED' });
    const economy = await creditBalance({ uid, amount: promo.amount, reason: `promo:${code}`, idempotencyKey: claimKey });
    if (!economy.ok) return res.status(400).json(economy);
    const admin = require('firebase-admin');
    await Promise.all([
      claimRef.set({ uid, code, amount: promo.amount, at: Date.now() }, { merge: false }),
      promoCodeRef.set({ ...promo, code, claimedCount: admin.firestore.FieldValue.increment(1), updatedAt: Date.now() }, { merge:true }),
      legacyPromoRef.set({ ...promo, code, claimedCount: admin.firestore.FieldValue.increment(1), updatedAt: Date.now() }, { merge:true })
    ]);
    return res.json({ ok:true, code, amount: promo.amount, balance: economy.balance });
  }
  promo = runtimeStore.temporary.get(`promo:${code}`);
  if (!promo) return res.status(404).json({ ok:false, error:'PROMO_NOT_FOUND' });
  if (runtimeStore.temporary.get(claimKey)) return res.status(409).json({ ok:false, error:'PROMO_ALREADY_CLAIMED' });
  const economy = await creditBalance({ uid, amount: promo.amount, reason: `promo:${code}`, idempotencyKey: claimKey });
  runtimeStore.temporary.set(claimKey, true, 30*86400000);
  res.json({ ok:true, code, amount: promo.amount, balance: economy.balance });
});
module.exports = router;

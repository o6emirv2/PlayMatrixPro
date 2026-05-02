const express = require('express');
const { getAuth, getDb } = require('../config/firebaseAdmin');
const { signInWithPassword, updateEmailWithIdToken } = require('../core/firebaseRestAuth');
const { createRateLimiter, verifyBearerToken, ensureUserProfile } = require('../core/security');
const { isEmail } = require('../core/validation');
const { addAdminRuntimeLog } = require('../admin/adminRuntimeLogStore');

const router = express.Router();
const authLimiter = createRateLimiter({ windowMs: 60000, max: 12 });

router.post('/login', authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!isEmail(email) || password.length < 6) return res.status(400).json({ ok: false, error: 'INVALID_CREDENTIALS' });
    const login = await signInWithPassword(email, password);
    const auth = getAuth();
    const decoded = auth ? await auth.verifyIdToken(login.idToken, true) : { uid: login.localId, email };
    await ensureUserProfile({ uid: decoded.uid, email: decoded.email || email, name: decoded.name || email });
    return res.json({ ok: true, token: login.idToken, refreshToken: login.refreshToken, user: { uid: decoded.uid, email: decoded.email || email } });
  } catch (error) {
    return res.status(401).json({ ok: false, error: error.code || 'LOGIN_FAILED' });
  }
});

router.get('/session', verifyBearerToken, async (req, res) => {
  await ensureUserProfile(req.user);
  return res.json({ ok: true, user: req.user });
});

router.post('/update-email', authLimiter, verifyBearerToken, async (req, res) => {
  try {
    const newEmail = String(req.body.newEmail || '').trim().toLowerCase();
    const currentPassword = String(req.body.currentPassword || '');
    if (!isEmail(newEmail)) return res.status(400).json({ ok: false, error: 'INVALID_EMAIL' });
    if (currentPassword.length < 6) return res.status(400).json({ ok: false, error: 'PASSWORD_REQUIRED' });
    const reauth = await signInWithPassword(req.user.email, currentPassword);
    const updated = await updateEmailWithIdToken(reauth.idToken, newEmail);
    const auth = getAuth();
    if (auth) await auth.updateUser(req.user.uid, { email: newEmail, emailVerified: false });
    const db = getDb();
    if (db) await db.collection('users').doc(req.user.uid).set({ email: newEmail, emailVerified: false, updatedAt: new Date().toISOString() }, { merge: true });
    addAdminRuntimeLog('USER_EMAIL_UPDATED', { uid: req.user.uid, newEmail });
    return res.json({ ok: true, token: updated.idToken || reauth.idToken, email: newEmail });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.code || 'EMAIL_UPDATE_FAILED' });
  }
});

module.exports = router;

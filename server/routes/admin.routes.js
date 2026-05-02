const express = require('express');
const { verifyBearerToken, requireAdmin } = require('../core/security');
const { listAdminRuntimeLogs, addAdminRuntimeLog } = require('../admin/adminRuntimeLogStore');
const { getAuth, getDb } = require('../config/firebaseAdmin');
const { isEmail } = require('../core/validation');

const router = express.Router();
router.use(verifyBearerToken, requireAdmin);

router.get('/runtime-logs', (req, res) => {
  res.json({ ok: true, logs: listAdminRuntimeLogs() });
});

router.post('/users/:uid/email', async (req, res) => {
  const uid = String(req.params.uid || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!uid || !isEmail(email)) return res.status(400).json({ ok: false, error: 'INVALID_INPUT' });
  const auth = getAuth();
  const db = getDb();
  if (!auth || !db) return res.status(503).json({ ok: false, error: 'FIREBASE_UNAVAILABLE' });
  await auth.updateUser(uid, { email, emailVerified: false });
  await db.collection('users').doc(uid).set({ email, emailVerified: false, updatedAt: new Date().toISOString() }, { merge: true });
  addAdminRuntimeLog('ADMIN_USER_EMAIL_UPDATED', { adminUid: req.user.uid, targetUid: uid, email });
  return res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const env = require('../config/env');
const { requireAuth, strictLimiter } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('../core/runtimeStore');

const router = express.Router();

function normalizeIdentifier(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9ğüşöçıİ@._-]/gi, '').slice(0, 120);
}

router.get('/public/runtime-config', (_req, res) => res.json({ ok: true, apiBase: env.publicApiBase, canonicalOrigin: env.canonicalOrigin, firebase: env.firebase.publicConfig }));
router.get('/auth/me', requireAuth, (req, res) => res.json({ ok: true, user: req.user }));

router.post('/auth/resolve-login', strictLimiter, async (req, res) => {
  const identifier = normalizeIdentifier(req.body?.identifier);
  if (!identifier) return res.status(400).json({ ok: false, error: 'IDENTIFIER_REQUIRED' });
  if (identifier.includes('@')) return res.json({ ok: true, email: identifier, source: 'email' });

  const { db } = initFirebaseAdmin();
  if (db) {
    const snap = await db.collection('users').where('usernameLower', '==', identifier).limit(1).get();
    if (!snap.empty) {
      const data = snap.docs[0].data() || {};
      if (data.email) return res.json({ ok: true, email: String(data.email).toLowerCase(), uid: snap.docs[0].id, source: 'username' });
    }
  } else {
    for (const [, profile] of runtimeStore.userProfiles.entries()) {
      if (String(profile?.usernameLower || '').toLowerCase() === identifier && profile?.email) {
        return res.json({ ok: true, email: String(profile.email).toLowerCase(), uid: profile.uid, source: 'runtime' });
      }
    }
  }
  return res.status(404).json({ ok: false, error: 'ACCOUNT_NOT_FOUND' });
});

module.exports = router;

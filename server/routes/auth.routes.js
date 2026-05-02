'use strict';

const express = require('express');
const config = require('../config/env');
const { getAuth, getDb, getServerTimestamp, isFirebaseReady } = require('../config/firebaseAdmin');
const { signInWithPassword } = require('../core/firebaseRestAuth');
const { requireAuth } = require('../core/authMiddleware');
const { asyncRoute, publicUser, makeHttpError, normalizeEmail } = require('../core/security');
const { requireEmail, requireString, optionalString } = require('../core/validation');
const { ensureUserProfile, updateUserProfile, DEMO_USER_ID } = require('../core/userService');
const { smartDataRouter } = require('../core/smartDataRouter');

function createAuthRouter() {
  const router = express.Router();

  router.get('/public-config', (_req, res) => {
    res.json({
      ok: true,
      app: {
        name: 'PlayMatrix',
        apiBase: config.publicApiBase,
        backendOrigin: config.publicBackendOrigin,
        demoAuthEnabled: config.security.demoAuthEnabled,
        firebaseReady: isFirebaseReady()
      },
      firebase: config.firebase.publicConfig
    });
  });

  router.post('/sign-in', asyncRoute(async (req, res) => {
    const email = requireEmail(req.body);
    const password = requireString(req.body, 'password', 160);

    if (config.security.demoAuthEnabled && email === 'demo@playmatrix.local') {
      const profile = await ensureUserProfile(DEMO_USER_ID, { email, displayName: 'Demo Oyuncu' });
      return res.json({ ok: true, token: 'demo.local-token', user: publicUser(profile), demo: true });
    }

    const authData = await signInWithPassword(email, password);
    const profile = await ensureUserProfile(authData.localId, { email, displayName: email.split('@')[0] });
    return res.json({ ok: true, token: authData.idToken, refreshToken: authData.refreshToken, user: publicUser(profile) });
  }));

  router.post('/sign-up', asyncRoute(async (req, res) => {
    const email = requireEmail(req.body);
    const password = requireString(req.body, 'password', 160);
    const displayName = optionalString(req.body, 'displayName', 60) || email.split('@')[0];
    const auth = getAuth();
    if (!auth) throw makeHttpError(503, 'Firebase Admin ENV tanımlı olmadığı için üretim kayıt işlemi kapalı.', 'FIREBASE_ADMIN_MISSING');

    const record = await auth.createUser({ email, password, displayName, emailVerified: false, disabled: false });
    const profile = await ensureUserProfile(record.uid, { email, displayName });
    await smartDataRouter({
      priority: 'CRITICAL',
      type: 'user_created',
      userId: record.uid,
      collection: 'auditEvents',
      id: `user_created_${record.uid}`,
      payload: { email }
    });
    res.status(201).json({ ok: true, user: publicUser(profile) });
  }));

  router.get('/me', requireAuth, asyncRoute(async (req, res) => {
    res.json({ ok: true, user: publicUser(req.user.profile) });
  }));

  router.post('/update-email', requireAuth, asyncRoute(async (req, res) => {
    const newEmail = requireEmail(req.body, 'newEmail');
    const password = requireString(req.body, 'password', 160);
    const currentEmail = normalizeEmail(req.user.email || req.user.profile.email);
    const auth = getAuth();
    if (!auth) throw makeHttpError(503, 'Firebase Admin ENV tanımlı değil.', 'FIREBASE_ADMIN_MISSING');
    if (!currentEmail) throw makeHttpError(400, 'Mevcut e-posta bulunamadı.', 'EMAIL_MISSING');

    await signInWithPassword(currentEmail, password);
    await auth.updateUser(req.user.uid, { email: newEmail, emailVerified: false });
    const profile = await updateUserProfile(req.user.uid, { email: newEmail });
    await smartDataRouter({
      priority: 'CRITICAL',
      type: 'email_updated',
      userId: req.user.uid,
      collection: 'auditEvents',
      id: `email_updated_${req.user.uid}_${Date.now()}`,
      payload: { previousEmail: currentEmail, newEmail }
    });
    res.json({ ok: true, user: publicUser(profile), message: 'E-posta adresi güncellendi.' });
  }));

  router.post('/admin-update-email', requireAuth, asyncRoute(async (req, res) => {
    const uid = requireString(req.body, 'uid', 128);
    const newEmail = requireEmail(req.body, 'newEmail');
    const requester = req.user;
    const requesterEmail = String(requester.email || '').toLowerCase();
    const isAdmin = config.admins.uids.includes(requester.uid) || config.admins.emails.includes(requesterEmail) || config.admins.primaryUid === requester.uid || config.admins.primaryEmail === requesterEmail;
    if (!isAdmin) throw makeHttpError(403, 'Admin yetkisi gerekli.', 'ADMIN_REQUIRED');

    const auth = getAuth();
    const db = getDb();
    if (!auth || !db) throw makeHttpError(503, 'Firebase Admin ENV tanımlı değil.', 'FIREBASE_ADMIN_MISSING');
    await auth.updateUser(uid, { email: newEmail, emailVerified: false });
    await db.collection('users').doc(uid).set({ email: newEmail, updatedAt: getServerTimestamp() }, { merge: true });
    await smartDataRouter({
      priority: 'CRITICAL',
      type: 'admin_email_updated',
      userId: requester.uid,
      collection: 'auditEvents',
      id: `admin_email_updated_${uid}_${Date.now()}`,
      payload: { targetUid: uid, newEmail }
    });
    res.json({ ok: true, message: 'Auth ve Firestore e-posta bilgisi senkron güncellendi.' });
  }));

  return router;
}

module.exports = createAuthRouter;

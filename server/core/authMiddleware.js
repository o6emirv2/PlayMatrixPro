'use strict';

const config = require('../config/env');
const { getAuth } = require('../config/firebaseAdmin');
const { getBearerToken, makeHttpError } = require('./security');
const { ensureUserProfile, DEMO_USER_ID } = require('./userService');

async function decodeToken(token) {
  const auth = getAuth();
  if (auth && token) return auth.verifyIdToken(token, true);
  if (config.security.demoAuthEnabled && (!token || token.startsWith('demo'))) {
    return { uid: DEMO_USER_ID, email: 'demo@playmatrix.local', name: 'Demo Oyuncu' };
  }
  throw makeHttpError(401, 'Oturum doğrulanamadı.', 'AUTH_REQUIRED');
}

async function requireAuth(req, _res, next) {
  try {
    const token = getBearerToken(req);
    const decoded = await decodeToken(token);
    const profile = await ensureUserProfile(decoded.uid, {
      email: decoded.email || '',
      displayName: decoded.name || decoded.email || 'Oyuncu'
    });
    req.user = { uid: decoded.uid, email: decoded.email || profile.email || '', decoded, profile };
    next();
  } catch (err) {
    next(err);
  }
}

async function optionalAuth(req, _res, next) {
  try {
    const token = getBearerToken(req);
    if (!token && !config.security.demoAuthEnabled) return next();
    const decoded = await decodeToken(token);
    const profile = await ensureUserProfile(decoded.uid, {
      email: decoded.email || '',
      displayName: decoded.name || decoded.email || 'Oyuncu'
    });
    req.user = { uid: decoded.uid, email: decoded.email || profile.email || '', decoded, profile };
    next();
  } catch (_) {
    next();
  }
}

async function requireAdmin(req, res, next) {
  try {
    await requireAuth(req, res, async (err) => {
      if (err) return next(err);
      const uid = req.user.uid;
      const email = String(req.user.email || '').toLowerCase();
      const isAdmin = config.admins.uids.includes(uid) || config.admins.emails.includes(email) || config.admins.primaryUid === uid || config.admins.primaryEmail === email;
      if (!isAdmin) return next(makeHttpError(403, 'Admin yetkisi gerekli.', 'ADMIN_REQUIRED'));
      return next();
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { decodeToken, requireAuth, optionalAuth, requireAdmin };

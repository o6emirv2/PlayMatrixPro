const crypto = require('crypto');
const { env } = require('../config/env');
const { getAuth, getDb } = require('../config/firebaseAdmin');

function safeString(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function makeId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function createRateLimiter({ windowMs = 60000, max = 30 } = {}) {
  const hits = new Map();
  return function rateLimiter(req, res, next) {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = hits.get(key) || [];
    const fresh = bucket.filter((time) => now - time < windowMs);
    fresh.push(now);
    hits.set(key, fresh);
    if (fresh.length > max) return res.status(429).json({ ok: false, error: 'RATE_LIMITED' });
    return next();
  };
}

async function verifyBearerToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
  const auth = getAuth();
  if (!auth) return res.status(503).json({ ok: false, error: 'FIREBASE_ADMIN_UNAVAILABLE' });
  try {
    const decoded = await auth.verifyIdToken(token, true);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      emailVerified: Boolean(decoded.email_verified),
      name: decoded.name || decoded.email || 'PlayMatrix User'
    };
    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
  }
}

function isAdminIdentity(user) {
  if (!user) return false;
  return env.admin.uids.includes(user.uid) || env.admin.emails.includes(user.email);
}

function requireAdmin(req, res, next) {
  if (!isAdminIdentity(req.user)) return res.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
  return next();
}

async function ensureUserProfile(user) {
  const db = getDb();
  if (!db || !user?.uid) return null;
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const now = new Date().toISOString();
    await ref.set({
      uid: user.uid,
      email: user.email || '',
      displayName: user.name || 'Oyuncu',
      balance: 0,
      xp: '0',
      avatarId: 'avatar-1',
      selectedFrame: 0,
      ownedFrames: [0],
      createdAt: now,
      updatedAt: now
    }, { merge: true });
  } else if (user.email && snap.get('email') !== user.email) {
    await ref.set({ email: user.email, updatedAt: new Date().toISOString() }, { merge: true });
  }
  return ref;
}

module.exports = { safeString, makeId, createRateLimiter, verifyBearerToken, requireAdmin, isAdminIdentity, ensureUserProfile };

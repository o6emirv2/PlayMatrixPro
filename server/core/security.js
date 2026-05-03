const rateLimit = require('express-rate-limit');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');
const env = require('../config/env');
const apiLimiter = rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false });
const strictLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
async function requireAuth(req, res, next) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const { auth } = initFirebaseAdmin();
    if (auth && token) { req.user = await auth.verifyIdToken(token); return next(); }
    const sessionToken = String(req.headers['x-session-token'] || req.cookies?.pm_session_token || req.body?.sessionToken || req.query?.sessionToken || '').trim();
    if (sessionToken) {
      const session = runtimeStore.temporary.get(`session:${sessionToken}`);
      if (session?.uid) { req.user = { uid: String(session.uid), email: String(session.email || '') }; return next(); }
    }
    const devUid = req.headers['x-playmatrix-user'] || req.body?.uid || req.query?.uid;
    if (process.env.NODE_ENV !== 'production' && devUid) { req.user = { uid: String(devUid), email: 'local@playmatrix.test' }; return next(); }
    return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
  } catch (error) { return res.status(401).json({ ok: false, error: 'AUTH_INVALID' }); }
}
function requireAdmin(req, res, next) {
  const uid = req.user?.uid || req.headers['x-admin-uid'];
  const email = req.user?.email || req.headers['x-admin-email'];
  if (env.adminUids.includes(String(uid)) || env.adminEmails.includes(String(email))) return next();
  return res.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
}
module.exports = { apiLimiter, strictLimiter, requireAuth, requireAdmin };

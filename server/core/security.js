const rateLimit = require('express-rate-limit');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const env = require('../config/env');
const { runtimeStore } = require('../core/runtimeStore');
const rateLimitOptions = { windowMs: 60_000, standardHeaders: true, legacyHeaders: false, validate: { xForwardedForHeader: false } };
const apiLimiter = rateLimit({ ...rateLimitOptions, max: 240 });
const strictLimiter = rateLimit({ ...rateLimitOptions, max: 30 });
async function requireAuth(req, res, next) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const { auth } = initFirebaseAdmin();
    if (auth && token) { req.user = await auth.verifyIdToken(token); return next(); }
    const cookieToken = String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('pm_session='));
    const sessionToken = String(req.headers['x-session-token'] || req.headers['X-Session-Token'] || (cookieToken ? decodeURIComponent(cookieToken.slice('pm_session='.length)) : '') || '').trim();
    if (sessionToken) {
      const session = runtimeStore.temporary.get(`session:${sessionToken}`);
      if (session?.uid) { req.user = { uid: String(session.uid), email: String(session.email || ''), sessionSource: String(session.sessionSource || 'runtime-session'), sessionId: String(session.sessionId || '') }; return next(); }
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

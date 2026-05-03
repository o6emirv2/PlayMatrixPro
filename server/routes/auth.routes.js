const express = require('express');
const crypto = require('crypto');
const env = require('../config/env');
const { requireAuth } = require('../core/security');
const { runtimeStore } = require('../core/runtimeStore');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { normalizeEmail, issueStepTicket, verifyStepTicket, verifySecondFactor, verifyThirdFactor, issueClientGateKey, verifyClientGateKey, configuredAdminByEmail, isConfiguredAdmin } = require('../core/adminMatrix');

const router = express.Router();
const SESSION_TTL_MS = 30 * 86400000;
const ADMIN_SESSION_TTL_MS = 12 * 3600000;
const clean = (v = '', max = 240) => String(v || '').trim().slice(0, max);
const now = () => Date.now();

function publicRuntime() {
  return { ok:true, apiBase: env.publicApiBase, canonicalOrigin: env.canonicalOrigin, firebase: env.firebase.publicConfig };
}
function issueSession({ uid, email = '', source = 'firebase_id_token', emailVerified = false, ttlMs = SESSION_TTL_MS } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomUUID();
  const session = { uid: clean(uid,160), email: normalizeEmail(email), source, emailVerified: !!emailVerified, sessionId, createdAt: now(), lastSeenAt: now(), expiresAt: now() + ttlMs };
  runtimeStore.temporary.set(`session:${token}`, session, ttlMs);
  if (source === 'admin_matrix') runtimeStore.temporary.set(`adminSession:${token}`, session, ttlMs);
  return { token, session };
}
function readSession(req) {
  const token = clean(req.headers['x-session-token'] || req.body?.sessionToken || req.query?.sessionToken, 200);
  if (!token) return null;
  const session = runtimeStore.temporary.get(`session:${token}`) || runtimeStore.temporary.get(`adminSession:${token}`);
  return session ? { token, ...session } : null;
}
async function resolveOptionalUser(req) {
  const authHeader = clean(req.headers.authorization, 3000);
  if (/^Bearer\s+/i.test(authHeader)) {
    const { auth } = initFirebaseAdmin();
    if (auth) {
      try {
        const decoded = await auth.verifyIdToken(authHeader.replace(/^Bearer\s+/i, '').trim());
        return { uid: clean(decoded.uid,160), email: normalizeEmail(decoded.email || ''), emailVerified: !!decoded.email_verified, claims: decoded, source: 'firebase_id_token' };
      } catch (error) {
        console.error('[admin:identity:bearer:error]', JSON.stringify({ message: error.message }));
      }
    }
  }
  const session = readSession(req);
  if (session?.uid) return { uid: session.uid, email: normalizeEmail(session.email), emailVerified: !!session.emailVerified, sessionId: session.sessionId, source: session.source };
  const devUid = process.env.NODE_ENV !== 'production' ? clean(req.headers['x-playmatrix-user'] || req.query?.uid || req.body?.uid, 160) : '';
  if (devUid) return { uid: devUid, email: normalizeEmail(req.headers['x-admin-email'] || 'local@playmatrix.test'), source: 'dev' };
  return null;
}
function adminContext(user = {}) {
  const email = normalizeEmail(user.email || '');
  const uid = clean(user.uid, 160);
  if (!isConfiguredAdmin({ uid, email })) return null;
  return { uid: uid || configuredAdminByEmail(email)?.uid || '', email, role: 'owner', roles: ['owner'], permissions: ['admin.read', 'users.write', 'moderation.write', 'rewards.write', 'system.read'], source: 'env-admin' };
}
function serializeAdmin(context = {}) {
  return { role: context.role || 'owner', roles: context.roles || ['owner'], permissions: context.permissions || [], source: context.source || 'env-admin' };
}

router.get('/public/runtime-config', (_req,res)=>res.json(publicRuntime()));
router.get('/auth/me', requireAuth, (req,res)=>res.json({ ok:true, user:req.user }));

router.post('/auth/session/create', requireAuth, (req, res) => {
  const out = issueSession({ uid: req.user.uid, email: req.user.email || '', emailVerified: !!(req.user.email_verified || req.user.emailVerified), source: 'firebase_id_token' });
  res.json({ ok:true, sessionToken: out.token, session: { token: out.token, id: out.session.sessionId, expiresAt: out.session.expiresAt, ttlMs: SESSION_TTL_MS } });
});
router.post('/auth/session/logout', (req, res) => {
  const token = clean(req.headers['x-session-token'] || req.body?.sessionToken, 200);
  if (token) { runtimeStore.temporary.delete(`session:${token}`); runtimeStore.temporary.delete(`adminSession:${token}`); }
  res.json({ ok:true });
});
router.get('/auth/session/status', (req, res) => {
  const session = readSession(req);
  res.json({ ok:true, active: !!session, session: session ? { uid: session.uid, email: session.email, source: session.source, expiresAt: session.expiresAt } : null });
});

router.get('/auth/admin/matrix/identity', async (req, res) => {
  const user = await resolveOptionalUser(req);
  if (!user?.uid && !user?.email) return res.status(401).json({ ok:false, authenticated:false, admin:false, user:null, error:'Aktif oturum bulunamadı.' });
  const context = adminContext(user);
  if (!context) return res.status(403).json({ ok:false, authenticated:true, admin:false, user:{ uid:user.uid, email:user.email }, error:'Bu hesap için yönetici yetkisi bulunamadı.' });
  res.json({ ok:true, authenticated:true, admin:true, user:{ uid:context.uid, email:context.email }, adminContext: serializeAdmin(context) });
});

router.post('/auth/admin/matrix/step-email', async (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  if (!email || !email.includes('@')) return res.status(400).json({ ok:false, error:'Geçerli yönetici e-postası gerekli.' });
  const current = await resolveOptionalUser(req);
  if (current?.email && normalizeEmail(current.email) !== email) return res.status(403).json({ ok:false, error:'Algılanan e-posta aktif oturumla eşleşmiyor.' });
  const candidate = current?.email ? adminContext(current) : configuredAdminByEmail(email);
  if (!candidate) return res.status(403).json({ ok:false, error:'Aktif yönetici oturumu bulunamadı veya e-posta yetkili listesinde değil.' });
  const uid = candidate.uid || current?.uid || email;
  res.json({ ok:true, ticket: issueStepTicket({ uid, email, stage:2, role:candidate.role || 'owner', source:'admin_step_email' }), admin: serializeAdmin(candidate), boundToSession: !!current?.uid });
});

router.post('/auth/admin/matrix/step-password', (req, res) => {
  const verified = verifyStepTicket(req.body?.ticket || '', 2);
  if (!verified.ok) return res.status(401).json({ ok:false, error:'Güvenlik oturumu geçersiz.' });
  if (!verifySecondFactor(String(req.body?.password || ''))) return res.status(403).json({ ok:false, error:'Güvenlik şifresi doğrulanamadı.' });
  res.json({ ok:true, ticket: issueStepTicket({ ...verified.payload, stage:3, source:'admin_step_password' }) });
});

router.post('/auth/admin/matrix/step-name', (req, res) => {
  const verified = verifyStepTicket(req.body?.ticket || '', 3);
  if (!verified.ok) return res.status(401).json({ ok:false, error:'Güvenlik oturumu geçersiz.' });
  if (!verifyThirdFactor(String(req.body?.adminName || req.body?.name || ''))) return res.status(403).json({ ok:false, error:'Son güvenlik doğrulaması başarısız oldu.' });
  const context = adminContext(verified.payload) || configuredAdminByEmail(verified.payload.email);
  if (!context) return res.status(403).json({ ok:false, error:'Yönetici yetkisi doğrulanamadı.' });
  const issued = issueSession({ uid: context.uid || verified.payload.uid, email: context.email || verified.payload.email, source:'admin_matrix', emailVerified:true, ttlMs: ADMIN_SESSION_TTL_MS });
  const clientKey = issueClientGateKey({ uid: issued.session.uid, email: issued.session.email, sessionId: issued.session.sessionId });
  res.json({ ok:true, redirectTo:'/admin/', sessionToken: issued.token, session:{ token: issued.token, id: issued.session.sessionId, expiresAt: issued.session.expiresAt }, clientKey, admin: serializeAdmin(context) });
});

router.get('/auth/admin/matrix/status', async (req, res) => {
  const session = readSession(req);
  if (!session?.uid) return res.status(401).json({ ok:false, authenticated:false, redirectTo:'/admin/', error:'Yönetici oturumu bulunamadı.' });
  if (session.source !== 'admin_matrix') return res.status(403).json({ ok:false, authenticated:true, redirectTo:'/admin/', code:'ADMIN_MATRIX_SESSION_REQUIRED', error:'Yönetici paneli için adımlı doğrulama tamamlanmalıdır.' });
  const context = adminContext(session);
  if (!context) return res.status(403).json({ ok:false, authenticated:false, redirectTo:'/admin/', error:'Yönetici yetkisi doğrulanamadı.' });
  const clientKey = clean(req.headers['x-admin-client-key'], 2000);
  const checked = verifyClientGateKey(clientKey);
  if (!checked.ok || checked.payload.uid !== session.uid || checked.payload.sessionId !== session.sessionId) return res.status(403).json({ ok:false, authenticated:true, redirectTo:'/admin/', code: checked.code || 'ADMIN_CLIENT_KEY_REQUIRED', error:'Yönetici güvenlik anahtarı doğrulanamadı.' });
  res.json({ ok:true, authenticated:true, user:{ uid:context.uid, email:context.email }, admin: serializeAdmin(context), clientKey: issueClientGateKey({ uid:session.uid, email:session.email, sessionId:session.sessionId }) });
});

router.post('/auth/admin/matrix/logout', (req, res) => {
  const token = clean(req.headers['x-session-token'] || req.body?.sessionToken, 200);
  if (token) { runtimeStore.temporary.delete(`session:${token}`); runtimeStore.temporary.delete(`adminSession:${token}`); }
  res.json({ ok:true });
});

module.exports = router;

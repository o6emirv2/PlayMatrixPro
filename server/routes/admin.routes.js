const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireAdmin, strictLimiter } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { listAdminLogs, addAdminLog } = require('../admin/adminRuntimeLogStore');
const { runSafeFirestoreCleanup } = require('../core/firestoreCleanupService');
const { runtimeStore } = require('../core/runtimeStore');
const { getProgression } = require('../core/progressionService');

const router = express.Router();
const now = () => Date.now();
const safe = (value, max = 300) => String(value || '').trim().slice(0, max).replace(/[<>]/g, '');
const money = (value) => Math.max(-10_000_000, Math.min(10_000_000, Math.trunc(Number(value) || 0)));
const nonNegativeMoney = (value) => Math.max(0, Math.min(10_000_000, Math.trunc(Number(value) || 0)));
const limitNumber = (value, fallback = 50, max = 200) => Math.max(1, Math.min(max, Math.trunc(Number(value) || fallback)));

router.use((req, res, next) => {
  if (!String(req.path || '').startsWith('/admin')) return next('router');
  return requireAuth(req, res, () => requireAdmin(req, res, next));
});

function fb() { return initFirebaseAdmin(); }
function adminActor(req) { return { uid: req.user?.uid || '', email: req.user?.email || '' }; }
function logAdmin(req, event, payload = {}) {
  return addAdminLog(event, { ...payload, actor: adminActor(req), path: req.originalUrl, at: now() });
}
function publicUser(uid, data = {}) {
  const xp = Number(data.accountXp ?? data.xp ?? 0) || 0;
  const progression = getProgression(xp);
  return {
    uid,
    email: data.email || '',
    username: data.username || data.displayName || data.fullName || uid,
    fullName: data.fullName || '',
    balance: Number(data.balance || 0),
    accountXp: progression.currentXp,
    accountXpExact: progression.currentXpExact,
    accountLevel: progression.accountLevel,
    accountLevelProgressPct: progression.accountLevelProgressPct,
    progressPercent: progression.progressPercent,
    selectedFrame: Number(data.selectedFrame || 0) || 0,
    avatar: data.avatar || '',
    banned: !!data.banned,
    banReason: data.banReason || '',
    emailVerified: !!data.emailVerified,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    lastSeen: data.lastSeen || data.lastLogin || null
  };
}
async function listUsers({ search = '', limit = 50 } = {}) {
  const { db } = fb();
  if (!db) return [];
  const rows = [];
  const trimmed = safe(search, 80).toLowerCase();
  try {
    const snap = await db.collection('users').limit(limitNumber(limit, 50)).get();
    snap.forEach((doc) => {
      const data = doc.data() || {};
      const text = `${doc.id} ${data.email || ''} ${data.username || ''} ${data.fullName || ''}`.toLowerCase();
      if (!trimmed || text.includes(trimmed)) rows.push(publicUser(doc.id, data));
    });
  } catch (error) {
    logAdmin({ user: {} , originalUrl: 'internal:listUsers' }, 'admin.users.list.error', { message: error.message });
  }
  return rows;
}
async function setUserPatch(uid, patch = {}) {
  const { db } = fb();
  if (!db) return { firestore: false };
  await db.collection('users').doc(uid).set({ ...patch, updatedAt: now() }, { merge: true });
  return { firestore: true };
}
async function incrementBalance(uid, amount, reason, req) {
  const { db, admin } = fb();
  if (!uid || !amount) return { ok: false, error: 'UID_AMOUNT_REQUIRED' };
  const safeAmount = Math.trunc(Number(amount) || 0);
  const key = `admin-economy:${uid}:${crypto.randomUUID()}`;
  if (!db || !admin) {
    logAdmin(req, 'admin.balance.local', { uid, amount: safeAmount, reason, key });
    return { ok: true, firestore: false, amount: safeAmount };
  }
  let nextBalance = 0;
  await db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid);
    const snap = await tx.get(userRef);
    const current = Math.max(0, Number((snap.exists ? snap.data().balance : 0) || 0));
    if (safeAmount < 0 && current + safeAmount < 0) throw Object.assign(new Error('INSUFFICIENT_BALANCE'), { statusCode: 409, current });
    nextBalance = Math.max(0, current + safeAmount);
    const auditRef = db.collection('audit').doc(key);
    tx.set(userRef, { balance: nextBalance, updatedAt: now() }, { merge: true });
    tx.set(auditRef, { uid, amount: safeAmount, reason, balanceAfter: nextBalance, actor: adminActor(req), type: 'admin-balance', at: now() }, { merge: true });
  });
  logAdmin(req, 'admin.balance.update', { uid, amount: safeAmount, reason, key, balanceAfter: nextBalance });
  return { ok: true, firestore: true, amount: safeAmount, balance: nextBalance };
}

router.get('/admin/summary', async (req, res) => {
  const { db, enabled } = fb();
  let users = 0, banned = 0, totalBalance = 0;
  if (db) {
    try {
      const snap = await db.collection('users').limit(200).get();
      users = snap.size;
      snap.forEach((doc) => { const data = doc.data() || {}; if (data.banned) banned += 1; totalBalance += Number(data.balance || 0); });
    } catch (error) { logAdmin(req, 'admin.summary.error', { message: error.message }); }
  }
  res.json({ ok: true, firebaseEnabled: !!enabled, metrics: { users, banned, totalBalance, runtimeLogs: listAdminLogs().length, runtimeStores: Object.fromEntries(Object.entries(runtimeStore).map(([key, store]) => [key, typeof store.size === 'function' ? store.size() : 0])) }, actor: adminActor(req), at: now() });
});

router.get('/admin/users', async (req, res) => {
  const users = await listUsers({ search: req.query.search, limit: req.query.limit });
  res.json({ ok: true, users, count: users.length, at: now() });
});

router.get('/admin/users/:uid', async (req, res) => {
  const uid = safe(req.params.uid, 160);
  const { db } = fb();
  if (!db) return res.json({ ok: true, user: publicUser(uid, { uid }), firestore: false });
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
  res.json({ ok: true, user: publicUser(uid, snap.data() || {}) });
});

router.post('/admin/users/balance', strictLimiter, async (req, res) => {
  const uid = safe(req.body.uid, 160);
  const amount = money(req.body.amount);
  const reason = safe(req.body.reason || 'admin-adjustment', 120);
  try {
    const result = await incrementBalance(uid, amount, reason, req);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 400).json({ ok:false, error:error.message || 'BALANCE_UPDATE_FAILED', current:error.current });
  }
});

router.post('/admin/users/ban', strictLimiter, async (req, res) => {
  const uid = safe(req.body.uid, 160);
  if (!uid) return res.status(400).json({ ok: false, error: 'UID_REQUIRED' });
  const banned = req.body.banned !== false;
  const reason = safe(req.body.reason || (banned ? 'admin-ban' : 'admin-unban'), 220);
  await setUserPatch(uid, { banned, banReason: banned ? reason : '', bannedAt: banned ? now() : null, unbannedAt: banned ? null : now(), banActor: adminActor(req) });
  logAdmin(req, banned ? 'admin.user.ban' : 'admin.user.unban', { uid, reason });
  res.json({ ok: true, uid, banned, reason });
});

router.post('/admin/users/email', strictLimiter, async (req, res) => {
  const uid = safe(req.body.uid, 160);
  const email = safe(req.body.email, 254).toLowerCase();
  if (!uid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok:false, error:'UID_EMAIL_REQUIRED' });
  const { db, auth } = fb();
  if (auth) await auth.updateUser(uid, { email, emailVerified: false });
  if (db) await db.collection('users').doc(uid).set({ email, emailVerified: false, updatedAt: now() }, { merge:true });
  logAdmin(req, 'admin.email.update', { uid, emailMasked: email.replace(/^(.{2}).*(@.*)$/,'$1***$2') });
  res.json({ ok:true, uid, emailSynced: true, authUpdated: !!auth, firestoreUpdated: !!db });
});

router.get('/admin/payments', async (_req, res) => {
  const { db } = fb();
  const payments = [];
  if (db) {
    try { const snap = await db.collection('payments').orderBy('createdAt', 'desc').limit(50).get(); snap.forEach(d => payments.push({ id: d.id, ...d.data() })); } catch (_) {}
  }
  res.json({ ok: true, payments, count: payments.length });
});

router.get('/admin/promos', async (_req, res) => {
  const { db } = fb();
  const promos = [];
  if (db) { try { const snap = await db.collection('promos').limit(100).get(); snap.forEach(d => promos.push({ id: d.id, ...d.data() })); } catch (_) {} }
  res.json({ ok: true, promos });
});

router.post('/admin/promos', strictLimiter, async (req, res) => {
  const code = safe(req.body.code, 40).toUpperCase();
  const amount = Math.max(1, Math.min(1_000_000, Math.trunc(Number(req.body.amount) || 0)));
  const maxClaims = Math.max(1, Math.min(100000, Math.trunc(Number(req.body.maxClaims) || 1)));
  if (!code || !amount) return res.status(400).json({ ok:false, error:'PROMO_CODE_AMOUNT_REQUIRED' });
  const { db } = fb();
  const promo = { code, amount, maxClaims, active: req.body.active !== false, createdAt: now(), actor: adminActor(req) };
  if (db) await db.collection('promos').doc(code).set(promo, { merge: true });
  logAdmin(req, 'admin.promo.save', { code, amount, maxClaims });
  res.json({ ok: true, promo, firestore: !!db });
});

router.get('/admin/notifications', (_req, res) => {
  res.json({ ok: true, notifications: [], receiptPolicyDays: 30, persistentReceipts: true });
});

router.post('/admin/notifications/send', strictLimiter, (req, res) => {
  const notification = { id: `admin_${Date.now()}`, title: safe(req.body.title || 'PlayMatrix', 80), message: safe(req.body.message, 300), audience: safe(req.body.audience || 'all', 40), at: now(), actor: adminActor(req) };
  runtimeStore.temporary.set(`adminNotification:${notification.id}`, notification, 24 * 3600000);
  logAdmin(req, 'admin.notification.send', notification);
  res.json({ ok: true, notification });
});

router.get('/admin/games', (_req, res) => {
  res.json({ ok: true, games: [
    { slug:'snake', title:'Snake Pro', status:'online', backend:'/server/games/snake/index.js', data:'score-validation' },
    { slug:'space', title:'Space Pro', status:'online', backend:'/server/games/space/index.js', data:'score-validation' },
    { slug:'pattern-master', title:'Pattern Master', status:'online', backend:'/server/games/pattern-master/index.js', data:'score-validation' }
  ] });
});


router.get('/admin/matrix/dashboard', async (req, res) => {
  const { db } = fb(); let userCount = 0, deletedCount = 0, mutedCount = 0, totalBalance = 0;
  if (db) { try { const snap = await db.collection('users').limit(500).get(); userCount = snap.size; snap.forEach((doc) => { const d = doc.data() || {}; totalBalance += Math.max(0, Number(d.balance || 0)); if (d.deleted || d.deletedAt) deletedCount += 1; if (d.muted || d.banned || d.restrictions) mutedCount += 1; }); } catch (error) { logAdmin(req, 'admin.matrix.dashboard.error', { message: error.message }); } }
  res.json({ ok:true, metrics:{ userCount, dailyMcSpend:0, totalLoss:0, totalProfit:totalBalance, openRoomCount:0, deletedCount, mutedCount }, maintenance:{ classic:false }, at:now() });
});
router.get('/admin/matrix/promos', async (_req, res) => { const { db } = fb(); const items = []; if (db) { try { const snap = await db.collection('promos').limit(100).get(); snap.forEach(d => { const x = d.data() || {}; items.push({ id:d.id, code:x.code || d.id, amount:x.amount || 0, limitLeft:Math.max(0, Number(x.maxClaims || x.usageLimit || 0) - Number(x.claimedCount || 0)), expiresAt:x.expiresAt || 0 }); }); } catch (_) {} } res.json({ ok:true, items }); });
router.get('/admin/matrix/issues', (_req, res) => res.json({ ok:true, games:[], systems:[], recentErrors:listAdminLogs().slice(-30).map(x => ({ createdAt:x.at, scope:x.event, message:JSON.stringify(x.payload || {}).slice(0,180) })) }));
router.post('/admin/matrix/reset-nuclear', strictLimiter, async (req, res) => { if (String(req.body?.confirmText || '').toUpperCase() !== 'ONAYLIYORUM') return res.status(400).json({ ok:false, error:'CONFIRM_REQUIRED' }); logAdmin(req, 'admin.matrix.reset.requested', { fields:Array.isArray(req.body?.fields) ? req.body.fields : [] }); res.json({ ok:true, dryRun:true, message:'Güvenli mod: toplu sıfırlama dry-run olarak kaydedildi.' }); });
router.patch('/admin/matrix/maintenance', strictLimiter, (req, res) => { runtimeStore.temporary.set('admin:maintenance', { classic:!!req.body?.classic, at:now(), actor:adminActor(req) }, 30*86400000); logAdmin(req, 'admin.matrix.maintenance', req.body || {}); res.json({ ok:true, maintenance:{ classic:!!req.body?.classic } }); });
router.post('/admin/matrix/restrict-user', strictLimiter, (req, res) => { logAdmin(req, 'admin.matrix.restrict-user', { identifier:safe(req.body?.identifier,160), action:safe(req.body?.action,80), durationMinutes:Number(req.body?.durationMinutes||0), reason:safe(req.body?.reason,220) }); res.json({ ok:true }); });
router.post('/admin/matrix/reward-user', strictLimiter, async (req, res) => { const identifier = safe(req.body?.identifier,160); const amount = nonNegativeMoney(req.body?.amount); if (!identifier || !amount) return res.status(400).json({ ok:false, error:'IDENTIFIER_AMOUNT_REQUIRED' }); const result = await incrementBalance(identifier, amount, safe(req.body?.reason || 'admin-matrix-reward',120), req).catch(error => ({ ok:false, error:error.message })); res.json({ ok:!!result.ok, result }); });
router.post('/admin/matrix/reward-all', strictLimiter, (req, res) => { const amount = nonNegativeMoney(req.body?.amount); logAdmin(req, 'admin.matrix.reward-all.requested', { amount, reason:safe(req.body?.reason,160) }); res.json({ ok:true, dryRun:true, amount }); });
router.post('/admin/matrix/promo-codes', strictLimiter, async (req, res) => { const code = safe(req.body.code, 40).toUpperCase(); const amount = nonNegativeMoney(req.body.amount); const usageLimit = Math.max(1, Math.min(100000, Math.trunc(Number(req.body.usageLimit || req.body.maxClaims) || 1))); if (!code || !amount) return res.status(400).json({ ok:false, error:'PROMO_CODE_AMOUNT_REQUIRED' }); const { db } = fb(); const promo = { code, amount, usageLimit, maxClaims:usageLimit, onePerAccount:req.body.onePerAccount !== false, description:safe(req.body.description,200), expiresAt: now() + Math.max(1, Number(req.body.durationHours || 24))*3600000, active:true, createdAt:now(), actor:adminActor(req) }; if (db) await db.collection('promos').doc(code).set(promo, { merge:true }); logAdmin(req, 'admin.matrix.promo.create', { code, amount, usageLimit }); res.json({ ok:true, promo }); });

router.get('/admin/runtime-logs', (_req, res) => res.json({ ok:true, logs:listAdminLogs() }));

router.post('/admin/cleanup/firestore', strictLimiter, async (req,res) => {
  const { db } = fb();
  const report = await runSafeFirestoreCleanup({ db, dryRun:req.body?.dryRun !== false });
  logAdmin(req, 'admin.cleanup.firestore', report);
  res.json(report);
});

module.exports = router;

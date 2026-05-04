const express = require('express');
const { requireAuth } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('../core/runtimeStore');
const { dm } = require('../social/socialRuntimeStore');
const { shouldShowNotification, markNotificationShown } = require('../core/notificationService');

const router = express.Router();
const now = () => Date.now();
const clean = (value, max = 240) => String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
const uidOf = (req) => String(req.user?.uid || '').trim();

function normalizeNotification(row = {}, fallback = {}) {
  const id = clean(row.id || row.notificationId || fallback.id || `nt_${now()}_${Math.random().toString(36).slice(2)}`, 160);
  return {
    id,
    notificationId: id,
    type: clean(row.type || fallback.type || 'generic', 40),
    title: clean(row.title || fallback.title || 'Bildirim', 120),
    message: clean(row.message || row.text || row.body || fallback.message || '', 500),
    at: Number(row.at || row.createdAt || row.updatedAt || fallback.at || now()) || now(),
    read: !!(row.read || row.readAt || fallback.read),
    source: clean(row.source || fallback.source || 'playmatrix', 80),
    severity: clean(row.severity || fallback.severity || 'info', 24),
    data: row.data && typeof row.data === 'object' ? row.data : (fallback.data || {})
  };
}

const receiptKey = (uid, id) => `notificationReceipt:${uid}:${id}`;

async function readReceipts(db, uid, ids) {
  const receipts = new Map();
  if (!uid || !ids.length) return receipts;
  for (const id of ids.slice(0, 80)) {
    const memoryReceipt = runtimeStore.temporary.get(receiptKey(uid, id));
    if (memoryReceipt && typeof memoryReceipt === 'object') receipts.set(id, memoryReceipt);
  }
  if (!db) return receipts;
  await Promise.all(ids.slice(0, 60).map(async (id) => {
    const snap = await db.collection('notificationReceipts').doc(`${uid}:${id}`).get().catch(() => null);
    if (snap?.exists) receipts.set(id, { ...(receipts.get(id) || {}), ...(snap.data() || {}) });
  }));
  return receipts;
}

async function writeReceipt(db, uid, notificationId, patch) {
  const key = receiptKey(uid, notificationId);
  const next = { ...(runtimeStore.temporary.get(key) || {}), userId: uid, notificationId, ...patch, updatedAt: now() };
  runtimeStore.temporary.set(key, next, 30 * 86400000);
  if (db) await db.collection('notificationReceipts').doc(`${uid}:${notificationId}`).set(next, { merge: true });
  return next;
}

async function firestoreNotifications(db, uid, limit) {
  if (!db || !uid) return [];
  const queries = [
    db.collection('notifications').where('userId', '==', uid).limit(limit),
    db.collection('notifications').where('uid', '==', uid).limit(limit),
    db.collection('notifications').where('targetUid', '==', uid).limit(limit)
  ];
  const byId = new Map();
  for (const query of queries) {
    const snap = await query.get().catch(() => null);
    if (!snap) continue;
    snap.docs.forEach((doc) => byId.set(doc.id, normalizeNotification({ id: doc.id, ...(doc.data() || {}) }, { source: 'firebase' })));
  }
  return [...byId.values()];
}

function runtimeNotifications(uid) {
  const items = [];
  for (const value of runtimeStore.notifications.values()) {
    if (!value || typeof value !== 'object') continue;
    const target = clean(value.uid || value.userId || value.targetUid, 160);
    if (target && target !== uid) continue;
    items.push(normalizeNotification(value, { source: 'runtime' }));
  }
  for (const ticket of runtimeStore.support.values()) {
    if (!ticket || ticket.uid !== uid) continue;
    items.push(normalizeNotification(ticket, {
      id: `support_${ticket.id}`,
      type: 'support',
      title: 'Destek kaydı alındı',
      message: ticket.subject || ticket.text || 'Destek talebin kaydedildi.',
      source: 'support',
      at: ticket.at
    }));
  }
  for (const invite of runtimeStore.gameInvites.values()) {
    if (!invite || invite.targetUid !== uid) continue;
    items.push(normalizeNotification(invite, {
      id: invite.id || invite.inviteId,
      type: 'game-invite',
      title: 'Oyun daveti',
      message: `${invite.gameName || 'Oyun'} için davet aldın.`,
      source: 'game-invite',
      at: invite.at
    }));
  }
  for (const [key, list] of dm.entries()) {
    if (!key.includes(uid) || !Array.isArray(list)) continue;
    const last = [...list].reverse().find((msg) => msg && msg.fromUid && msg.fromUid !== uid);
    if (!last) continue;
    items.push(normalizeNotification(last, {
      id: `dm_${last.id || key}`,
      type: 'dm',
      title: 'Yeni özel mesaj',
      message: last.text || last.message || '',
      source: 'social-center',
      at: last.at
    }));
  }
  return items;
}

async function listNotifications(req, { includeDismissed = false } = {}) {
  const uid = uidOf(req);
  const limit = Math.max(1, Math.min(80, Number(req.query.limit || 24) || 24));
  const { db } = initFirebaseAdmin();
  const merged = new Map();
  for (const item of [...await firestoreNotifications(db, uid, limit), ...runtimeNotifications(uid)]) {
    if (item.id) merged.set(item.id, item);
  }
  const receipts = await readReceipts(db, uid, [...merged.keys()]);
  const items = [...merged.values()]
    .map((item) => {
      const receipt = receipts.get(item.id) || {};
      return { ...item, read: !!(item.read || receipt.readAt || receipt.shownAt), dismissed: !!receipt.dismissedAt };
    })
    .filter((item) => includeDismissed || !item.dismissed)
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
    .slice(0, limit);
  const unread = items.filter((item) => !item.read).length;
  return { ok: true, items, unread, summary: { total: items.length, unread } };
}

router.get('/notifications', requireAuth, async (req, res, next) => {
  try { res.json(await listNotifications(req)); } catch (error) { next(error); }
});

router.post('/notifications/read', requireAuth, async (req, res, next) => {
  try {
    const { db } = initFirebaseAdmin();
    const notificationId = clean(req.body.notificationId || req.body.id, 160);
    if (!notificationId) return res.status(400).json({ ok: false, error: 'NOTIFICATION_ID_REQUIRED' });
    await writeReceipt(db, uidOf(req), notificationId, { readAt: now() });
    res.json({ ok: true, notificationId });
  } catch (error) { next(error); }
});

router.post('/notifications/read-all', requireAuth, async (req, res, next) => {
  try {
    const { db } = initFirebaseAdmin();
    const payload = await listNotifications(req, { includeDismissed: true });
    await Promise.all(payload.items.map((item) => writeReceipt(db, uidOf(req), item.id, { readAt: now() }))); 
    res.json({ ok: true, count: payload.items.length });
  } catch (error) { next(error); }
});

router.post(['/notifications/delete-all', '/notifications/clear'], requireAuth, async (req, res, next) => {
  try {
    const { db } = initFirebaseAdmin();
    const payload = await listNotifications(req, { includeDismissed: true });
    await Promise.all(payload.items.map((item) => writeReceipt(db, uidOf(req), item.id, { readAt: now(), dismissedAt: now() }))); 
    res.json({ ok: true, count: payload.items.length });
  } catch (error) { next(error); }
});

router.post('/notifications/check', requireAuth, async (req,res,next)=>{ try { const { db } = initFirebaseAdmin(); const notificationId = String(req.body.notificationId || ''); res.json({ ok:true, show: await shouldShowNotification({ userId:req.user.uid, notificationId, db }) }); } catch (error) { next(error); } });
router.post('/notifications/ack', requireAuth, async (req,res,next)=>{ try { const { db } = initFirebaseAdmin(); res.json(await markNotificationShown({ userId:req.user.uid, notificationId:String(req.body.notificationId||''), type:String(req.body.type||'generic'), db })); } catch (error) { next(error); } });

module.exports = router;

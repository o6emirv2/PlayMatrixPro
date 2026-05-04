const express = require('express');
const { requireAuth } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('../core/runtimeStore');
const { shouldShowNotification, markNotificationShown } = require('../core/notificationService');
const router = express.Router();
const clean = (v, max = 500) => String(v || '').trim().replace(/[<>]/g, '').slice(0, max);
function uidOf(req) { return String(req.user?.uid || '').trim(); }
function notificationKey(uid) { return `home:notifications:${uid}`; }
function normalizeNotification(raw = {}, index = 0) {
  return {
    id: clean(raw.id || raw.notificationId || `notification_${index}`, 160),
    title: clean(raw.title || raw.type || 'Bildirim', 120),
    message: clean(raw.message || raw.text || raw.body || '', 700),
    type: clean(raw.type || 'system', 80),
    read: !!raw.read,
    at: Number(raw.at || raw.createdAt || Date.now()) || Date.now(),
    source: clean(raw.source || 'home', 120)
  };
}
router.get('/notifications', requireAuth, async (req, res) => {
  const uid = uidOf(req);
  let items = runtimeStore.temporary.get(notificationKey(uid)) || [];
  const { db } = initFirebaseAdmin();
  if (db) {
    try {
      const snap = await db.collection('notifications').where('uid', '==', uid).orderBy('createdAt', 'desc').limit(50).get();
      const persistent = [];
      snap.forEach((doc) => persistent.push(normalizeNotification({ id: doc.id, ...doc.data() }, persistent.length)));
      if (persistent.length) items = [...persistent, ...items].slice(0, 50);
    } catch (_) {}
  }
  items = items.map(normalizeNotification).sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  res.json({ ok:true, items, unread: items.filter((item) => !item.read).length, summary:{ total:items.length, unread:items.filter((item) => !item.read).length } });
});
router.post('/notifications/check', requireAuth, async (req,res)=>{ const { db } = initFirebaseAdmin(); const notificationId = String(req.body.notificationId || ''); res.json({ ok:true, show: await shouldShowNotification({ userId:req.user.uid, notificationId, db }) }); });
router.post('/notifications/ack', requireAuth, async (req,res)=>{ const { db } = initFirebaseAdmin(); res.json(await markNotificationShown({ userId:req.user.uid, notificationId:String(req.body.notificationId||''), type:String(req.body.type||'generic'), db })); });
router.post('/notifications/read-all', requireAuth, async (req, res) => {
  const uid = uidOf(req);
  const items = (runtimeStore.temporary.get(notificationKey(uid)) || []).map((item) => ({ ...item, read:true, readAt:Date.now() }));
  runtimeStore.temporary.set(notificationKey(uid), items, 30 * 86400000);
  const { db } = initFirebaseAdmin();
  if (db) {
    try {
      const snap = await db.collection('notifications').where('uid', '==', uid).limit(100).get();
      await Promise.all(snap.docs.map((doc) => doc.ref.set({ read:true, readAt:Date.now() }, { merge:true })));
    } catch (_) {}
  }
  res.json({ ok:true, unread:0 });
});
router.post('/notifications/read', requireAuth, async (req, res) => {
  const uid = uidOf(req);
  const id = clean(req.body?.id || req.body?.notificationId, 160);
  const items = (runtimeStore.temporary.get(notificationKey(uid)) || []).map((item) => String(item.id) === id ? { ...item, read:true, readAt:Date.now() } : item);
  runtimeStore.temporary.set(notificationKey(uid), items, 30 * 86400000);
  res.json({ ok:true });
});
router.post('/notifications/clear', requireAuth, async (req, res) => {
  const uid = uidOf(req);
  runtimeStore.temporary.delete(notificationKey(uid));
  const { db } = initFirebaseAdmin();
  if (db) {
    try {
      const snap = await db.collection('notifications').where('uid', '==', uid).limit(100).get();
      await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
    } catch (_) {}
  }
  res.json({ ok:true, items:[], unread:0, summary:{ total:0, unread:0 } });
});
module.exports = router;

const express = require('express');
const { requireAuth } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('../core/runtimeStore');
const { shouldShowNotification, markNotificationShown } = require('../core/notificationService');

const router = express.Router();

function runtimeNotificationsFor(uid) {
  return runtimeStore.notifications.entries()
    .filter(([key]) => String(key).startsWith(`${uid}:`))
    .map(([key, value]) => ({ id: key.split(':').slice(1).join(':') || key, title: value?.title || 'Bildirim', message: value?.message || '', type: value?.type || 'generic', at: value?.at || Date.now(), read: !!value?.read }))
    .slice(-50)
    .reverse();
}

router.get('/notifications', requireAuth, async (req, res, next) => {
  try {
    const items = runtimeNotificationsFor(req.user.uid);
    const { db } = initFirebaseAdmin();
    if (db) {
      try {
        const snap = await db.collection('notifications').where('userId', '==', req.user.uid).limit(30).get();
        snap.forEach(doc => {
          const data = doc.data() || {};
          items.push({ id: doc.id, title: data.title || 'Bildirim', message: data.message || '', type: data.type || 'generic', at: Number(data.createdAt || data.at || 0) || Date.now(), read: !!data.read });
        });
      } catch (_) {}
    }
    items.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
    res.json({ ok: true, items: items.slice(0, 50), unread: items.filter(x => !x.read).length });
  } catch (error) { next(error); }
});

router.post('/notifications/check', requireAuth, async (req, res) => {
  const { db } = initFirebaseAdmin();
  const notificationId = String(req.body.notificationId || '');
  res.json({ ok: true, show: await shouldShowNotification({ userId: req.user.uid, notificationId, db }) });
});

router.post('/notifications/ack', requireAuth, async (req, res) => {
  const { db } = initFirebaseAdmin();
  res.json(await markNotificationShown({ userId: req.user.uid, notificationId: String(req.body.notificationId || ''), type: String(req.body.type || 'generic'), db }));
});

module.exports = router;

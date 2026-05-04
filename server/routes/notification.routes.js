const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('../core/runtimeStore');
const { shouldShowNotification, markNotificationShown } = require('../core/notificationService');

const router = express.Router();
const NOTIFICATION_TTL = 30 * 24 * 60 * 60 * 1000;

function normalizeNotification(id, data = {}) {
  return {
    id: data.id || id || `ntf_${crypto.randomUUID()}`,
    uid: data.uid || data.userId || data.targetUid || '',
    type: data.type || 'system',
    title: data.title || data.heading || 'Bildirim',
    message: data.message || data.text || data.body || '',
    icon: data.icon || (data.type === 'reward' ? 'fa-gift' : data.type === 'social' ? 'fa-comments' : 'fa-bell'),
    read: data.read === true || data.seen === true,
    at: Number(data.at || data.createdAt || data.timestamp || Date.now()) || Date.now(),
    source: data.source || 'runtime'
  };
}
function runtimeItemsFor(uid) {
  return runtimeStore.notifications.entries()
    .map(([id, value]) => [id, normalizeNotification(id, value)])
    .filter(([, row]) => String(row.uid || '') === uid || String(row.targetUid || '') === uid || String(row.userId || '') === uid)
    .map(([, row]) => row);
}
async function firestoreItemsFor(uid) {
  const { db } = initFirebaseAdmin();
  if (!db) return [];
  const collections = ['notifications', 'userNotifications'];
  const rows = [];
  for (const collectionName of collections) {
    for (const fieldName of ['uid', 'userId', 'targetUid']) {
      try {
        const snap = await db.collection(collectionName).where(fieldName, '==', uid).limit(100).get();
        snap.forEach((doc) => { const data = doc.data() || {}; if (!data.cleared) rows.push(normalizeNotification(doc.id, { ...data, source: collectionName })); });
      } catch (_) {}
    }
  }
  const byId = new Map();
  rows.forEach((row) => byId.set(row.id, row));
  return [...byId.values()];
}

router.get('/notifications', requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const rows = [...runtimeItemsFor(uid), ...(await firestoreItemsFor(uid))]
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
    .slice(0, 150);
  const unread = rows.filter((row) => !row.read).length;
  res.json({ ok: true, items: rows, unread, summary: { total: rows.length, unread } });
});

router.post('/notifications/read-all', requireAuth, async (req, res) => {
  const uid = req.user.uid;
  let updated = 0;
  for (const [key, raw] of runtimeStore.notifications.entries()) {
    const row = normalizeNotification(key, raw);
    if (String(row.uid || '') === uid || String(raw?.targetUid || '') === uid || String(raw?.userId || '') === uid) {
      runtimeStore.notifications.set(key, { ...raw, read: true, seen: true, readAt: Date.now() }, NOTIFICATION_TTL);
      updated += 1;
    }
  }
  const { db } = initFirebaseAdmin();
  if (db) {
    for (const collectionName of ['notifications', 'userNotifications']) {
      for (const fieldName of ['uid', 'userId', 'targetUid']) {
        try {
          const snap = await db.collection(collectionName).where(fieldName, '==', uid).limit(100).get();
          const batch = db.batch();
          snap.forEach((doc) => { batch.set(doc.ref, { read: true, seen: true, readAt: Date.now() }, { merge: true }); updated += 1; });
          if (!snap.empty) await batch.commit();
        } catch (_) {}
      }
    }
  }
  res.json({ ok: true, updated });
});

router.post('/notifications/clear', requireAuth, async (req, res) => {
  const uid = req.user.uid;
  let cleared = 0;
  for (const [key, raw] of runtimeStore.notifications.entries()) {
    if (String(raw?.uid || raw?.userId || raw?.targetUid || '') === uid) {
      runtimeStore.notifications.delete(key);
      cleared += 1;
    }
  }
  const { db } = initFirebaseAdmin();
  if (db) {
    for (const collectionName of ['notifications', 'userNotifications']) {
      for (const fieldName of ['uid', 'userId', 'targetUid']) {
        try {
          const snap = await db.collection(collectionName).where(fieldName, '==', uid).limit(100).get();
          const batch = db.batch();
          snap.forEach((doc) => { batch.set(doc.ref, { cleared: true, clearedAt: Date.now(), read: true, seen: true }, { merge: true }); cleared += 1; });
          if (!snap.empty) await batch.commit();
        } catch (_) {}
      }
    }
  }
  res.json({ ok: true, cleared });
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

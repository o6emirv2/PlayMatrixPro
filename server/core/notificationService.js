'use strict';

const { getDb, getServerTimestamp } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');
const { sha256, safeString } = require('./security');

function normalizeNotification(input) {
  const userId = safeString(input.userId, 128);
  const type = safeString(input.type, 80).toLowerCase();
  const source = safeString(input.source || 'system', 80).toLowerCase();
  const rewardId = safeString(input.rewardId || input.dedupeKey || 'none', 160).toLowerCase();
  const title = safeString(input.title || 'Bildirim', 120);
  const message = safeString(input.message || '', 500);
  const severity = ['success', 'info', 'warning', 'danger'].includes(input.severity) ? input.severity : 'info';
  const persistent = Boolean(input.persistent);
  const notificationId = input.notificationId || sha256(`${userId}:${type}:${source}:${rewardId}`);
  return { notificationId, userId, type, source, rewardId, title, message, severity, persistent, createdAt: Date.now() };
}

async function wasShownPersistent(userId, notificationId) {
  const db = getDb();
  if (!db) return false;
  const snap = await db.collection('users').doc(userId).collection('shownNotifications').doc(notificationId).get();
  return snap.exists;
}

async function markShownPersistent(userId, notificationId, payload = {}) {
  const db = getDb();
  if (!db) return false;
  await db.collection('users').doc(userId).collection('shownNotifications').doc(notificationId).set({
    notificationId,
    type: payload.type || null,
    source: payload.source || null,
    rewardId: payload.rewardId || null,
    shownAt: getServerTimestamp()
  }, { merge: true });
  return true;
}

async function issueOnce(input) {
  const notification = normalizeNotification(input);
  const runtimeKey = `${notification.userId}:${notification.notificationId}`;
  if (runtimeStore.notifications.has(runtimeKey)) return { delivered: false, notification };

  if (notification.persistent && await wasShownPersistent(notification.userId, notification.notificationId)) {
    runtimeStore.notifications.set(runtimeKey, true);
    return { delivered: false, notification };
  }

  runtimeStore.notifications.set(runtimeKey, true);
  if (notification.persistent) {
    await markShownPersistent(notification.userId, notification.notificationId, notification);
  }
  return { delivered: true, notification };
}

async function markShown(userId, notificationId, payload = {}) {
  const runtimeKey = `${safeString(userId, 128)}:${safeString(notificationId, 160)}`;
  runtimeStore.notifications.set(runtimeKey, true);
  if (payload.persistent) return markShownPersistent(userId, notificationId, payload);
  return true;
}

module.exports = { normalizeNotification, issueOnce, markShown, wasShownPersistent, markShownPersistent };

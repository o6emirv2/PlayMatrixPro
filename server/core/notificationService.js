const { getDb } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');

function normalizePart(value) {
  return String(value ?? 'none').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 80);
}

function notificationId({ type, userId, source, rewardId, createdAt }) {
  return [type, userId, source, rewardId, createdAt].map(normalizePart).join(':');
}

function createNotification({ type, userId, title, message, source = 'system', rewardId = 'ui', critical = false, payload = {} }) {
  const createdAt = payload.createdAt || new Date().toISOString().slice(0, 10);
  const id = notificationId({ type, userId, source, rewardId, createdAt });
  const notification = { id, type, userId, title, message, source, rewardId, critical, payload, createdAt: new Date().toISOString() };
  runtimeStore.notifications.set(`${userId}:${id}`, notification);
  return notification;
}

async function wasCriticalNotificationShown(userId, id) {
  const db = getDb();
  if (!db) return false;
  const snap = await db.collection('users').doc(userId).collection('shown_notifications').doc(id).get();
  return snap.exists;
}

async function markCriticalNotificationShown(userId, id, metadata = {}) {
  const db = getDb();
  if (!db) return null;
  await db.collection('users').doc(userId).collection('shown_notifications').doc(id).set({
    id,
    type: metadata.type || null,
    source: metadata.source || null,
    rewardId: metadata.rewardId || null,
    shownAt: new Date().toISOString()
  }, { merge: true });
  return { id };
}

async function ackNotifications(userId, ids = []) {
  const unique = Array.from(new Set(ids.map(String).filter(Boolean))).slice(0, 50);
  await Promise.all(unique.map((id) => markCriticalNotificationShown(userId, id, {})));
  return unique;
}

function listRuntimeNotifications(userId) {
  return runtimeStore.notifications.values().filter((item) => item.userId === userId).slice(-20).reverse();
}

module.exports = { notificationId, createNotification, wasCriticalNotificationShown, markCriticalNotificationShown, ackNotifications, listRuntimeNotifications };

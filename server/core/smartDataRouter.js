'use strict';

const { getDb, getServerTimestamp } = require('../config/firebaseAdmin');
const { runtimeStore, pushRuntimeLog } = require('./runtimeStore');
const { createId, safeString } = require('./security');

const PRIORITIES = new Set(['CRITICAL', 'IMPORTANT', 'TEMPORARY', 'DISCARD']);

async function writeCriticalDataToFirestore(event) {
  const db = getDb();
  if (!db) {
    pushRuntimeLog({
      level: 'warn',
      type: 'critical_firebase_unavailable',
      message: 'Critical event could not be written because Firebase Admin is not configured.',
      userId: event.userId || null,
      payload: { eventType: event.type }
    });
    return { stored: false, target: 'firebase-unavailable' };
  }

  const collection = safeString(event.collection || 'auditEvents', 80).replace(/[^a-zA-Z0-9_-]/g, '');
  const id = safeString(event.id || createId('audit'), 120).replace(/[^a-zA-Z0-9_-]/g, '');
  const payload = {
    type: safeString(event.type, 120),
    userId: event.userId || null,
    createdAt: getServerTimestamp(),
    payload: event.payload || null
  };
  await db.collection(collection).doc(id).set(payload, { merge: true });
  return { stored: true, target: `firestore:${collection}/${id}` };
}

function writeTemporaryDataToMemory(event) {
  const id = event.id || createId('temp');
  runtimeStore.sessions.set(id, {
    type: event.type,
    userId: event.userId || null,
    payload: event.payload || null,
    createdAt: Date.now()
  }, event.ttlMs || undefined);
  return { stored: true, target: `memory:${id}` };
}

async function smartDataRouter(event) {
  if (!event || !event.type) return { stored: false, target: 'invalid-event' };
  const priority = PRIORITIES.has(event.priority) ? event.priority : 'DISCARD';

  switch (priority) {
    case 'CRITICAL':
      return writeCriticalDataToFirestore(event);
    case 'IMPORTANT':
      pushRuntimeLog({
        type: event.type,
        level: event.level || 'info',
        message: event.message || event.type,
        userId: event.userId || null,
        payload: event.payload || null
      });
      return { stored: true, target: 'console' };
    case 'TEMPORARY':
      return writeTemporaryDataToMemory(event);
    case 'DISCARD':
    default:
      return { stored: false, target: 'discard' };
  }
}

module.exports = { smartDataRouter, writeCriticalDataToFirestore, writeTemporaryDataToMemory };

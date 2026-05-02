const { getDb } = require('../config/firebaseAdmin');
const { runtimeStore, pushAdminLog, pushRuntimeError } = require('./runtimeStore');

const priorities = new Set(['CRITICAL', 'IMPORTANT', 'TEMPORARY', 'DISCARD']);

function cleanPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const json = JSON.stringify(payload);
  if (json.length > 8192) return { truncated: true, size: json.length };
  return JSON.parse(json);
}

async function smartDataRouter(event) {
  if (!event || typeof event !== 'object' || !event.type) return null;
  const priority = priorities.has(event.priority) ? event.priority : 'DISCARD';
  const record = {
    type: String(event.type).slice(0, 120),
    userId: event.userId || null,
    payload: cleanPayload(event.payload),
    createdAt: new Date().toISOString()
  };

  if (priority === 'CRITICAL') {
    const db = getDb();
    if (!db) {
      console.error('[CRITICAL_EVENT_FIREBASE_UNAVAILABLE]', record);
      pushRuntimeError({ source: 'smartDataRouter', ...record });
      return null;
    }
    await db.collection('critical_audit').add(record);
    return record;
  }

  if (priority === 'IMPORTANT') {
    console.log('[IMPORTANT_EVENT]', record);
    pushAdminLog(record);
    return record;
  }

  if (priority === 'TEMPORARY') {
    runtimeStore.notifications.set(`${record.type}:${record.userId || 'system'}:${Date.now()}`, record);
    return record;
  }

  return null;
}

module.exports = { smartDataRouter };

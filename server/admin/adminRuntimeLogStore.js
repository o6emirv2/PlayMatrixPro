const { TtlStore } = require('../core/runtimeStore');

const logs = new TtlStore({ ttlMs: 24 * 60 * 60 * 1000, max: 1000 });
const SECRET_KEY_PATTERN = /(token|secret|password|pass|private|key|authorization|cookie|serviceAccount|hash|salt|thirdFactor|firebase_key|admin_panel)/i;

function clip(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max);
}

function sanitizeValue(value, depth = 0) {
  if (depth > 4) return '[TRUNCATED]';
  if (value == null) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return clip(value, 800).replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[MASKED]').replace(/AIza[0-9A-Za-z_-]{20,}/g, '[FIREBASE_API_KEY_MASKED]');
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value).slice(0, 60)) {
      if (SECRET_KEY_PATTERN.test(key)) out[key] = '[MASKED]';
      else out[key] = sanitizeValue(entry, depth + 1);
    }
    return out;
  }
  return clip(value, 200);
}

function normalizeLevel(value) {
  const raw = String(value || 'info').toLowerCase();
  return ['debug', 'info', 'warning', 'error', 'critical'].includes(raw) ? raw : 'info';
}

function addAdminLog(event, payload = {}) {
  const safePayload = sanitizeValue(payload) || {};
  const row = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    event: clip(event || safePayload.event || 'runtime.event', 120),
    level: normalizeLevel(safePayload.level || safePayload.severity),
    source: clip(safePayload.source || safePayload.area || 'admin', 80),
    category: clip(safePayload.category || safePayload.scope || event || 'runtime', 120),
    code: clip(safePayload.code || event || 'RUNTIME_LOG', 80),
    message: clip(safePayload.message || safePayload.error || event || 'Runtime log', 500),
    safeContext: safePayload,
    payload: safePayload,
    at: Date.now(),
    timestamp: new Date().toISOString()
  };
  logs.set(row.id, row);
  const method = row.level === 'error' || row.level === 'critical' ? console.error : row.level === 'warning' ? console.warn : console.log;
  method('[admin:runtime]', JSON.stringify({ event: row.event, level: row.level, source: row.source, category: row.category, code: row.code, message: row.message, at: row.at }));
  return row;
}

function listAdminLogs() {
  return logs.values().sort((a, b) => b.at - a.at);
}

module.exports = { addAdminLog, listAdminLogs, sanitizeRuntimeLogPayload: sanitizeValue };

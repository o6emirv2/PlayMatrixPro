'use strict';

const fs = require('fs');
const path = require('path');

function loadLocalEnv() {
  if (process.env.NODE_ENV === 'production') return;
  const file = path.join(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = raw.replace(/^['"]|['"]$/g, '');
  }
}

loadLocalEnv();

function asInt(name, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return value;
}

function asBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function list(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanOrigin(value) {
  const text = String(value || '').trim().replace(/\/$/, '');
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.origin;
  } catch (_) {
    return '';
  }
}

const publicBaseUrl = cleanOrigin(process.env.PUBLIC_BASE_URL) || 'http://localhost:10000';
const publicBackendOrigin = cleanOrigin(process.env.PUBLIC_BACKEND_ORIGIN || process.env.PUBLIC_API_BASE) || publicBaseUrl;
const allowedOrigins = [...new Set([
  publicBaseUrl,
  cleanOrigin(process.env.CANONICAL_ORIGIN),
  cleanOrigin(process.env.PUBLIC_BACKEND_ORIGIN),
  ...list('ALLOWED_ORIGINS').map(cleanOrigin)
].filter(Boolean))];

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || process.env.PUBLIC_FIREBASE_PROJECT_ID || 'playmatrixpro-b18b7';

const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  port: asInt('PORT', 10000, 1, 65535),
  logLevel: process.env.LOG_LEVEL || 'info',
  publicBaseUrl,
  canonicalOrigin: cleanOrigin(process.env.CANONICAL_ORIGIN) || publicBaseUrl,
  publicBackendOrigin,
  publicApiBase: cleanOrigin(process.env.PUBLIC_API_BASE) || publicBackendOrigin,
  allowedOrigins,
  security: Object.freeze({
    demoAuthEnabled: asBool('DEMO_AUTH_ENABLED', !((process.env.NODE_ENV || 'development') === 'production')),
    persistentNotificationDedupe: asBool('PERSISTENT_NOTIFICATION_DEDUPE', true),
    requestJsonLimit: process.env.REQUEST_JSON_LIMIT || '256kb'
  }),
  firebase: Object.freeze({
    projectId: firebaseProjectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.PUBLIC_FIREBASE_STORAGE_BUCKET || 'playmatrixpro-b18b7.firebasestorage.app',
    serviceAccountJson: process.env.FIREBASE_KEY || '',
    webApiKey: process.env.FIREBASE_WEB_API_KEY || process.env.PUBLIC_FIREBASE_API_KEY || '',
    publicConfig: Object.freeze({
      apiKey: process.env.PUBLIC_FIREBASE_API_KEY || '',
      authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN || 'playmatrixpro-b18b7.firebaseapp.com',
      projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID || firebaseProjectId,
      storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET || 'playmatrixpro-b18b7.firebasestorage.app',
      messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '401147567674',
      appId: process.env.PUBLIC_FIREBASE_APP_ID || '',
      measurementId: process.env.PUBLIC_FIREBASE_MEASUREMENT_ID || ''
    })
  }),
  admins: Object.freeze({
    emails: list('ADMIN_EMAILS').map((mail) => mail.toLowerCase()),
    uids: list('ADMIN_UIDS'),
    primaryEmail: String(process.env.PRIMARY_ADMIN_EMAIL || '').toLowerCase(),
    primaryUid: process.env.PRIMARY_ADMIN_UID || ''
  }),
  timers: Object.freeze({
    socketPingIntervalMs: asInt('SOCKET_PING_INTERVAL_MS', 25000, 1000),
    socketStaleTimeoutMs: asInt('SOCKET_STALE_TIMEOUT_MS', 70000, 5000),
    socketMemorySweepIntervalMs: asInt('SOCKET_MEMORY_SWEEP_INTERVAL_MS', 60000, 5000),
    matchQueueTtlMs: asInt('MATCH_QUEUE_TTL_MS', 120000, 10000),
    gameRoomTtlMs: asInt('GAME_ROOM_TTL_MS', 1800000, 60000),
    notificationRuntimeTtlMs: asInt('NOTIFICATION_RUNTIME_TTL_MS', 3600000, 60000),
    chessDisconnectGraceMs: asInt('CHESS_DISCONNECT_GRACE_MS', 90000, 5000),
    chessResultRetentionMs: asInt('CHESS_RESULT_RETENTION_MS', 120000, 10000)
  })
});

module.exports = config;

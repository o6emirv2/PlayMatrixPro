const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitList = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

const env = {
  nodeEnv: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
  port: toInt(process.env.PORT, 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  canonicalOrigin: process.env.CANONICAL_ORIGIN || '',
  publicBackendOrigin: process.env.PUBLIC_BACKEND_ORIGIN || '',
  publicApiBase: process.env.PUBLIC_API_BASE || '',
  allowedOrigins: splitList(process.env.ALLOWED_ORIGINS),
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    serviceAccountJson: process.env.FIREBASE_KEY || '',
    webApiKey: process.env.FIREBASE_WEB_API_KEY || process.env.PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    appId: process.env.FIREBASE_APP_ID || process.env.PUBLIC_FIREBASE_APP_ID || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || process.env.PUBLIC_FIREBASE_MEASUREMENT_ID || '',
    public: {
      apiKey: process.env.PUBLIC_FIREBASE_API_KEY || '',
      authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
      storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.PUBLIC_FIREBASE_APP_ID || '',
      measurementId: process.env.PUBLIC_FIREBASE_MEASUREMENT_ID || '',
      expectedProjectId: process.env.PUBLIC_FIREBASE_EXPECTED_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || ''
    }
  },
  admin: {
    emails: splitList(process.env.ADMIN_EMAILS),
    uids: splitList(process.env.ADMIN_UIDS),
    healthSurfaceEnabled: process.env.ADMIN_HEALTH_SURFACE_ENABLED === '1'
  },
  security: {
    cspReportOnly: process.env.SECURITY_CSP_REPORT_ONLY === '1',
    cspStrict: process.env.SECURITY_CSP_STRICT === '1',
    legacySessionHeaderEnabled: process.env.LEGACY_SESSION_HEADER_ENABLED === '1'
  },
  ttl: {
    lobbyChatDays: toInt(process.env.LOBBY_CHAT_RETENTION_DAYS, 7),
    directChatDays: toInt(process.env.DIRECT_CHAT_RETENTION_DAYS, 14),
    directMessageEditWindowHours: toInt(process.env.DIRECT_MESSAGE_EDIT_WINDOW_HOURS, 24),
    socketPingIntervalMs: toInt(process.env.SOCKET_PING_INTERVAL_MS, 25000),
    socketStaleTimeoutMs: toInt(process.env.SOCKET_STALE_TIMEOUT_MS, 70000),
    socketMemorySweepIntervalMs: toInt(process.env.SOCKET_MEMORY_SWEEP_INTERVAL_MS, 60000),
    socketConnectionTtlMs: toInt(process.env.SOCKET_CONNECTION_TTL_MS, 180000),
    matchQueueTtlMs: toInt(process.env.MATCH_QUEUE_TTL_MS, 120000),
    gameInviteTtlMs: toInt(process.env.GAME_INVITE_TTL_MS, 90000),
    partyInviteTtlMs: toInt(process.env.PARTY_INVITE_TTL_MS, 300000),
    partyMemberLimit: toInt(process.env.PARTY_MEMBER_LIMIT, 4),
    partyRematchGraceMs: toInt(process.env.PARTY_REMATCH_GRACE_MS, 900000),
    idleTimeoutMs: toInt(process.env.IDLE_TIMEOUT_MS, 3600000),
    sessionTtlMs: toInt(process.env.SESSION_TTL_MS, 2592000000),
    activityTouchThrottleMs: toInt(process.env.ACTIVITY_TOUCH_THROTTLE_MS, 60000),
    sessionTouchThrottleMs: toInt(process.env.SESSION_TOUCH_THROTTLE_MS, 60000),
    inactiveWarnAfterMs: toInt(process.env.INACTIVE_WARN_AFTER_MS, 1987200000),
    inactiveHardDeleteAfterMs: toInt(process.env.INACTIVE_HARD_DELETE_AFTER_MS, 2592000000),
    activityResetWindowHours: toInt(process.env.ACTIVITY_RESET_WINDOW_HOURS, 6),
    monthlyRewardWindowHours: toInt(process.env.MONTHLY_REWARD_WINDOW_HOURS, 6),
    chessDisconnectGraceMs: toInt(process.env.CHESS_DISCONNECT_GRACE_MS, 90000),
    chessResultRetentionMs: toInt(process.env.CHESS_RESULT_RETENTION_MS, 120000)
  }
};

function publicRuntimeConfig() {
  return Object.freeze({
    appName: 'PlayMatrix',
    publicBaseUrl: env.publicBaseUrl,
    canonicalOrigin: env.canonicalOrigin,
    publicBackendOrigin: env.publicBackendOrigin,
    publicApiBase: env.publicApiBase,
    firebase: { ...env.firebase.public }
  });
}

function validateEnv() {
  const required = [
    ['PUBLIC_BASE_URL', env.publicBaseUrl],
    ['CANONICAL_ORIGIN', env.canonicalOrigin],
    ['PUBLIC_BACKEND_ORIGIN', env.publicBackendOrigin],
    ['PUBLIC_API_BASE', env.publicApiBase],
    ['ALLOWED_ORIGINS', env.allowedOrigins.length ? 'ok' : ''],
    ['FIREBASE_PROJECT_ID', env.firebase.projectId],
    ['FIREBASE_STORAGE_BUCKET', env.firebase.storageBucket],
    ['PUBLIC_FIREBASE_PROJECT_ID', env.firebase.public.projectId],
    ['PUBLIC_FIREBASE_API_KEY', env.firebase.public.apiKey],
    ['FIREBASE_WEB_API_KEY', env.firebase.webApiKey]
  ];
  return required.filter(([, value]) => !value).map(([key]) => key);
}

module.exports = { env, publicRuntimeConfig, validateEnv };

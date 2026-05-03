(function () {
  'use strict';

  /*
   * Static hosting bootstrap.
   * Production runtime kontratı ENV üzerinden uygulanır.
   * Firebase Web Config public değerlerden oluşur; private service-account,
   * admin factor ve hash/salt değerleri bu dosyaya yazılmaz.
   */
  const PUBLIC_API_BASE = 'https://emirhan-siye.onrender.com';
  const PUBLIC_BASE_URL = 'https://playmatrix.com.tr';
  const EXPECTED_FIREBASE_PROJECT_ID = 'playmatrixpro-b18b7';
  const PUBLIC_FIREBASE_CONFIG = Object.freeze({
    apiKey: 'AIzaSyANhKrb7zuSzXouFq03Q_oWQJCQUglCNhE',
    authDomain: 'playmatrixpro-b18b7.firebaseapp.com',
    projectId: 'playmatrixpro-b18b7',
    storageBucket: 'playmatrixpro-b18b7.firebasestorage.app',
    messagingSenderId: '401147567674',
    appId: '1:401147567674:web:37f609d8527e61a72c5f03',
    measurementId: 'G-HEDD2B0T9H'
  });

  function normalizeBase(value) {
    return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  const apiBase = normalizeBase(PUBLIC_API_BASE);
  const runtime = Object.freeze({
    version: 6,
    environment: 'production',
    publicBaseUrl: normalizeBase(PUBLIC_BASE_URL),
    apiBase,
    expectedFirebaseProjectId: EXPECTED_FIREBASE_PROJECT_ID,
    firebase: PUBLIC_FIREBASE_CONFIG,
    firebaseReady: true,
    source: 'static-public-firebase-render-contract'
  });

  window.__PM_STATIC_RUNTIME_CONFIG__ = runtime;
  window.__PM_RUNTIME = Object.assign({}, runtime, window.__PM_RUNTIME || {});
  if (!window.__PM_RUNTIME.apiBase || normalizeBase(window.__PM_RUNTIME.apiBase) === normalizeBase(window.location.origin)) {
    window.__PM_RUNTIME.apiBase = apiBase;
  }
  window.__PM_RUNTIME.expectedFirebaseProjectId = EXPECTED_FIREBASE_PROJECT_ID;
  window.__PM_RUNTIME.firebase = PUBLIC_FIREBASE_CONFIG;
  window.__PM_RUNTIME.firebaseReady = true;
  window.__PLAYMATRIX_API_URL__ = normalizeBase(window.__PM_RUNTIME.apiBase || window.__PLAYMATRIX_API_URL__ || apiBase);

  function reportClientRuntimeError(type, payload) {
    try {
      const body = JSON.stringify(Object.assign({ type, path: location.pathname, href: location.href, at: Date.now() }, payload || {}));
      const endpoint = `${normalizeBase(window.__PLAYMATRIX_API_URL__ || apiBase)}/api/client/error`;
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
        return;
      }
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  window.addEventListener('error', function (event) {
    reportClientRuntimeError('window.error', { message: event.message, source: event.filename, line: event.lineno, column: event.colno });
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason || {};
    reportClientRuntimeError('unhandledrejection', { message: reason.message || String(reason || ''), stack: reason.stack || '' });
  });

})();

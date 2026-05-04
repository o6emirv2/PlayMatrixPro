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
    version: 9,
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

  const reportedClientErrors = new Map();

  function shouldSendClientError(type, payload) {
    try {
      const key = [type, payload?.scope || '', payload?.message || '', payload?.source || '', payload?.line || ''].join('|').slice(0, 360);
      const now = Date.now();
      const previous = reportedClientErrors.get(key) || 0;
      if (now - previous < 2500) return false;
      reportedClientErrors.set(key, now);
      if (reportedClientErrors.size > 80) {
        const cutoff = now - 30000;
        for (const [entryKey, at] of reportedClientErrors) if (at < cutoff) reportedClientErrors.delete(entryKey);
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  function reportClientRuntimeError(type, payload) {
    try {
      const normalizedPayload = Object.assign({ game: 'home', type, path: location.pathname, href: location.href, at: Date.now() }, payload || {});
      if (!shouldSendClientError(type, normalizedPayload)) return;
      const body = JSON.stringify(normalizedPayload);
      const endpoint = `${normalizeBase(window.__PLAYMATRIX_API_URL__ || apiBase)}/api/client/error`;
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
        return;
      }
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  window.__PM_REPORT_CLIENT_ERROR__ = function reportPlayMatrixClientError(scope, error, extra) {
    const err = error || {};
    reportClientRuntimeError(scope || 'client.error', Object.assign({
      scope: scope || 'client.error',
      message: err.message || String(err || ''),
      stack: err.stack || '',
      source: 'home',
      severity: 'error'
    }, extra || {}));
  };

  if (window.__PM_GLOBAL_ERROR_LISTENERS__ !== 'installed') {
    window.__PM_GLOBAL_ERROR_LISTENERS__ = 'installed';
    window.addEventListener('error', function (event) {
      reportClientRuntimeError('window.error', { scope: 'home.window_error', message: event.message, source: event.filename, line: event.lineno, column: event.colno });
    });
    window.addEventListener('unhandledrejection', function (event) {
      var reason = event.reason || {};
      reportClientRuntimeError('unhandledrejection', { scope: 'home.promise_rejection', message: reason.message || String(reason || ''), stack: reason.stack || '', source: 'promise' });
    });
  }


  function parseActionArgs(raw) {
    if (!raw) return [];
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : [parsed]; } catch (_) { return []; }
  }

  function installActionDelegation() {
    if (document.documentElement.dataset.pmActionDelegation === '1') return;
    document.documentElement.dataset.pmActionDelegation = '1';
    const run = function (target, event) {
      const action = String(target?.dataset?.pmAction || '').trim();
      if (!action) return;
      const fn = action.split('.').reduce((obj, key) => obj && obj[key], window);
      if (typeof fn !== 'function') return;
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(fn.apply(window, parseActionArgs(target.dataset.pmArgs || '[]'))).catch(function (error) {
        reportClientRuntimeError('data-pm-action', { action, message: error?.message || String(error || '') });
      });
    };
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest && event.target.closest('[data-pm-action]');
      if (!target || target.dataset.pmActionEvent === 'input') return;
      run(target, event);
    }, true);
    document.addEventListener('input', function (event) {
      const target = event.target && event.target.closest && event.target.closest('[data-pm-action][data-pm-action-event="input"]');
      if (!target) return;
      run(target, event);
    }, true);
  }

  function installSmoothMobileScroll() {
    document.documentElement.style.webkitOverflowScrolling = 'touch';
    document.documentElement.style.overscrollBehaviorY = 'auto';
    document.body.style.webkitOverflowScrolling = 'touch';
    document.addEventListener('touchmove', function () {}, { passive: true });
    document.addEventListener('wheel', function () {}, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { installActionDelegation(); installSmoothMobileScroll(); }, { once: true });
  } else {
    installActionDelegation();
    installSmoothMobileScroll();
  }

})();

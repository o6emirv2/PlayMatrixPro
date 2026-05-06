(function () {
  'use strict';

  const STATE = {
    lastBalance: null,
    lastLevel: null,
    lastProgress: null,
    refreshTimer: 0,
    inFlight: false,
    lastRefreshAt: 0,
    minIntervalMs: 2500
  };

  function ensurePulseStyles() {
    if (document.getElementById('pm-live-sync-pulse-style')) return;
    const style = document.createElement('style');
    style.id = 'pm-live-sync-pulse-style';
    style.textContent = '@keyframes pmLiveSyncPulse{0%{filter:brightness(1);transform:translateZ(0) scale(1)}45%{filter:brightness(1.35);transform:translateZ(0) scale(1.045)}100%{filter:brightness(1);transform:translateZ(0) scale(1)}}.pm-live-sync-pulse{animation:pmLiveSyncPulse .65s ease both}';
    document.head.appendChild(style);
  }

  function normalizeBase(value) {
    return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  function apiBase() {
    try {
      if (window.__PM_API__ && typeof window.__PM_API__.getApiBaseSync === 'function') {
        return normalizeBase(window.__PM_API__.getApiBaseSync());
      }
    } catch (_) {}
    return normalizeBase(window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || document.querySelector('meta[name="playmatrix-api-url"]')?.content || window.location.origin);
  }

  async function getAuthToken(forceRefresh) {
    try {
      if (window.__PM_RUNTIME && typeof window.__PM_RUNTIME.getIdToken === 'function') {
        return await window.__PM_RUNTIME.getIdToken(!!forceRefresh);
      }
    } catch (_) {}
    try {
      const user = window.__PM_RUNTIME?.auth?.currentUser;
      if (user && typeof user.getIdToken === 'function') return await user.getIdToken(!!forceRefresh);
    } catch (_) {}
    return '';
  }

  function pickNumber(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function pickProfile(payload) {
    if (!payload || typeof payload !== 'object') return {};
    if (payload.user && typeof payload.user === 'object') return payload.user;
    if (payload.profile && typeof payload.profile === 'object') return payload.profile;
    return payload;
  }

  function getBalance(payload) {
    const profile = pickProfile(payload);
    return pickNumber(payload?.balance, payload?.mcBalance, payload?.wallet?.balance, profile?.balance, profile?.mcBalance, profile?.wallet?.balance);
  }

  function getLevel(payload) {
    const profile = pickProfile(payload);
    return pickNumber(payload?.accountLevel, payload?.level, payload?.progression?.accountLevel, profile?.accountLevel, profile?.level, profile?.progression?.accountLevel);
  }

  function getProgress(payload) {
    const profile = pickProfile(payload);
    return pickNumber(
      payload?.accountLevelProgressPct,
      payload?.progression?.accountLevelProgressPct,
      payload?.progression?.progressPct,
      profile?.accountLevelProgressPct,
      profile?.progression?.accountLevelProgressPct,
      profile?.progression?.progressPct
    );
  }

  function getAvatar(payload) {
    const profile = pickProfile(payload);
    return String(payload?.avatar || payload?.photoURL || payload?.profile?.avatar || profile?.avatar || profile?.photoURL || '').trim();
  }

  function getSelectedFrame(payload) {
    const profile = pickProfile(payload);
    return pickNumber(payload?.selectedFrame, payload?.frameState?.selectedFrame, profile?.selectedFrame, profile?.frameState?.selectedFrame);
  }

  function formatMc(value) {
    const n = Number(value) || 0;
    return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function pulse(node) {
    if (!node) return;
    node.classList.remove('pm-live-sync-pulse');
    void node.offsetWidth;
    node.classList.add('pm-live-sync-pulse');
    window.setTimeout(() => node.classList.remove('pm-live-sync-pulse'), 650);
  }

  function setText(ids, value, changed) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = value;
      if (changed) pulse(el);
    });
  }

  function setProgressBar(progress, changed) {
    const pct = Math.max(0, Math.min(100, Number(progress) || 0));
    const bar = document.getElementById('uiAccountLevelBar');
    const pctEl = document.getElementById('uiAccountLevelPct');
    if (bar) {
      bar.style.width = pct.toFixed(1) + '%';
      if (changed) pulse(bar.closest('.stat-bar-bg') || bar);
    }
    if (pctEl) {
      pctEl.textContent = pct.toFixed(1) + '%';
      if (changed) pulse(pctEl);
    }
  }

  function renderTopbarAvatar(payload, options) {
    const host = document.getElementById('uiAccountAvatarHost');
    if (!host || !window.PMAvatar || typeof window.PMAvatar.mount !== 'function') return false;
    const avatarUrl = getAvatar(payload);
    const level = getLevel(payload) || STATE.lastLevel || 1;
    const exactFrameIndex = getSelectedFrame(payload);
    const signature = [avatarUrl, level, exactFrameIndex].join('|');
    if (!options?.forcePulse && host.dataset.pmProfileSignature === signature) return false;
    host.dataset.pmProfileSignature = signature;
    window.PMAvatar.mount(host, {
      avatarUrl,
      level,
      exactFrameIndex,
      sizePx: host.clientWidth || 46,
      wrapperClass: 'pm-avatar pm-game-topbar-avatar',
      imageClass: 'pm-avatar-img',
      alt: 'Hesap avatarı',
      sizeTag: 'game-topbar'
    });
    if (options?.forcePulse) pulse(host);
    return true;
  }

  function apply(payload, options) {
    const opts = options || {};
    if (!payload || typeof payload !== 'object') return false;
    let applied = false;

    const balance = getBalance(payload);
    if (balance !== null) {
      const rounded = Math.round(balance * 100) / 100;
      const changed = STATE.lastBalance !== null && Math.abs(rounded - STATE.lastBalance) >= 0.01;
      STATE.lastBalance = rounded;
      setText(['uiBalance', 'ui-balance'], formatMc(rounded), changed || !!opts.forcePulse);
      applied = true;
    }

    const level = getLevel(payload);
    if (level !== null) {
      const safeLevel = Math.max(1, Math.floor(level));
      const changed = STATE.lastLevel !== null && safeLevel !== STATE.lastLevel;
      STATE.lastLevel = safeLevel;
      setText(['uiAccountLevelBadge'], String(safeLevel), changed || !!opts.forcePulse);
      applied = true;
    }

    const progress = getProgress(payload);
    if (progress !== null) {
      const pct = Math.max(0, Math.min(100, Number(progress) || 0));
      const changed = STATE.lastProgress !== null && Math.abs(pct - STATE.lastProgress) >= 0.05;
      STATE.lastProgress = pct;
      setProgressBar(pct, changed || !!opts.forcePulse);
      applied = true;
    }

    renderTopbarAvatar(payload, opts);

    if (applied) {
      try { window.dispatchEvent(new CustomEvent('pm:account-sync-applied', { detail: payload })); } catch (_) {}
    }
    return applied;
  }

  async function refresh(options) {
    const opts = options || {};
    const now = Date.now();
    if (STATE.inFlight) return null;
    if (!opts.force && (now - STATE.lastRefreshAt) < STATE.minIntervalMs) return null;
    STATE.inFlight = true;
    STATE.lastRefreshAt = now;
    try {
      const token = await getAuthToken(!!opts.forceTokenRefresh).catch(() => '');
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), Math.max(3000, Number(opts.timeoutMs || 7000)));
      const headers = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const base = apiBase();
      const url = `${base || window.location.origin}/api/me?t=${Date.now()}`;
      const response = await fetch(url, { method: 'GET', headers, credentials: 'include', cache: 'no-store', signal: controller.signal });
      window.clearTimeout(timer);
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.ok !== false) apply(payload, opts);
      return payload;
    } catch (_) {
      return null;
    } finally {
      STATE.inFlight = false;
    }
  }

  function notifyMutation(payload) {
    apply(payload || {}, { forcePulse: true });
    window.setTimeout(() => refresh({ force: true, forcePulse: true, timeoutMs: 5000 }), 120);
    window.setTimeout(() => refresh({ force: true, forcePulse: true, forceTokenRefresh: true, timeoutMs: 6500 }), 900);
    window.setTimeout(() => refresh({ force: true, timeoutMs: 7000 }), 2600);
  }

  function start() {
    ensurePulseStyles();
    if (STATE.refreshTimer) return;
    refresh({ force: true }).catch(() => null);
    STATE.refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') refresh({ force: false }).catch(() => null);
    }, 3500);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') refresh({ force: true }).catch(() => null);
  });
  window.addEventListener('focus', () => refresh({ force: true }).catch(() => null));
  window.addEventListener('pm:game-account-mutated', (event) => notifyMutation(event.detail || {}));

  window.__PM_GAME_ACCOUNT_SYNC__ = { apply, refresh, notifyMutation, start };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

(() => {
  'use strict';

  const SESSION_KEY = 'pm_session_token';
  const API_BASE_KEY = 'pm_api_base';
  const FIREBASE_IMPORT_TIMEOUT_MS = 7000;
  const API_TIMEOUT_MS = 5500;
  const RENDER_API_BASE = 'https://emirhan-siye.onrender.com';
  const FALLBACK_AVATAR = './public/assets/avatars/system/fallback.svg';
  const DEFAULT_REMOTE_AVATAR = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSfGyJQYvPP6iCLIpSd0v2JMQxgxA3dUEjyLmW4F82zYQ&s=10';
  const PUBLIC_FIREBASE_CONFIG = Object.freeze({
    apiKey: 'AIzaSyANhKrb7zuSzXouFq03Q_oWQJCQUglCNhE',
    authDomain: 'playmatrixpro-b18b7.firebaseapp.com',
    projectId: 'playmatrixpro-b18b7',
    storageBucket: 'playmatrixpro-b18b7.firebasestorage.app',
    messagingSenderId: '401147567674',
    appId: '1:401147567674:web:37f609d8527e61a72c5f03',
    measurementId: 'G-HEDD2B0T9H'
  });


  const GAME_ROUTES = Object.freeze({
    crash: '/games/crash/index.html',
    chess: '/games/chess/index.html',
    satranc: '/games/chess/index.html',
    pisti: '/games/pisti/index.html',
    pattern: '/games/pattern-master/index.html',
    patternmaster: '/games/pattern-master/index.html',
    space: '/games/space-pro/index.html',
    spacepro: '/games/space-pro/index.html',
    snake: '/games/snake-pro/index.html',
    snakepro: '/games/snake-pro/index.html'
  });

  window.__PLAYMATRIX_ROUTES__ = GAME_ROUTES;
  window.__PLAYMATRIX_API_BASE__ = window.__PLAYMATRIX_API_BASE__ || RENDER_API_BASE;

  const frameRules = [
    { min: 1, max: 15, frame: 1 },
    { min: 16, max: 30, frame: 2 },
    { min: 31, max: 40, frame: 3 },
    { min: 41, max: 50, frame: 4 },
    { min: 51, max: 60, frame: 5 },
    { min: 61, max: 80, frame: 6 },
    { min: 81, max: 85, frame: 7 },
    { min: 86, max: 90, frame: 8 },
    { min: 91, max: 91, frame: 9 },
    { min: 92, max: 92, frame: 10 },
    { min: 93, max: 93, frame: 11 },
    { min: 94, max: 94, frame: 12 },
    { min: 95, max: 95, frame: 13 },
    { min: 96, max: 96, frame: 14 },
    { min: 97, max: 97, frame: 15 },
    { min: 98, max: 98, frame: 16 },
    { min: 99, max: 99, frame: 17 },
    { min: 100, max: 100, frame: 18 }
  ];

  const frameProfiles = {
    0: { fit: '100%', scale: '0%' },
    1: { fit: '82%', scale: '128%' },
    2: { fit: '82%', scale: '132%' },
    3: { fit: '78%', scale: '138%' },
    4: { fit: '82%', scale: '132%' },
    5: { fit: '82%', scale: '132%' },
    6: { fit: '80%', scale: '136%' },
    7: { fit: '78%', scale: '138%' },
    8: { fit: '80%', scale: '136%' },
    9: { fit: '82%', scale: '134%' },
    10: { fit: '82%', scale: '132%' },
    11: { fit: '78%', scale: '140%' },
    12: { fit: '80%', scale: '136%' },
    13: { fit: '80%', scale: '136%' },
    14: { fit: '78%', scale: '140%' },
    15: { fit: '76%', scale: '142%' },
    16: { fit: '78%', scale: '140%' },
    17: { fit: '76%', scale: '142%' },
    18: { fit: '74%', scale: '150%' }
  };

  const games = [
    { id: 'crash', title: 'Crash', route: '/games/crash/index.html', description: 'Refleks ve zamanlama odaklı multiplier deneyimi.', tags: ['Canlı Oyun', 'Rekabet', 'Hızlı Tur'], icon: 'trend', auth: true },
    { id: 'chess', title: 'Satranç', route: '/games/chess/index.html', description: 'Bahissiz, bahisli ve bot modlarını destekleyen strateji oyunu.', tags: ['PvP', 'Strateji', 'Arena'], icon: 'chess', auth: true },
    { id: 'pisti', title: 'Pişti', route: '/games/pisti/index.html', description: 'Klasik kart oyunu deneyimi.', tags: ['Kart', 'Klasik', 'Çok Oyunculu'], icon: 'cards', auth: true },
    { id: 'pattern', title: 'Pattern Master', route: '/games/pattern-master/index.html', description: 'Hafıza ve örüntü takibi üzerine klasik oyun.', tags: ['Klasik', 'Zeka', 'Skor'], icon: 'grid', auth: true },
    { id: 'space', title: 'Space Pro', route: '/games/space-pro/index.html', description: 'Uzay temalı refleks ve kaçınma oyunu.', tags: ['Klasik', 'Refleks', 'Uzay'], icon: 'rocket', auth: true },
    { id: 'snake', title: 'Snake Pro', route: '/games/snake-pro/index.html', description: 'Modernleştirilmiş yılan oyunu.', tags: ['Klasik', 'Mobil', 'Skor'], icon: 'snake', auth: true }
  ];

  const state = {
    auth: 'guest',
    user: null,
    token: readSessionToken(),
    apiBase: '',
    firebase: null,
    authMode: 'login',
    activeLayer: null,
    leaderboardTab: 'level',
    leaderboard: null,
    selectedAvatar: '',
    selectedFrame: 0
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const formatNumber = (value) => new Intl.NumberFormat('tr-TR').format(Math.max(0, Number(value) || 0));
  const normalizeBase = (value) => String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  const safeText = (value, fallback = '') => String(value ?? fallback).replace(/[<>]/g, '').trim();
  const first = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');

  function getMetaContent(name) {
    return document.querySelector(`meta[name="${name}"]`)?.content || '';
  }

  function getApiCandidates() {
    const list = [];
    const push = (value) => {
      const base = normalizeBase(value);
      if (base && !list.includes(base)) list.push(base);
    };
    push(window.__PM_RUNTIME?.apiBase);
    push(window.__PLAYMATRIX_API_URL__);
    push(getMetaContent('playmatrix-api-url'));
    try { push(localStorage.getItem(API_BASE_KEY)); } catch (_) {}
    push(window.location.origin);
    push(RENDER_API_BASE);
    return list;
  }

  function readSessionToken() {
    try { return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || ''; } catch (_) { return ''; }
  }

  function storeSessionToken(token) {
    const value = String(token || '').trim();
    if (!value) return;
    state.token = value;
    try { sessionStorage.setItem(SESSION_KEY, value); localStorage.setItem(SESSION_KEY, value); } catch (_) {}
  }

  function clearSessionToken() {
    state.token = '';
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (_) {}
  }

  function withTimeout(promise, timeoutMs, code) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(Object.assign(new Error(code), { code })), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
  }

  async function fetchJson(path, options = {}, allowedStatuses = []) {
    const candidates = state.apiBase ? [state.apiBase, ...getApiCandidates().filter((x) => x !== state.apiBase)] : getApiCandidates();
    let lastError = null;
    for (const base of candidates) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), options.timeoutMs || API_TIMEOUT_MS);
      const headers = { Accept: 'application/json', ...(options.headers || {}) };
      if (state.token) headers['x-session-token'] = state.token;
      if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
      try {
        const response = await fetch(`${base}${path}`, {
          ...options,
          headers,
          credentials: 'include',
          signal: controller.signal,
          body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok || allowedStatuses.includes(response.status)) {
          state.apiBase = base;
          try { localStorage.setItem(API_BASE_KEY, base); } catch (_) {}
          return { status: response.status, payload };
        }
        lastError = Object.assign(new Error(payload?.error || `HTTP_${response.status}`), { status: response.status, payload });
      } catch (error) {
        lastError = error;
      } finally {
        window.clearTimeout(timer);
      }
    }
    throw lastError || new Error('API_UNAVAILABLE');
  }

  function resolveFrameByLevel(level = 1) {
    const accountLevel = Math.max(1, Math.min(100, Math.floor(Number(level) || 1)));
    return frameRules.find((rule) => accountLevel >= rule.min && accountLevel <= rule.max)?.frame || 1;
  }

  function resolveFrameUnlockLevel(frameIndex = 0) {
    const rule = frameRules.find((item) => item.frame === Number(frameIndex));
    return rule ? rule.min : 0;
  }

  function userLevel(user = state.user) {
    return Math.max(1, Math.min(100, Math.floor(Number(first(user?.accountLevel, user?.level, user?.progression?.level, 1)) || 1)));
  }

  function selectedFrameFor(user = state.user) {
    const explicit = Math.floor(Number(first(user?.selectedFrame, user?.frame, 0)) || 0);
    if (explicit > 0) return explicit <= 18 ? explicit : resolveFrameByLevel(explicit);
    return resolveFrameByLevel(userLevel(user));
  }

  function avatarUrlFor(user = state.user) {
    return safeText(first(user?.avatar, user?.photoURL, user?.photoUrl, DEFAULT_REMOTE_AVATAR), DEFAULT_REMOTE_AVATAR);
  }

  function createAvatarNode({ avatar = DEFAULT_REMOTE_AVATAR, frame = 0, label = 'Oyuncu' } = {}) {
    const core = document.createElement('span');
    const frameIndex = Math.max(0, Math.min(18, Math.floor(Number(frame) || 0)));
    const profile = frameProfiles[frameIndex] || frameProfiles[1];
    core.className = 'pm-avatarCore';
    core.dataset.frame = String(frameIndex);
    core.style.setProperty('--avatar-fit', profile.fit);
    core.style.setProperty('--frame-scale', profile.scale);

    const image = document.createElement('img');
    image.className = 'pm-avatarCore__img';
    image.src = avatar || DEFAULT_REMOTE_AVATAR;
    image.alt = label;
    image.decoding = 'async';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.draggable = false;
    image.onerror = () => { image.src = FALLBACK_AVATAR; };
    core.appendChild(image);

    if (frameIndex > 0) {
      const frameImg = document.createElement('img');
      frameImg.className = 'pm-avatarCore__frame';
      frameImg.src = `./public/assets/frames/frame-${frameIndex}.png`;
      frameImg.alt = '';
      frameImg.decoding = 'async';
      frameImg.loading = 'lazy';
      frameImg.draggable = false;
      frameImg.setAttribute('aria-hidden', 'true');
      core.appendChild(frameImg);
    }
    return core;
  }

  function renderAvatar(slotId, options = {}) {
    const slot = $(slotId);
    if (!slot) return;
    slot.replaceChildren(createAvatarNode(options));
  }

  function iconSvg(name) {
    const map = {
      trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17 9 12l4 4 7-9"/><path d="M14 7h6v6"/></svg>',
      chess: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 3h8v3h-2v3.2c1.8.8 3 2.4 3 4.3 0 1.2-.5 2.4-1.35 3.25H18V21H6v-4.25h2.35A4.64 4.64 0 0 1 7 13.5c0-1.9 1.2-3.5 3-4.3V6H8V3Z"/></svg>',
      cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="12" height="16" rx="2"/><path d="M5 7 3.6 18.3A2 2 0 0 0 5.58 20.5H15"/><path d="M11 8h4M11 12h4"/></svg>',
      grid: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"/></svg>',
      rocket: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.9 14.9 9.1 11.1C10.8 6.5 14.2 3.6 20.5 3.5c-.1 6.3-3 9.7-7.6 11.4ZM7.6 12.2l4.2 4.2-2.1 2.1-2.8-.7-.7-2.8 1.4-2.8ZM6.2 18.4 5 22l3.6-1.2-2.4-2.4Z"/></svg>',
      snake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14c0-3 2-5 5-5h4a3 3 0 0 0 0-6H9"/><path d="M20 10c0 3-2 5-5 5h-4a3 3 0 0 0 0 6h4"/><path d="M16 3h.01M8 21h.01"/></svg>'
    };
    return map[name] || map.grid;
  }

  function showToast(message, tone = 'info') {
    const host = $('toastHost');
    if (!host) return;
    const toast = document.createElement('div');
    toast.className = `pm-toast pm-toast--${tone}`;
    toast.textContent = message;
    host.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  function reportClientError(scope, error, context = {}) {
    const payload = {
      game: 'home',
      scope,
      message: safeText(error?.message || error || 'Bilinmeyen hata', 180),
      path: location.pathname,
      source: 'home.final.script',
      context
    };
    fetchJson('/api/client/error', { method: 'POST', body: payload, timeoutMs: 2200 }, [401, 404, 405]).catch(() => null);
  }

  function lockLayers(lock) {
    document.body.classList.toggle('pm-layer-open', !!lock);
    $('globalOverlay').hidden = !lock;
    $('globalOverlay').classList.toggle('is-visible', !!lock);
  }

  function closeLayer() {
    $$('.pm-drawer.is-open, .pm-modal.is-open').forEach((node) => {
      node.classList.remove('is-open');
      node.setAttribute('aria-hidden', 'true');
    });
    state.activeLayer = null;
    lockLayers(false);
  }

  function openLayer(id) {
    const node = $(id);
    if (!node) return;
    closeLayer();
    state.activeLayer = id;
    node.classList.add('is-open');
    node.setAttribute('aria-hidden', 'false');
    lockLayers(true);
    window.setTimeout(() => node.querySelector('input, textarea, button')?.focus?.({ preventScroll: true }), 60);
  }

  function setAuthMode(mode) {
    state.authMode = mode === 'register' ? 'register' : 'login';
    document.body.dataset.authMode = state.authMode;
    $('authTitle').textContent = state.authMode === 'register' ? 'Kayıt Ol' : 'Giriş Yapın';
    $('authSubmitBtn').textContent = state.authMode === 'register' ? 'Kayıt Ol' : 'Devam Et';
    $$('[data-auth-mode]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.authMode === state.authMode));
    const msg = $('authMessage');
    if (msg) { msg.textContent = ''; msg.className = 'pm-formMessage'; }
  }

  function openAuth(mode = 'login') {
    setAuthMode(mode);
    openLayer('authModal');
  }

  function authHeaders(extra = {}) {
    return { ...extra, ...(state.token ? { 'x-session-token': state.token } : {}) };
  }

  async function ensureFirebase() {
    if (state.firebase) return state.firebase;
    const [appModule, authModule] = await withTimeout(Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js')
    ]), FIREBASE_IMPORT_TIMEOUT_MS, 'FIREBASE_IMPORT_TIMEOUT');
    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(PUBLIC_FIREBASE_CONFIG);
    const auth = authModule.getAuth(app);
    state.firebase = { appModule, authModule, app, auth };
    authModule.onAuthStateChanged(auth, async (user) => {
      if (user) {
        await bootstrapSession(user).catch((error) => reportClientError('auth.bootstrap', error));
        await loadCurrentUser().catch((error) => reportClientError('auth.user_load', error));
      } else if (!readSessionToken()) {
        setAuthState('guest', null);
      }
    });
    return state.firebase;
  }

  async function bootstrapSession(firebaseUser) {
    const { authModule } = await ensureFirebase();
    const idToken = await authModule.getIdToken(firebaseUser, true);
    const { payload } = await fetchJson('/api/auth/session/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: {}
    });
    const token = payload?.sessionToken || payload?.session?.token || '';
    if (token) storeSessionToken(token);
    if (payload?.user) setAuthState('authenticated', payload.user);
    return payload;
  }

  async function submitAuth(event) {
    event.preventDefault();
    const message = $('authMessage');
    message.textContent = 'İşlem hazırlanıyor...';
    message.className = 'pm-formMessage';
    const identifier = $('authIdentifier').value.trim();
    const password = $('authPassword').value;
    try {
      const { auth, authModule } = await ensureFirebase();
      if (state.authMode === 'login') {
        if (!identifier || !password) throw new Error('E-posta/kullanıcı adı ve şifre zorunlu.');
        const resolved = await fetchJson('/api/auth/resolve-login', { method: 'POST', body: { identifier } }, [404]);
        if (resolved.status === 404 || resolved.payload?.ok === false) throw new Error('Kullanıcı bulunamadı.');
        const email = resolved.payload.email || identifier;
        const credential = await authModule.signInWithEmailAndPassword(auth, email, password);
        await bootstrapSession(credential.user);
        message.textContent = 'Giriş başarılı.';
        message.className = 'pm-formMessage is-ok';
        closeLayer();
        showToast('Oturum açıldı.', 'success');
        return;
      }
      const fullName = $('authFullName').value.trim();
      const username = $('authUsername').value.trim();
      if (!fullName || !username || !identifier || !password) throw new Error('Kayıt için tüm alanları doldur.');
      if (!identifier.includes('@')) throw new Error('Kayıt için geçerli e-posta adresi gir.');
      const credential = await authModule.createUserWithEmailAndPassword(auth, identifier, password);
      await authModule.sendEmailVerification(credential.user).catch(() => null);
      await bootstrapSession(credential.user);
      const avatar = avatarUrlFor();
      await fetchJson('/api/profile/update', { method: 'POST', body: { fullName, username, avatar, selectedFrame: 1 } });
      await loadCurrentUser();
      message.textContent = 'Hesap oluşturuldu.';
      message.className = 'pm-formMessage is-ok';
      closeLayer();
      showToast('Kayıt tamamlandı. Doğrulama e-postası gönderildi.', 'success');
    } catch (error) {
      message.textContent = normalizeAuthError(error);
      message.className = 'pm-formMessage is-error';
      reportClientError('auth.submit', error);
    }
  }

  function normalizeAuthError(error) {
    const raw = String(error?.code || error?.message || error || '').toLowerCase();
    if (raw.includes('invalid-credential') || raw.includes('wrong-password')) return 'Giriş bilgileri doğrulanamadı.';
    if (raw.includes('email-already-in-use')) return 'Bu e-posta adresi zaten kullanılıyor.';
    if (raw.includes('weak-password')) return 'Şifre en az 6 karakter olmalı.';
    if (raw.includes('invalid-email')) return 'Geçerli bir e-posta adresi gir.';
    if (raw.includes('network')) return 'Ağ bağlantısı kurulamadı. Tekrar dene.';
    return error?.message || 'İşlem tamamlanamadı.';
  }

  async function sendPasswordReset() {
    const msg = $('forgotMessage');
    const email = $('forgotEmail').value.trim();
    try {
      if (!email || !email.includes('@')) throw new Error('Geçerli e-posta adresi gir.');
      const { auth, authModule } = await ensureFirebase();
      await authModule.sendPasswordResetEmail(auth, email);
      msg.textContent = 'Şifre sıfırlama bağlantısı gönderildi.';
      msg.className = 'pm-formMessage is-ok';
    } catch (error) {
      msg.textContent = normalizeAuthError(error);
      msg.className = 'pm-formMessage is-error';
    }
  }

  function setAuthState(next, user = null) {
    const auth = next === 'authenticated' || next === true || user ? 'authenticated' : 'guest';
    state.auth = auth;
    state.user = auth === 'authenticated' ? normalizeUser(user || state.user || {}) : null;
    document.body.dataset.authState = auth;
    $('guestHeaderActions').hidden = auth === 'authenticated';
    $('accountChip').hidden = auth !== 'authenticated';
    $$('[data-guest-label]').forEach((item) => {
      const label = auth === 'authenticated' ? item.dataset.userLabel : item.dataset.guestLabel;
      const node = item.querySelector('.pm-bottomBar__text');
      if (label && node) node.textContent = label;
    });
    renderUserShell();
  }

  function normalizeUser(raw = {}) {
    const p = raw.profile || raw.user || raw;
    return {
      uid: safeText(p.uid || ''),
      username: safeText(first(p.username, p.displayName, p.fullName, p.email?.split('@')[0], 'Oyuncu'), 'Oyuncu'),
      email: safeText(p.email || ''),
      avatar: avatarUrlFor(p),
      selectedFrame: selectedFrameFor(p),
      accountLevel: userLevel(p),
      xp: Math.max(0, Number(first(p.accountXp, p.xp, p.progression?.xp, 0)) || 0),
      balance: Math.max(0, Number(first(p.balance, p.mc, 0)) || 0),
      monthlyActiveScore: Math.max(0, Number(p.monthlyActiveScore || 0) || 0),
      progressPercent: Math.max(0, Math.min(100, Number(first(p.progressPercent, p.accountLevelProgressPct, p.progression?.progressPercent, 0)) || 0)),
      gameStats: p.gameStats || {},
      emailVerified: !!(p.emailVerified || p.email_verified),
      raw: p
    };
  }

  async function loadCurrentUser() {
    if (!state.token) {
      setAuthState('guest', null);
      return null;
    }
    try {
      const { payload } = await fetchJson('/api/me', { method: 'GET' }, [401]);
      if (payload?.ok && payload.user) {
        setAuthState('authenticated', payload.user);
        return state.user;
      }
      setAuthState('guest', null);
      clearSessionToken();
      return null;
    } catch (error) {
      reportClientError('home.player_stats', error);
      return null;
    }
  }

  function renderUserShell() {
    const user = state.user;
    const avatar = avatarUrlFor(user || {});
    const frame = user ? selectedFrameFor(user) : 0;
    renderAvatar('topAvatarSlot', { avatar, frame, label: user?.username || 'Misafir' });
    renderAvatar('drawerAvatarSlot', { avatar, frame, label: user?.username || 'Misafir' });
    if ($('topBalance')) $('topBalance').textContent = formatNumber(user?.balance || 0);
    if ($('drawerUsername')) $('drawerUsername').textContent = user?.username || 'Misafir';
    if ($('drawerMeta')) $('drawerMeta').textContent = user ? `Lv. ${user.accountLevel} · ${formatNumber(user.balance)} MC · ${formatNumber(user.xp)} XP` : 'Oturum bekleniyor';
    const pct = Math.max(0, Math.min(100, Number(user?.progressPercent || 0)));
    if ($('drawerProgressText')) $('drawerProgressText').textContent = `%${pct.toFixed(1)}`;
    if ($('drawerProgressFill')) $('drawerProgressFill').style.width = `${pct}%`;
  }

  function accountStatRows(user = state.user) {
    const u = normalizeUser(user || {});
    const total = u.gameStats?.total || {};
    return [
      ['Hesap Seviyesi', u.accountLevel || 0],
      ['Hesap XP', formatNumber(u.xp || 0)],
      ['MC Bakiyesi', `${formatNumber(u.balance || 0)} MC`],
      ['Aylık Aktiflik', formatNumber(u.monthlyActiveScore || 0)],
      ['Seviye İlerlemesi', `%${Number(u.progressPercent || 0).toFixed(1)}`],
      ['Toplam Oyun', formatNumber(first(total.rounds, u.raw?.totalRounds, 0))],
      ['Galibiyet', formatNumber(first(total.wins, u.raw?.totalWins, 0))],
      ['E-posta', u.emailVerified ? 'Doğrulandı' : 'Beklemede']
    ];
  }

  function openAccountStats() {
    if (!state.user) { openAuth('login'); return; }
    const user = normalizeUser(state.user);
    renderAvatar('accountStatsAvatar', { avatar: user.avatar, frame: selectedFrameFor(user), label: user.username });
    if ($('accountStatsSub')) $('accountStatsSub').textContent = `${formatNumber(user.balance)} MC · Lv. ${user.accountLevel} · ${formatNumber(user.xp)} XP`;
    const grid = $('accountStatsGrid');
    if (grid) {
      grid.replaceChildren(...accountStatRows(user).map(([label, value]) => {
        const card = document.createElement('article');
        card.className = 'pm-playerStatsCard';
        const strong = document.createElement('strong');
        strong.textContent = value;
        const span = document.createElement('span');
        span.textContent = label;
        card.append(strong, span);
        return card;
      }));
    }
    openLayer('accountStatsModal');
  }

  function renderGames() {
    const grid = $('gameGrid');
    if (!grid) return;
    grid.replaceChildren(...games.map((game) => {
      const card = document.createElement('article');
      card.className = 'pm-gameCard';
      card.tabIndex = 0;
      card.dataset.gameId = game.id;
      card.dataset.gameRoute = game.route;
      card.dataset.gameAuth = String(game.auth);
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${game.title} oyununu aç`);
      card.innerHTML = `
        <div>
          <div class="pm-gameCard__top"><span class="pm-gameCard__icon" aria-hidden="true">${iconSvg(game.icon)}</span><span class="pm-statusPill">${game.auth ? 'Giriş Gerekir' : 'Hazır'}</span></div>
          <h3>${game.title}</h3>
          <p>${game.description}</p>
          <div class="pm-gameCard__tags">${game.tags.map((tag) => `<span>${tag}</span>`).join('')}</div>
        </div>
        <div class="pm-gameCard__footer"><span class="pm-statusPill">Online</span><button class="pm-gameCard__cta" type="button" data-game-route="${game.route}" data-game-auth="${game.auth}">Oyunu Aç</button></div>
      `;
      return card;
    }));
  }

  async function loadLeaderboard() {
    const list = $('leaderboardList');
    if (list) list.innerHTML = '<div class="pm-stateLine">Liderlik verileri yükleniyor...</div>';
    try {
      const { payload } = await fetchJson('/api/leaderboard', { method: 'GET' });
      state.leaderboard = payload?.tabs || null;
      renderLeaderboard();
    } catch (error) {
      reportClientError('leaderboard.load', error);
      if (list) list.innerHTML = '<div class="pm-stateLine">Liderlik verisi alınamadı. Daha sonra tekrar dene.</div>';
    }
  }

  function openPlayerStats(userLike) {
    const user = normalizeUser(userLike || state.user || {});
    if (!user || !user.username) return;
    renderAvatar('playerStatsAvatar', { avatar: user.avatar, frame: selectedFrameFor(user), label: user.username });
    const title = $('playerStatsTitle');
    const sub = $('playerStatsSub');
    const grid = $('playerStatsGrid');
    if (title) title.textContent = user.username;
    if (sub) sub.textContent = `${formatNumber(user.balance)} MC · Lv. ${user.accountLevel} · ${formatNumber(user.xp)} XP`;
    if (grid) {
      const total = user.gameStats?.total || {};
      const rows = [
        ['Hesap Seviyesi', `Lv. ${user.accountLevel}`],
        ['Hesap XP', formatNumber(user.xp)],
        ['MC Bakiyesi', `${formatNumber(user.balance)} MC`],
        ['Aylık Aktivite', formatNumber(user.monthlyActiveScore)],
        ['Seviye İlerlemesi', `%${Number(user.progressPercent || 0).toFixed(1)}`],
        ['Toplam Oyun', formatNumber(first(total.rounds, user.raw?.totalRounds, 0))],
        ['Galibiyet', formatNumber(first(total.wins, user.raw?.totalWins, 0))],
        ['E-posta', user.emailVerified ? 'Doğrulandı' : 'Gizli / Beklemede']
      ];
      grid.replaceChildren(...rows.map(([label, value]) => {
        const card = document.createElement('article');
        card.className = 'pm-playerStatsCard';
        const strong = document.createElement('strong');
        strong.textContent = value;
        const span = document.createElement('span');
        span.textContent = label;
        card.append(strong, span);
        return card;
      }));
    }
    openLayer('playerStatsModal');
  }

  function renderLeaderboard() {
    const list = $('leaderboardList');
    if (!list) return;
    const tab = state.leaderboardTab;
    const items = state.leaderboard?.[tab]?.items || [];
    if (!items.length) {
      list.innerHTML = '<div class="pm-stateLine">Henüz liderlik verisi yok.</div>';
      return;
    }
    list.replaceChildren(...items.slice(0, 8).map((item, index) => {
      const user = normalizeUser(item);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pm-leaderItem';
      row.setAttribute('aria-label', `${user.username} istatistiklerini aç`);
      const metric = tab === 'activity' ? `${formatNumber(item.monthlyActiveScore || user.monthlyActiveScore || 0)} Aktiflik` : `Lv. ${user.accountLevel}`;
      row.innerHTML = `<span class="pm-rank">#${index + 1}</span><span class="pm-avatarSlot pm-avatarSlot--leader"></span><span class="pm-leaderInfo"><strong>${user.username}</strong><small>${formatNumber(user.balance)} MC · ${formatNumber(user.xp)} XP</small></span><span class="pm-statusPill">${metric}</span>`;
      row.querySelector('.pm-avatarSlot').appendChild(createAvatarNode({ avatar: user.avatar, frame: selectedFrameFor(user), label: user.username }));
      row.addEventListener('click', () => openPlayerStats(item));
      return row;
    }));
  }

  async function claimPromo() {
    const input = $('promoCodeInput');
    const status = $('promoStatus');
    const code = input.value.trim();
    if (!state.user) { openAuth('login'); return; }
    if (!code) { status.textContent = 'Kod alanı boş bırakılamaz.'; return; }
    status.textContent = 'Kod kontrol ediliyor...';
    try {
      const { payload } = await fetchJson('/api/promo/claim', { method: 'POST', body: { code } });
      status.textContent = `Kod aktif edildi: +${formatNumber(payload.amount || 0)} MC`;
      if (payload.user || payload.profile) setAuthState('authenticated', payload.user || payload.profile);
      else await loadCurrentUser();
      showToast('Promosyon kodu aktif edildi.', 'success');
    } catch (error) {
      status.textContent = 'Kod aktif edilemedi.';
      reportClientError('promo.claim', error, { codeLength: code.length });
    }
  }

  async function sendSupport() {
    const status = $('supportStatus');
    const subject = $('supportSubject').value.trim() || 'Destek Talebi';
    const message = $('supportMessage').value.trim();
    if (!message) { status.textContent = 'Mesaj alanı boş bırakılamaz.'; status.className = 'pm-formMessage is-error'; return; }
    if (!state.user) { window.location.href = `mailto:playmatrixdestek@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`; return; }
    try {
      status.textContent = 'Destek talebi gönderiliyor...';
      const { payload } = await fetchJson('/api/support/message', { method: 'POST', body: { subject, text: message, message, source: 'home', category: 'AnaSayfa' } });
      status.textContent = `Destek kaydı oluşturuldu: ${payload?.message?.id || payload?.id || 'open'}`;
      status.className = 'pm-formMessage is-ok';
      showToast('Destek talebi alındı.', 'success');
    } catch (error) {
      status.textContent = 'Destek talebi gönderilemedi.';
      status.className = 'pm-formMessage is-error';
      reportClientError('support.send', error);
    }
  }

  async function openPromo() {
    if (!state.user) { openAuth('login'); return; }
    const status = $('promoStatus');
    if (status) status.textContent = 'Aktif promosyon kodun varsa güvenli şekilde kullanabilirsin.';
    openLayer('promoModal');
  }

  async function openWheel() {
    if (!state.user) { openAuth('login'); return; }
    openLayer('wheelModal');
    const status = $('wheelStatus');
    if (status) status.textContent = 'Çark durumu kontrol ediliyor...';
    try {
      const { payload } = await fetchJson('/api/wheel/config', { method: 'GET' });
      if (status) status.textContent = payload?.available === false ? 'Bugünkü ücretsiz çark hakkı kullanılmış.' : 'Ücretsiz çark hakkı hazır.';
    } catch (error) {
      if (status) status.textContent = 'Çark durumu alınamadı.';
      reportClientError('wheel.config', error);
    }
  }

  async function spinWheel() {
    if (!state.user) { openAuth('login'); return; }
    const status = $('wheelStatus');
    if (status) status.textContent = 'Çark çevriliyor...';
    try {
      const { payload } = await fetchJson('/api/wheel/spin', { method: 'POST', body: { source: 'home' } });
      const amount = first(payload?.reward?.amount, payload?.amount, 0);
      if (status) status.textContent = amount ? `Ödül tanımlandı: +${formatNumber(amount)} MC` : 'Çark sonucu alındı.';
      await loadCurrentUser().catch(() => null);
      showToast('Çark işlemi tamamlandı.', 'success');
    } catch (error) {
      if (status) status.textContent = 'Çark çevrilemedi.';
      reportClientError('wheel.spin', error);
    }
  }

  function socialPreviewUsers() {
    const levelItems = state.leaderboard?.level?.items || [];
    const activityItems = state.leaderboard?.activity?.items || [];
    const merged = [...levelItems, ...activityItems].map(normalizeUser);
    const seen = new Set();
    const users = [];
    for (const item of merged) {
      const key = item.uid || item.username;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      users.push(item);
    }
    if (state.user) users.unshift(normalizeUser(state.user));
    return users.slice(0, 12);
  }

  function renderSocialShell(messages = []) {
    const users = socialPreviewUsers();
    const stories = $('socialStories');
    if (stories) {
      stories.replaceChildren(...users.slice(0, 10).map((user) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pm-storyItem';
        btn.appendChild(createAvatarNode({ avatar: user.avatar, frame: selectedFrameFor(user), label: user.username }));
        const span = document.createElement('span');
        span.textContent = user.username;
        btn.appendChild(span);
        btn.addEventListener('click', () => openPlayerStats(user));
        return btn;
      }));
    }
    const list = $('socialList');
    if (list) {
      const rows = [
        { id: 'local', title: 'Yerel TR Lobisi', sub: 'Tüm çevrimiçi oyuncular', avatar: DEFAULT_REMOTE_AVATAR },
        ...users.slice(0, 8).map((u) => ({ id: u.uid || u.username, title: u.username, sub: `${formatNumber(u.balance)} MC · Lv. ${u.accountLevel}`, avatar: u.avatar, frame: selectedFrameFor(u), user: u }))
      ];
      list.replaceChildren(...rows.map((row, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `pm-socialRow${index === 0 ? ' is-active' : ''}`;
        button.appendChild(createAvatarNode({ avatar: row.avatar, frame: row.frame || 0, label: row.title }));
        const text = document.createElement('span');
        text.innerHTML = `<strong>${safeText(row.title)}</strong><small>${safeText(row.sub)}</small>`;
        const camera = document.createElement('span');
        camera.textContent = row.user ? '›' : '•';
        button.append(text, camera);
        button.addEventListener('click', () => row.user ? openPlayerStats(row.user) : loadSocialMessages());
        return button;
      }));
    }
    const msgBox = $('socialMessages');
    if (msgBox) {
      const normalized = messages.length ? messages : [
        { uid: 'system', username: 'PlayMatrix', text: 'Yerel TR lobisine hoş geldin. Mesaj göndermek için oturum gerekir.', at: Date.now() }
      ];
      msgBox.replaceChildren(...normalized.slice(-80).map((msg) => {
        const bubble = document.createElement('div');
        const isSelf = state.user && msg.uid === state.user.uid;
        bubble.className = `pm-chatBubble${isSelf ? ' is-self' : ''}`;
        const author = safeText(first(msg.username, isSelf ? state.user?.username : 'Oyuncu'), 'Oyuncu');
        bubble.innerHTML = `<small>${author}</small><span>${safeText(msg.text || msg.message || '')}</span>`;
        return bubble;
      }));
      msgBox.scrollTop = msgBox.scrollHeight;
    }
    renderAvatar('socialRoomAvatar', { avatar: DEFAULT_REMOTE_AVATAR, frame: 0, label: 'Yerel TR Lobisi' });
  }

  async function loadSocialMessages() {
    try {
      const { payload } = await fetchJson('/api/social/chat/tr', { method: 'GET' }, [401, 404]);
      renderSocialShell(payload?.messages || []);
    } catch (error) {
      reportClientError('social.load', error);
      renderSocialShell([]);
    }
  }

  async function openSocialCenter() {
    if (!state.user) { openAuth('login'); return; }
    openLayer('socialModal');
    await loadSocialMessages();
  }

  async function sendSocialMessage(event) {
    event.preventDefault();
    if (!state.user) { openAuth('login'); return; }
    const input = $('socialMessageInput');
    const text = input?.value.trim() || '';
    if (!text) return;
    input.value = '';
    try {
      await fetchJson('/api/social/chat/tr', { method: 'POST', body: { text } });
      await loadSocialMessages();
    } catch (error) {
      reportClientError('social.send', error);
      showToast('Mesaj gönderilemedi.', 'error');
    }
  }

  function avatarRegistry() {
    const fromRegistry = window.PMAvatarRegistry?.avatars || [];
    return [DEFAULT_REMOTE_AVATAR, ...fromRegistry].filter((value, index, array) => value && array.indexOf(value) === index).slice(0, 36);
  }

  function renderAvatarPicker() {
    const grid = $('avatarGrid');
    if (!grid) return;
    const current = avatarUrlFor(state.user || {});
    grid.replaceChildren(...avatarRegistry().map((avatar, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `pm-pickerCard${avatar === current ? ' is-active' : ''}`;
      card.dataset.avatar = avatar;
      card.appendChild(createAvatarNode({ avatar, frame: 0, label: `Avatar ${index + 1}` }));
      const label = document.createElement('strong');
      label.textContent = index === 0 ? 'Standart' : `Avatar ${index + 1}`;
      card.appendChild(label);
      return card;
    }));
  }

  function renderFramePicker() {
    const grid = $('frameGrid');
    if (!grid) return;
    const level = userLevel();
    const current = selectedFrameFor(state.user || {});
    const cards = [{ frame: 0, label: 'Çerçevesiz', min: 0 }, ...frameRules.map((rule) => ({ frame: rule.frame, min: rule.min, label: rule.min === rule.max ? `Seviye ${rule.min}` : `Seviye ${rule.min}-${rule.max}` }))];
    grid.replaceChildren(...cards.map((item) => {
      const locked = item.min > level;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `pm-pickerCard${item.frame === current ? ' is-active' : ''}${locked ? ' is-locked' : ''}`;
      card.dataset.frame = String(item.frame);
      card.disabled = locked;
      card.appendChild(createAvatarNode({ avatar: avatarUrlFor(state.user || {}), frame: item.frame, label: item.label }));
      const title = document.createElement('strong');
      title.textContent = item.label;
      const small = document.createElement('small');
      small.textContent = locked ? 'Kilitli' : item.frame === current ? 'Kullanımda' : 'Seç';
      card.append(title, small);
      return card;
    }));
  }

  async function saveProfilePatch(patch) {
    if (!state.user) { openAuth('login'); return; }
    try {
      const { payload } = await fetchJson('/api/profile/update', { method: 'POST', body: patch });
      setAuthState('authenticated', payload.user || payload.profile || payload.data || state.user);
      showToast('Profil güncellendi.', 'success');
      closeLayer();
    } catch (error) {
      reportClientError('profile.update', error);
      showToast('Profil güncellenemedi.', 'error');
    }
  }

  async function logout() {
    try { await fetchJson('/api/auth/session/logout', { method: 'POST', body: { sessionToken: state.token } }, [401, 404]); } catch (_) {}
    try {
      if (state.firebase?.auth) await state.firebase.authModule.signOut(state.firebase.auth);
    } catch (_) {}
    clearSessionToken();
    setAuthState('guest', null);
    closeLayer();
    showToast('Oturum kapatıldı.', 'info');
  }

  function navigateTo(target) {
    if (!target) return;
    if (target === 'account') { state.user ? openLayer('accountDrawer') : openAuth('login'); return; }
    if (target === 'login') { openAuth('login'); return; }
    if (target === 'register') { openAuth('register'); return; }
    if (target === 'support') { openLayer('supportModal'); return; }
    if (target === 'social') { openSocialCenter(); return; }
    if (target === 'promo') { openPromo(); return; }
    if (target === 'account-stats') { openAccountStats(); return; }
    if (target.startsWith('#')) {
      const node = document.querySelector(target);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveNav(target);
        closeLayer();
      }
    }
  }

  function setActiveNav(target) {
    $$('#primaryNav .pm-primaryNav__item').forEach((item) => {
      const active = item.dataset.navTarget === target || (target === '#anasayfa' && item.dataset.navTarget === '#anasayfa');
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    $$('#pmBottomBar .pm-bottomBar__item').forEach((item) => {
      const stateKey = state.auth === 'authenticated' ? 'userTarget' : 'guestTarget';
      const active = item.dataset[stateKey] === target;
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function installHeroSlider() {
    const viewport = $('pmHeroViewport');
    const track = $('pmHeroTrack');
    const slides = $$('.pm-heroSlide');
    const dots = $$('.pm-hero__dot');
    if (!viewport || !track || !slides.length || !dots.length) return;
    let current = 0;
    let timer = 0;
    let startX = 0;
    let deltaX = 0;
    let dragging = false;
    const render = () => {
      track.style.transform = `translate3d(-${current * 100}%,0,0)`;
      slides.forEach((slide, index) => slide.classList.toggle('is-active', index === current));
      dots.forEach((dot, index) => {
        const active = index === current;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-selected', String(active));
      });
    };
    const go = (index) => { current = (index + slides.length) % slides.length; render(); };
    const stop = () => { if (timer) clearInterval(timer); timer = 0; };
    const start = () => { stop(); timer = setInterval(() => go(current + 1), 5000); };
    dots.forEach((dot) => dot.addEventListener('click', () => { go(Number(dot.dataset.slideTo || 0)); start(); }));
    const begin = (x) => { dragging = true; startX = x; deltaX = 0; stop(); };
    const move = (x) => { if (dragging) deltaX = x - startX; };
    const end = () => { if (!dragging) return; if (Math.abs(deltaX) > 42) go(current + (deltaX < 0 ? 1 : -1)); dragging = false; start(); };
    viewport.addEventListener('touchstart', (e) => begin(e.touches[0].clientX), { passive: true });
    viewport.addEventListener('touchmove', (e) => move(e.touches[0].clientX), { passive: true });
    viewport.addEventListener('touchend', end, { passive: true });
    viewport.addEventListener('touchcancel', end, { passive: true });
    viewport.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') begin(e.clientX); });
    window.addEventListener('pointermove', (e) => move(e.clientX));
    window.addEventListener('pointerup', end);
    viewport.addEventListener('mouseenter', stop);
    viewport.addEventListener('mouseleave', start);
    render(); start();
  }

  function installEvents() {
    $('pmLoginButton')?.addEventListener('click', () => openAuth('login'));
    $('pmRegisterButton')?.addEventListener('click', () => openAuth('register'));
    $('accountChip')?.addEventListener('click', () => openLayer('accountDrawer'));
    $('authForm')?.addEventListener('submit', submitAuth);
    $('forgotPasswordBtn')?.addEventListener('click', () => { closeLayer(); openLayer('forgotModal'); });
    $('sendResetBtn')?.addEventListener('click', sendPasswordReset);
    $('sendSupportBtn')?.addEventListener('click', sendSupport);
    $('claimPromoBtn')?.addEventListener('click', claimPromo);
    $('spinWheelBtn')?.addEventListener('click', spinWheel);
    $('socialComposer')?.addEventListener('submit', sendSocialMessage);
    $('refreshSocialBtn')?.addEventListener('click', loadSocialMessages);
    $('globalOverlay')?.addEventListener('click', closeLayer);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeLayer(); });
    document.addEventListener('gesturestart', (event) => event.preventDefault());
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => { const now = Date.now(); if (now - lastTouchEnd <= 320) event.preventDefault(); lastTouchEnd = now; }, { passive: false });
    document.addEventListener('click', (event) => {
      const close = event.target.closest('[data-close-layer]');
      if (close) { closeLayer(); return; }
      const backAuth = event.target.closest('[data-back-auth]');
      if (backAuth) { closeLayer(); openAuth('login'); return; }
      const mode = event.target.closest('[data-auth-mode]');
      if (mode) { setAuthMode(mode.dataset.authMode); return; }
      const nav = event.target.closest('[data-nav-target]');
      if (nav) { event.preventDefault(); navigateTo(nav.dataset.navTarget); return; }
      const action = event.target.closest('[data-action]');
      if (action) {
        event.preventDefault();
        const value = action.dataset.action;
        if (value === 'register') openAuth('register');
        if (value === 'login') openAuth('login');
        if (value === 'support') openLayer('supportModal');
        if (value === 'account') navigateTo('account');
        if (value === 'account-stats') openAccountStats();
        if (value === 'promo') openPromo();
        if (value === 'wheel') openWheel();
        if (value === 'social') openSocialCenter();
        if (value === 'avatar') { if (!state.user) return openAuth('login'); renderAvatarPicker(); openLayer('avatarModal'); }
        if (value === 'frame') { if (!state.user) return openAuth('login'); renderFramePicker(); openLayer('frameModal'); }
        if (value === 'logout') logout();
        return;
      }
      const quick = event.target.closest('.pm-quickCard[data-link-key="support"]');
      if (quick) { event.preventDefault(); openLayer('supportModal'); return; }
      const game = event.target.closest('[data-game-route]');
      if (game) {
        const route = game.dataset.gameRoute;
        if (game.dataset.gameAuth === 'true' && !state.user) { openAuth('login'); return; }
        window.location.href = route;
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const game = event.target.closest?.('[data-game-route]');
      if (!game) return;
      event.preventDefault();
      const route = game.dataset.gameRoute;
      if (game.dataset.gameAuth === 'true' && !state.user) { openAuth('login'); return; }
      window.location.href = route;
    });
    $('pmBottomBar')?.addEventListener('click', (event) => {
      const item = event.target.closest('.pm-bottomBar__item');
      if (!item) return;
      const target = state.auth === 'authenticated' ? item.dataset.userTarget : item.dataset.guestTarget;
      navigateTo(target);
    });
    $('primaryNav')?.addEventListener('click', (event) => {
      const item = event.target.closest('.pm-primaryNav__item');
      if (!item) return;
      if (item.dataset.navTarget) navigateTo(item.dataset.navTarget);
    });
    $$('[data-leaderboard-tab]').forEach((btn) => btn.addEventListener('click', () => {
      state.leaderboardTab = btn.dataset.leaderboardTab;
      $$('[data-leaderboard-tab]').forEach((node) => {
        const active = node === btn;
        node.classList.toggle('is-active', active);
        node.setAttribute('aria-selected', String(active));
      });
      renderLeaderboard();
    }));
    $$('[data-social-tab]').forEach((btn) => btn.addEventListener('click', () => {
      state.socialTab = btn.dataset.socialTab || 'local';
      $$('[data-social-tab]').forEach((node) => node.classList.toggle('is-active', node === btn));
      if (state.socialTab === 'local') loadSocialMessages();
      else renderSocialShell([]);
    }));
    $('socialSearchInput')?.addEventListener('input', () => renderSocialShell([]));
    $('avatarGrid')?.addEventListener('click', (event) => {
      const card = event.target.closest('.pm-pickerCard[data-avatar]');
      if (!card) return;
      saveProfilePatch({ avatar: card.dataset.avatar, selectedFrame: selectedFrameFor(state.user || {}) });
    });
    $('frameGrid')?.addEventListener('click', (event) => {
      const card = event.target.closest('.pm-pickerCard[data-frame]');
      if (!card || card.disabled) return;
      saveProfilePatch({ selectedFrame: Number(card.dataset.frame || 0), avatar: avatarUrlFor(state.user || {}) });
    });
    window.addEventListener('error', (event) => reportClientError('window.error', event.error || event.message));
    window.addEventListener('unhandledrejection', (event) => reportClientError('window.unhandledrejection', event.reason));
  }


  function installLegacyCompatibility() {
    window.__PM_RUNTIME = window.__PM_RUNTIME || {};
    window.__PM_RUNTIME.apiBase = state.apiBase || RENDER_API_BASE;
    window.__PM_RUNTIME.auth = window.__PM_RUNTIME.auth || {};
    Object.defineProperty(window.__PM_RUNTIME.auth, 'currentUser', {
      configurable: true,
      get() {
        return state.user || null;
      }
    });

    window.openPlayMatrixSheet = (sheet, title = '', message = '') => {
      const key = String(sheet || '').trim().toLowerCase();
      if (key === 'auth' || key === 'login') { openAuth('login'); return true; }
      if (key === 'register') { openAuth('register'); return true; }
      if (key === 'forgot') { openLayer('forgotModal'); return true; }
      if (key === 'profile' || key === 'account') { state.user ? openLayer('accountDrawer') : openAuth('login'); return true; }
      if (key === 'stats' || key === 'account-stats' || key === 'istatistiklerim') { openAccountStats(); return true; }
      if (key === 'avatar') { if (!state.user) openAuth('login'); else { renderAvatarPicker(); openLayer('avatarModal'); } return true; }
      if (key === 'frame') { if (!state.user) openAuth('login'); else { renderFramePicker(); openLayer('frameModal'); } return true; }
      if (key === 'wheel') { openWheel(); return true; }
      if (key === 'promo' || key === 'bonus') { openPromo(); return true; }
      if (key === 'support') { openLayer('supportModal'); return true; }
      if (key === 'social') { openSocialCenter(); return true; }
      if (message) showToast(message, title || 'PlayMatrix');
      return false;
    };

    window.showPlayerStats = (player) => {
      if (player && typeof player === 'object') { openPlayerStats(player); return true; }
      const uid = String(player || '').trim();
      const tabs = state.leaderboard || {};
      const candidates = [
        ...(Array.isArray(tabs.level) ? tabs.level : []),
        ...(Array.isArray(tabs.activity) ? tabs.activity : []),
        ...(Array.isArray(tabs.monthly) ? tabs.monthly : [])
      ];
      const match = candidates.find((item) => String(item.uid || item.id || item.userId || '') === uid);
      if (match) { openPlayerStats(match); return true; }
      showToast('Oyuncu istatistiği bulunamadı.', 'Liderlik');
      return false;
    };

    window.PlayMatrixHome = Object.freeze({
      openAuth,
      openAccountStats,
      openSocialCenter,
      openPromo,
      openWheel,
      openSupport: () => openLayer('supportModal'),
      openAvatar: () => { if (!state.user) openAuth('login'); else { renderAvatarPicker(); openLayer('avatarModal'); } },
      openFrame: () => { if (!state.user) openAuth('login'); else { renderFramePicker(); openLayer('frameModal'); } },
      navigateTo,
      refreshUser: loadCurrentUser,
      refreshLeaderboard: loadLeaderboard,
      getState: () => ({ auth: state.auth, user: state.user, leaderboardTab: state.leaderboardTab })
    });
  }

  function boot() {
    document.body.dataset.authMode = 'login';
    state.apiBase = normalizeBase(getMetaContent('playmatrix-api-url')) || RENDER_API_BASE;
    installLegacyCompatibility();
    renderGames();
    renderUserShell();
    installEvents();
    installHeroSlider();
    loadLeaderboard();
    ensureFirebase().catch(() => null);
    loadCurrentUser();
    document.body.dataset.boot = 'ready';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

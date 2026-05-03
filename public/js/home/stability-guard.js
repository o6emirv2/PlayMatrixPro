(function () {
  'use strict';

  const VERSION = 'clean-runtime-fix-20260426h';
  const ONLINE_GAME_RE = /\/games\/(crash|chess|pisti)(?:\/)?$/i;
  const ONLINE_NAMES = /^(crash|satranç|satranc|pişti|pisti)$/i;
  const FALLBACK_AVATAR = '/public/assets/avatars/system/fallback.svg';

  function $(id) { return document.getElementById(id); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function txt(value, fallback) { const v = value == null ? '' : String(value).trim(); return v || (fallback || ''); }
  function safeJsonParse(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }
  function normalizeBase(value) { return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, ''); }
  function getApiBase() {
    try {
      if (window.__PM_API__ && typeof window.__PM_API__.getApiBaseSync === 'function') return normalizeBase(window.__PM_API__.getApiBaseSync());
    } catch (_) {}
    return normalizeBase(window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || window.location.origin);
  }
  function hasUser() {
    try { return !!window.__PM_RUNTIME?.auth?.currentUser; } catch (_) { return false; }
  }
  function isOnlineGameHref(href) {
    try {
      const url = new URL(href, window.location.origin);
      return ONLINE_GAME_RE.test(decodeURIComponent(url.pathname));
    } catch (_) {
      return ONLINE_GAME_RE.test(String(href || ''));
    }
  }
  function getGameNameFromNode(node) {
    const explicit = node?.dataset?.gameName || node?.dataset?.game || node?.dataset?.name || '';
    if (explicit) return txt(explicit, 'Online oyun');
    const title = node?.closest?.('.game-card')?.querySelector?.('.game-title')?.textContent || node?.textContent || '';
    if (/crash/i.test(title)) return 'Crash';
    if (/satran/i.test(title)) return 'Satranç';
    if (/pişti|pisti/i.test(title)) return 'Pişti';
    return 'Online oyun';
  }
  function report(scope, error, extra) {
    try {
      if (typeof window.__PM_REPORT_CLIENT_ERROR__ === 'function') {
        window.__PM_REPORT_CLIENT_ERROR__(scope, error instanceof Error ? error : new Error(String(error || scope)), { source: 'stability-guard', version: VERSION, ...(extra || {}) });
      }
    } catch (_) {}
  }


  const MODAL_SCROLL_LOCK = { locked: false, scrollY: 0 };
  function getActiveOverlay() {
    return document.querySelector('.ps-modal.active, .ps-modal.is-open, .ps-modal[aria-hidden="false"]');
  }
  function getScrollableModalTarget(node) {
    return node?.closest?.('.ps-modal-body, .avatar-picker-scroll, .frame-picker-scroll, .sheet-content, .ps-chat-stream, .modal-content, .modal-body') || null;
  }
  function canScrollTarget(target, deltaY) {
    if (!target) return false;
    const scrollHeight = Number(target.scrollHeight || 0);
    const clientHeight = Number(target.clientHeight || 0);
    if (scrollHeight <= clientHeight + 1) return false;
    const top = Number(target.scrollTop || 0);
    const maxTop = Math.max(0, scrollHeight - clientHeight);
    if (deltaY < 0) return top > 0;
    if (deltaY > 0) return top < maxTop - 1;
    return true;
  }
  function lockPageScroll() {
    if (MODAL_SCROLL_LOCK.locked) return;
    MODAL_SCROLL_LOCK.locked = true;
    MODAL_SCROLL_LOCK.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.documentElement.classList.add('pm-modal-scroll-locked');
    document.body.classList.add('modal-open', 'pm-modal-scroll-locked');
    document.body.style.top = `-${MODAL_SCROLL_LOCK.scrollY}px`;
  }
  function unlockPageScroll() {
    if (!MODAL_SCROLL_LOCK.locked) return;
    const restoreY = MODAL_SCROLL_LOCK.scrollY || 0;
    MODAL_SCROLL_LOCK.locked = false;
    MODAL_SCROLL_LOCK.scrollY = 0;
    document.documentElement.classList.remove('pm-modal-scroll-locked');
    document.body.classList.remove('modal-open', 'pm-modal-scroll-locked');
    document.body.style.removeProperty('top');
    window.setTimeout(() => window.scrollTo(0, restoreY), 0);
  }
  function syncModalScrollLock() {
    const hasOverlay = !!getActiveOverlay();
    if (hasOverlay) lockPageScroll();
    else unlockPageScroll();
  }
  function installModalScrollLock() {
    if (document.body?.dataset.pmModalScrollLockBound === '1') return;
    if (document.body) document.body.dataset.pmModalScrollLockBound = '1';
    let lastTouchY = 0;
    document.addEventListener('touchstart', (event) => {
      lastTouchY = Number(event.touches?.[0]?.clientY || 0);
    }, { passive: true, capture: true });
    document.addEventListener('touchmove', (event) => {
      const overlay = getActiveOverlay();
      if (!overlay) return;
      const target = getScrollableModalTarget(event.target);
      const currentY = Number(event.touches?.[0]?.clientY || lastTouchY || 0);
      const deltaY = lastTouchY - currentY;
      lastTouchY = currentY;
      if (!target || !overlay.contains(target) || !canScrollTarget(target, deltaY)) {
        event.preventDefault();
      }
    }, { passive: false, capture: true });
    document.addEventListener('wheel', (event) => {
      const overlay = getActiveOverlay();
      if (!overlay) return;
      const target = getScrollableModalTarget(event.target);
      if (!target || !overlay.contains(target) || !canScrollTarget(target, Number(event.deltaY || 0))) {
        event.preventDefault();
      }
    }, { passive: false, capture: true });
    const observer = new MutationObserver(syncModalScrollLock);
    observer.observe(document.body || document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-hidden', 'hidden'] });
    window.addEventListener('pageshow', syncModalScrollLock);
    window.addEventListener('resize', syncModalScrollLock);
    syncModalScrollLock();
  }

  function forceVisibleHome() {
    try {
      document.documentElement.classList.add('pm-home-stability-guard', 'pm-home-fallback-active');
      const main = document.querySelector('main.container');
      if (main) {
        main.hidden = false;
        main.style.removeProperty('display');
        main.style.opacity = '1';
        main.style.visibility = 'visible';
      }
      qsa('#hero, #games, #leaderboard, footer, .fade-up').forEach((node) => {
        node.hidden = false;
        node.classList.add('is-visible');
        node.style.opacity = '1';
        node.style.visibility = 'visible';
        if (node.classList.contains('fade-up')) node.style.transform = 'none';
      });
    } catch (error) { report('home.forceVisible', error); }
  }

  function createIcon(className) {
    const icon = document.createElement('i');
    icon.className = 'fa-solid ' + (className || 'fa-gamepad');
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }
  function createText(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value == null ? '' : String(value);
    return node;
  }
  function getAccent(game) {
    const key = String(game.name || '').toLowerCase();
    if (key.includes('crash')) return 'game-card--crash';
    if (key.includes('satran')) return 'game-card--chess';
    if (key.includes('pişti') || key.includes('pisti')) return 'game-card--pisti';
    if (key.includes('pattern')) return 'game-card--pattern';
    if (key.includes('space')) return 'game-card--space';
    if (key.includes('snake')) return 'game-card--snake';
    return 'game-card--default';
  }
  const FALLBACK_GAMES = [
    { name: 'Crash', category: 'online', access: 'auth', url: '/games/crash', icon: 'fa-arrow-trend-up', desc: 'Refleks ve zamanlama odaklı online multiplier oyunu.', tags: ['Canlı Oyun', 'Rekabet', 'Hızlı Tur'] },
    { name: 'Satranç', category: 'online', access: 'auth', url: '/games/chess', icon: 'fa-chess', desc: 'Modern arayüzlü online satranç arenası.', tags: ['PvP', 'Strateji', 'Arena'] },
    { name: 'Pişti', category: 'online', access: 'auth', url: '/games/pisti', icon: 'fa-layer-group', desc: 'Gerçek oyuncularla online pişti masaları.', tags: ['Kart', 'Online', 'Klasik'] },
    { name: 'Pattern Master', category: 'classic', access: 'free', url: '/games/pattern-master', icon: 'fa-shapes', desc: 'Dikkat ve görsel hafıza oyunu.', tags: ['Ücretsiz', 'Zeka', 'Refleks'] },
    { name: 'Space Pro', category: 'classic', access: 'free', url: '/games/space-pro', icon: 'fa-user-astronaut', desc: 'Hızlı klasik arcade uzay oyunu.', tags: ['Arcade', 'Retro', 'Ücretsiz'] },
    { name: 'Snake Pro', category: 'classic', access: 'free', url: '/games/snake-pro', icon: 'fa-wave-square', desc: 'Retro hisli akıcı snake oyunu.', tags: ['Retro', 'Arcade', 'Ücretsiz'] }
  ];

  function renderFallbackGamesIfNeeded(force) {
    const grid = $('gamesGrid');
    if (!grid) return;
    const hasVisibleCards = qsa('.game-card:not(.skeleton)', grid).length > 0;
    if (hasVisibleCards && !force) return;
    const fragment = document.createDocumentFragment();
    FALLBACK_GAMES.forEach((game) => {
      const card = document.createElement('article');
      card.className = `game-card fade-up fast-painted is-visible ${getAccent(game)}`;
      card.dataset.fastPaint = '1';
      card.dataset.gameName = game.name;
      const top = document.createElement('div');
      top.className = 'game-top';
      const gameIcon = document.createElement('div');
      gameIcon.className = 'game-icon';
      gameIcon.appendChild(createIcon(game.icon));
      const tagStack = document.createElement('div');
      tagStack.className = 'tag-stack';
      const category = createText('span', 'mini-tag', game.category === 'online' ? 'Online' : 'Klasik');
      if (game.category === 'online') category.prepend(createText('span', 'live-dot', ''));
      const access = createText('span', 'mini-tag', game.access === 'auth' ? 'Giriş Gerekir' : 'Ücretsiz');
      tagStack.append(category, access);
      top.append(gameIcon, tagStack);
      const body = document.createElement('div');
      body.className = 'game-body';
      body.append(createText('h3', 'game-title', game.name), createText('div', 'game-desc', game.desc));
      const features = document.createElement('div');
      features.className = 'feature-list';
      (game.tags || []).forEach((tag) => features.appendChild(createText('span', 'feature-pill', tag)));
      body.appendChild(features);
      const foot = document.createElement('div');
      foot.className = 'game-foot game-footer';
      const link = document.createElement('a');
      link.className = 'play-btn game-cta';
      link.href = game.url;
      link.dataset.gameName = game.name;
      if (game.access === 'auth') link.dataset.requiresAuth = 'true';
      link.append(createText('span', '', game.access === 'auth' ? 'Giriş Yap' : 'Hemen Oyna'), createIcon('fa-arrow-right'));
      foot.appendChild(link);
      card.append(top, body, foot);
      fragment.appendChild(card);
    });
    grid.replaceChildren(fragment);
    grid.classList.remove('is-loading');
    grid.dataset.fastPainted = '1';
    const empty = $('gamesEmpty');
    if (empty) empty.hidden = true;
    const metric = $('metricGamesCount');
    if (metric) metric.textContent = String(FALLBACK_GAMES.length);
  }

  function openModalById(id) {
    const modal = $(id);
    if (!modal) return false;
    modal.hidden = false;
    modal.style.removeProperty('display');
    modal.classList.remove('is-hidden', 'is-closing');
    modal.classList.add('active', 'is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    syncModalScrollLock();
    return true;
  }
  function closeModalById(id) {
    const modal = $(id);
    if (!modal) return false;
    modal.classList.remove('active', 'is-open', 'is-opening');
    modal.classList.add('is-closing');
    modal.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      if (modal.classList.contains('is-closing')) {
        modal.classList.remove('is-closing');
        modal.hidden = true;
      }
      if (!document.querySelector('.ps-modal.active, .ps-modal.is-open')) document.body.classList.remove('modal-open');
      syncModalScrollLock();
    }, 90);
    return true;
  }
  function ensureModalContent(id, title, body) {
    const modal = $(id);
    if (!modal) return;
    const content = id === 'playerStatsModal' ? $('playerStatsContent') : modal.querySelector('.ps-modal-content, .avatar-picker-sheet, .frame-picker-sheet');
    if (!content) return;
    if (content.children.length > 1 || content.querySelector('.avatar-picker-grid, .frame-picker-grid, .player-stats-modal-body')) return;
    if (id === 'playerStatsModal') {
      content.innerHTML = `<div class="ps-modal-header"><div class="ps-modal-title" id="playerStatsTitle">${title}</div><button class="ps-modal-close" type="button" data-pm-action="closeMatrixModal" data-pm-args='["playerStatsModal"]' aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button></div><div class="ps-modal-body"><div class="ps-empty-state"><strong>${body}</strong></div></div>`;
    }
  }
  function openAvatarFallback() {
    const container = $('avatarCategoryContainer');
    if (container && !container.children.length) {
      container.innerHTML = '<div class="avatar-picker-empty">Avatar kataloğu hazırlanıyor. Sayfa tamamen yüklendiğinde seçenekler otomatik görünür.</div>';
    }
    return openModalById('avatarPickerModal');
  }
  function openFrameFallback() {
    const container = $('framePickerContainer');
    if (container && !container.children.length) {
      container.innerHTML = '<div class="avatar-picker-empty">Çerçeve kataloğu hazırlanıyor. Hesap seviyesi verisi gelince seçenekler otomatik görünür.</div>';
    }
    return openModalById('framePickerModal');
  }
  function installGlobalFallbacks() {
    window.renderGameShowcaseSkeleton = window.renderGameShowcaseSkeleton || function renderGameShowcaseSkeleton(count) {
      const grid = $('gamesGrid');
      if (!grid || grid.children.length) return;
      const total = Math.max(1, Math.min(6, Number(count) || 3));
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < total; i += 1) {
        const card = document.createElement('article');
        card.className = 'game-card skeleton is-skeleton';
        card.innerHTML = '<div class="game-top"><div class="game-icon skeleton"></div><div class="tag-stack"><span class="mini-tag skeleton"></span><span class="mini-tag skeleton"></span></div></div><div class="game-body"><h3 class="game-title skeleton"></h3><div class="game-desc skeleton"></div></div><div class="game-footer"><span class="game-status skeleton"></span><span class="game-cta skeleton"></span></div>';
        fragment.appendChild(card);
      }
      grid.replaceChildren(fragment);
    };
    window.openMatrixModal = window.openMatrixModal || openModalById;
    window.closeMatrixModal = window.closeMatrixModal || closeModalById;
    const previousAvatar = window.openAvatarSelectionModal;
    window.openAvatarSelectionModal = function openAvatarSelectionModalGuard() {
      try { if (typeof previousAvatar === 'function' && previousAvatar !== window.openAvatarSelectionModal) previousAvatar(); } catch (error) { report('home.avatar.open.previous', error); }
      openAvatarFallback();
      return true;
    };
    const previousFrame = window.openFrameSelectionModal;
    window.openFrameSelectionModal = function openFrameSelectionModalGuard() {
      try { if (typeof previousFrame === 'function' && previousFrame !== window.openFrameSelectionModal) previousFrame(); } catch (error) { report('home.frame.open.previous', error); }
      openFrameFallback();
      return true;
    };
    window.closeAvatarPicker = window.closeAvatarPicker || function () { return closeModalById('avatarPickerModal'); };
    window.closeFramePicker = window.closeFramePicker || function () { return closeModalById('framePickerModal'); };
    window.playCrashSfx = window.playCrashSfx || function playCrashSfxFallback() {};
  }

  function setAuthMode(mode) {
    try {
      if (typeof window.setAuthMode === 'function') { window.setAuthMode(mode); return; }
      qsa('#authSegment button').forEach((button) => {
        const active = button.dataset.authMode === mode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const fullName = $('authFullNameGroup');
      const username = $('authUsernameGroup');
      if (fullName) fullName.classList.toggle('hidden', mode !== 'register');
      if (username) username.classList.toggle('hidden', mode !== 'register');
      const submit = $('authSubmitBtn');
      if (submit) submit.textContent = mode === 'register' ? 'Kayıt Ol' : 'Giriş Yap';
    } catch (_) {}
  }
  function openSheetFallback(sheetName, title, subtitle) {
    try {
      if (typeof window.openSheet === 'function') {
        window.openSheet(sheetName, title, subtitle);
        return true;
      }
      const shell = $('sheetShell');
      const panel = $('sheetPanel');
      if (!shell || !panel) return false;
      shell.hidden = false;
      shell.classList.add('active', 'is-open');
      shell.setAttribute('aria-hidden', 'false');
      $('sheetTitle') && ($('sheetTitle').textContent = title || 'PlayMatrix');
      $('sheetSubtitle') && ($('sheetSubtitle').textContent = subtitle || '');
      qsa('.sheet-section').forEach((section) => section.classList.toggle('active', section.dataset.sheet === sheetName));
      document.body.classList.add('sheet-open');
      return true;
    } catch (error) { report('home.sheet.openFallback', error); return false; }
  }
  function requireLoginForOnlineGame(gameName) {
    setAuthMode('login');
    if (!openSheetFallback('auth', 'Hesabına giriş yap', `${gameName || 'Online oyun'} için önce hesabına giriş yapmalısın.`)) {
      const loginButton = $('loginBtn');
      if (loginButton && typeof loginButton.click === 'function') loginButton.click();
      else window.location.href = '/#login';
    }
  }

  function normalizeLeaderboardItems(payload, tab) {
    const items = payload?.tabs?.[tab]?.items;
    if (Array.isArray(items)) return items;
    if (Array.isArray(payload?.[tab])) return payload[tab];
    return [];
  }
  function createLeaderboardItem(user, index, tab) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'lb-item pm-lb-fallback-item is-visible';
    const uid = txt(user?.uid || user?.id || user?.userId || user?.profileUid, '');
    if (uid) item.dataset.uid = uid;
    item.dataset.playerName = txt(user?.username || user?.displayName || user?.email, 'Oyuncu');
    item.dataset.metric = tab;
    const rank = Math.max(1, Number(user?.leaderboard?.rank || user?.rank || index + 1) || index + 1);
    const rankEl = createText('div', 'lb-rank', `#${rank}`);
    const avatar = document.createElement('div');
    avatar.className = 'pm-avatar-host pm-avatar--leaderboard';
    avatar.innerHTML = `<img src="${txt(user?.avatar, FALLBACK_AVATAR)}" alt="Oyuncu avatarı" loading="lazy" decoding="async" onerror="this.src='${FALLBACK_AVATAR}'">`;
    const name = createText('div', 'lb-name', item.dataset.playerName);
    const meta = createText('div', 'lb-user-meta', tab === 'activity' ? 'Aylık aktiflik sıralaması' : 'Hesap seviyesi sıralaması');
    name.appendChild(meta);
    const scoreBox = document.createElement('div');
    scoreBox.className = 'lb-score-box';
    const score = tab === 'activity'
      ? Number(user?.monthlyActiveScore || user?.score || 0)
      : Math.max(1, Number(user?.accountLevel || user?.level || 1) || 1);
    scoreBox.append(createText('span', 'lb-score-val ' + (tab === 'activity' ? 'lb-score-val--activity' : 'lb-score-val--level'), tab === 'activity' ? score.toLocaleString('tr-TR') : `Lv. ${score}`), createText('span', 'lb-score-label', tab === 'activity' ? 'AKTİFLİK' : 'SEVİYE'));
    item.append(rankEl, avatar, name, scoreBox);
    return item;
  }
  function renderLeaderboardFallback(payload) {
    const area = $('leaderboardListArea');
    if (!area) return false;
    const activeTab = document.querySelector('#leaderboardTabs .lb-tab-btn.active')?.dataset.lbTab || 'level';
    const list = normalizeLeaderboardItems(payload, activeTab).slice(0, 5);
    area.replaceChildren();
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'lb-empty-state';
      empty.textContent = activeTab === 'activity' ? 'Aylık aktiflik sıralaması için kayıt bekleniyor.' : 'Hesap seviyesi sıralaması için kayıt bekleniyor.';
      area.appendChild(empty);
      return true;
    }
    list.forEach((user, index) => area.appendChild(createLeaderboardItem(user, index, activeTab)));
    area.dataset.fallbackHydrated = '1';
    return true;
  }
  async function fetchLeaderboardWithTimeout(timeoutMs) {
    const base = getApiBase();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), Math.max(3500, timeoutMs || 9000));
    try {
      const requestUrl = `${base && base !== window.location.origin ? base : ''}/api/leaderboard?t=${Date.now()}`;
      const response = await fetch(requestUrl, { method: 'GET', credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok === false) throw new Error(payload?.error || `HTTP_${response.status}`);
      return payload;
    } finally {
      window.clearTimeout(timer);
    }
  }
  async function hydrateLeaderboardFallback() {
    const area = $('leaderboardListArea');
    if (!area) return;
    const needsHydration = area.dataset.fallbackHydrated !== '1' && (area.dataset.fastPainted === '1' || area.querySelector('.skeleton,.fast-lb-item') || !area.children.length);
    if (!needsHydration) return;
    try {
      const payload = await fetchLeaderboardWithTimeout(9000);
      renderLeaderboardFallback(payload);
    } catch (error) {
      // Expected mobile/network fallback failures must not spam Render logs.
      area.dataset.fallbackHydrated = '1';
      if (!area.children.length || area.querySelector('.skeleton')) {
        area.replaceChildren();
        const box = document.createElement('div');
        box.className = 'lb-error-state';
        box.textContent = 'Liderlik verisi şu an alınamadı. Yenile butonuyla tekrar deneyebilirsin.';
        area.appendChild(box);
      }
    }
  }
  function renderPlayerStatsFallback(target) {
    const modal = $('playerStatsModal');
    const content = $('playerStatsContent');
    if (!modal || !content) return false;
    const node = target && target.nodeType === 1 ? target : null;
    const name = txt(node?.dataset?.playerName || node?.querySelector?.('.lb-name')?.childNodes?.[0]?.textContent, 'Oyuncu');
    const rank = txt(node?.querySelector?.('.lb-rank')?.textContent, '—');
    const score = txt(node?.querySelector?.('.lb-score-val')?.textContent, '—');
    const metric = txt(node?.querySelector?.('.lb-score-label')?.textContent, 'SIRALAMA');
    content.innerHTML = `<div class="ps-modal-header"><div class="ps-modal-title" id="playerStatsTitle">Oyuncu İstatistikleri</div><button class="ps-modal-close" type="button" data-pm-action="closeMatrixModal" data-pm-args='["playerStatsModal"]' aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button></div><div class="ps-modal-body player-stats-modal-body"><section class="player-stats-panel"><h4 class="player-stats-panel-title">${name}</h4><div class="player-stats-rows"><div class="player-stats-row"><span>Sıra</span><strong>${rank}</strong></div><div class="player-stats-row"><span>${metric}</span><strong>${score}</strong></div><div class="player-stats-row"><span>Durum</span><strong>Genel görünüm</strong></div></div></section><div class="ps-modal-note">Detaylı profil istatistikleri giriş yapıldığında sunucudan çekilir.</div></div>`;
    openModalById('playerStatsModal');
    return true;
  }
  function installStatsFallback() {
    const previous = window.showPlayerStats;
    window.showPlayerStats = function showPlayerStatsGuard(uidOrNode) {
      if (hasUser() && typeof previous === 'function' && previous !== window.showPlayerStats) {
        try { return previous(uidOrNode); } catch (error) { report('home.playerStats.previous', error); }
      }
      return renderPlayerStatsFallback(uidOrNode && uidOrNode.nodeType === 1 ? uidOrNode : null);
    };
  }

  function consumePendingLoginHint() {
    let shouldOpen = false;
    try {
      shouldOpen = sessionStorage.getItem('pm_open_login_after_home') === '1' || location.hash === '#login';
      sessionStorage.removeItem('pm_open_login_after_home');
    } catch (_) { shouldOpen = location.hash === '#login'; }
    if (!shouldOpen) return;
    window.setTimeout(() => requireLoginForOnlineGame('Online oyun'), 120);
  }

  function installClickGuards() {
    if (document.body?.dataset.pmStabilityGuardBound === '1') return;
    if (document.body) document.body.dataset.pmStabilityGuardBound = '1';
    document.addEventListener('click', (event) => {
      const avatarBtn = event.target.closest?.('#openAvatarSelectionBtn, [data-pm-action="openAvatarSelectionModal"]');
      if (avatarBtn) { event.preventDefault(); window.openAvatarSelectionModal(); return; }
      const frameBtn = event.target.closest?.('#openFrameSelectionBtn, [data-pm-action="openFrameSelectionModal"]');
      if (frameBtn) { event.preventDefault(); window.openFrameSelectionModal(); return; }
      const closeBtn = event.target.closest?.('[data-pm-action="closeMatrixModal"], [data-pm-action="closeAvatarPicker"], [data-pm-action="closeFramePicker"]');
      if (closeBtn) {
        const args = safeJsonParse(closeBtn.dataset.pmArgs || '[]', []);
        const id = args[0] || (closeBtn.dataset.pmAction === 'closeAvatarPicker' ? 'avatarPickerModal' : closeBtn.dataset.pmAction === 'closeFramePicker' ? 'framePickerModal' : 'matrixInfoModal');
        event.preventDefault(); closeModalById(id); return;
      }
      const statsItem = event.target.closest?.('#leaderboardListArea .lb-item, [data-open-player-stats], [data-player-uid]');
      if (statsItem && !statsItem.classList.contains('skeleton')) {
        event.preventDefault();
        if (typeof window.showPlayerStats === 'function') window.showPlayerStats(statsItem.dataset.uid || statsItem);
        else renderPlayerStatsFallback(statsItem);
        return;
      }
      const onlineTrigger = event.target.closest?.('a[href*="games"], [data-requires-auth="true"], .game-card');
      if (onlineTrigger) {
        const href = onlineTrigger.getAttribute?.('href') || onlineTrigger.querySelector?.('a[href]')?.getAttribute?.('href') || '';
        const name = getGameNameFromNode(onlineTrigger);
        const onlineByName = ONLINE_NAMES.test(String(name || '').trim());
        if ((isOnlineGameHref(href) || onlineTrigger.dataset?.requiresAuth === 'true' || onlineByName) && !hasUser()) {
          event.preventDefault(); event.stopPropagation();
          requireLoginForOnlineGame(name);
          return;
        }
      }
    }, true);
    qsa('#leaderboardTabs .lb-tab-btn').forEach((button) => {
      if (button.dataset.pmFallbackTabBound === '1') return;
      button.dataset.pmFallbackTabBound = '1';
      button.addEventListener('click', () => {
        window.setTimeout(() => {
          const area = $('leaderboardListArea');
          if (area && (area.dataset.fallbackHydrated === '1' || area.querySelector('.fast-lb-item,.skeleton'))) hydrateLeaderboardFallback();
        }, 60);
      }, true);
    });
  }

  function startFallbackLoops() {
    const queue = (delay, task) => window.setTimeout(() => { try { task(); } catch (error) { report('home.guard.task', error); } }, delay);
    [0, 80, 240, 600, 1200, 2400].forEach((delay) => queue(delay, forceVisibleHome));
    [300, 1500, 3500].forEach((delay) => queue(delay, () => renderFallbackGamesIfNeeded(false)));
    [1200, 3200, 6500].forEach((delay) => queue(delay, hydrateLeaderboardFallback));
  }

  function boot() {
    installModalScrollLock();
    installGlobalFallbacks();
    installStatsFallback();
    installClickGuards();
    consumePendingLoginHint();
    forceVisibleHome();
    startFallbackLoops();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

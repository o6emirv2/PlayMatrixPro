(() => {
  window.__PLAYMATRIX_ROUTE_NORMALIZER_DISABLED__ = true;
})();


import { initPlayMatrixOnlineCore } from "/public/pm-online-core.js";

    const core = await initPlayMatrixOnlineCore();
    const auth = core.auth;
    const onAuthStateChanged = core.onAuthStateChanged;
    const getIdToken = core.getIdToken;
    const signOut = core.signOut;
    window.__PM_RUNTIME = window.__PM_RUNTIME || {};
    window.__PM_RUNTIME.auth = auth;
    window.__PM_RUNTIME.signOut = signOut;
    window.__PM_RUNTIME.getIdToken = async (forceRefresh = false) => core.getIdToken(forceRefresh);
    const API_URL = core.getApiBaseSync();
    window.__PM_RUNTIME.apiBase = API_URL;
    window.__PLAYMATRIX_API_URL__ = API_URL;

    const getApiBase = () => core.getApiBaseSync();
    async function ensureApiBaseReady() { return core.ensureApiBaseReady(); }
    function escapeHTML(value = '') { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\'/g, '&#39;'); }


function ensureRealtimeShell() {
  window.__PM_REALTIME_SHELL__ = window.__PM_REALTIME_SHELL__ || { ready: true, page: document.body?.dataset?.game || 'game' };
  return window.__PM_REALTIME_SHELL__;
}

async function hydrateFriendCounts() {
  return { ok: true, counts: { incoming: 0, accepted: 0, outgoing: 0 } };
}

function showRealtimeToast(title = 'PlayMatrix', message = '', tone = 'info', options = {}) {
  try {
    if (window.__PM_TOAST__ && typeof window.__PM_TOAST__.show === 'function') {
      window.__PM_TOAST__.show({ title, message, tone, ...options });
      return;
    }
    if (typeof window.showToast === 'function') {
      window.showToast(title, message, tone);
      return;
    }
    const detail = [title, message].filter(Boolean).join(' — ');
    if (tone === 'error') console.error(detail); else console.info(detail);
  } catch (_) {}
}


function playSfx(name = '') {
  try {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return;
    const store = window.__PM_GAME_SFX__ || window.__PM_SFX__ || {};
    const audio = store[key];
    if (audio && typeof audio.play === 'function') {
      audio.currentTime = 0;
      audio.play().catch(() => null);
    }
  } catch (_) {}
}

function showRealtimeInviteModal(payload = {}) {
  try {
    const game = String(payload?.gameName || payload?.gameType || 'oyun');
    const host = String(payload?.hostName || 'Arkadaşın');
    showRealtimeToast('Oyun daveti', `${host} seni ${game} için davet ediyor.`, 'info', { duration: 5000 });
  } catch (_) {}
}

async function handleHostInviteAcceptedRedirect(payload = {}) {
  try {
    const gameType = String(payload?.gameType || payload?.game || '').toLowerCase();
    const roomId = String(payload?.roomId || payload?.targetRoomId || '').trim();
    if (!roomId) return false;
    if (gameType.includes('chess') || gameType.includes('satran')) {
      try { localStorage.setItem('activeChessRoom', roomId); } catch (_) {}
      window.location.href = '/games/chess';
      return true;
    }
    if (gameType.includes('pisti') || gameType.includes('pişti')) {
      try { localStorage.setItem('activePistiRoom', roomId); } catch (_) {}
      window.location.href = '/games/pisti';
      return true;
    }
  } catch (_) {}
  return false;
}


function getSafeWebStorage(name = 'localStorage') {
  try {
    const storage = window[name];
    if (!storage) return null;
    const probeKey = `__pm_storage_probe_${name}`;
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch (_) {
    return null;
  }
}

function getSafeStorageList() {
  return [getSafeWebStorage('sessionStorage'), getSafeWebStorage('localStorage')].filter(Boolean);
}

function getPendingAutoJoinRoom(gameKey = '') {
  const key = String(gameKey || '').trim().toLowerCase();
  const keys = [
    `pm_pending_auto_join_${key}`,
    `pm_pending_autojoin_${key}`,
    `pendingAutoJoin_${key}`,
    `active${key === 'chess' ? 'Chess' : key === 'pisti' ? 'Pisti' : ''}Room`
  ].filter(Boolean);
  for (const storage of getSafeStorageList()) {
    if (!storage) continue;
    for (const k of keys) {
      try {
        const value = String(storage.getItem(k) || '').trim();
        if (value) return value;
      } catch (_) {}
    }
  }
  return '';
}

function clearPendingAutoJoin(gameKey = '', roomId = '') {
  const key = String(gameKey || '').trim().toLowerCase();
  const room = String(roomId || '').trim();
  const keys = [
    `pm_pending_auto_join_${key}`,
    `pm_pending_autojoin_${key}`,
    `pendingAutoJoin_${key}`
  ];
  if (key === 'chess') keys.push('activeChessRoom');
  if (key === 'pisti') keys.push('activePistiRoom');
  for (const storage of getSafeStorageList()) {
    if (!storage) continue;
    for (const k of keys) {
      try {
        const current = String(storage.getItem(k) || '').trim();
        if (!room || !current || current === room) storage.removeItem(k);
      } catch (_) {}
    }
  }
}

function safeGetPendingAutoJoinRoom(gameKey = '', legacyKey = '') {
  try {
    const direct = (typeof getPendingAutoJoinRoom === 'function' ? getPendingAutoJoinRoom(gameKey) : '');
    if (direct) return direct;
  } catch (error) {
    console.warn('[PlayMatrix:Satranc] pending auto join storage skipped', error);
  }
  try {
    const local = getSafeWebStorage('localStorage');
    return String(local?.getItem(legacyKey) || '').trim();
  } catch (_) {
    return '';
  }
}

const elStudioIntro = document.getElementById('studioIntro');
    const elLoaderFill = document.getElementById('loaderFill');
    const elLoaderPct = document.getElementById('loaderPct');
    const elLoaderStatus = document.getElementById('loaderStatus');
    const elBtnEnterGame = document.getElementById('btnEnterGame');
    const elBtnRetryBoot = document.getElementById('btnRetryBoot');
    const elLobbyNotice = document.getElementById('lobbyNotice');
    const elGameNotice = document.getElementById('gameNotice');
    let bootPromise = null;
    let bootCompleted = false;
    let bootActionMode = 'retry';
    let userUid = '';
    let currentRoomId = '';
    let pollingInterval = 0;
    let pingInterval = 0;
    let myColor = 'w';
    let selectedSq = null;
    let validMovesForSelected = [];
    let lastFen = '';
    let lastStatus = '';
    let isProcessingMove = false;
    let currentRoomState = null;
    let lastResultSummaryKey = '';
    const gameLogic = new Chess();

    function renderRuntimeNotice(target, message = '', tone = 'warning', actionLabel = '', actionHandler = null) {
      if (!target) return;
      const text = String(message || '').trim();
      if (!text) { target.className = 'runtime-notice'; target.replaceChildren(); return; }
      target.className = `runtime-notice show ${tone === 'error' ? 'is-error' : tone === 'warning' ? 'is-warning' : ''}`.trim();
      target.replaceChildren();
      const textNode = document.createElement('div');
      textNode.className = 'runtime-notice__text';
      textNode.textContent = text;
      target.appendChild(textNode);
      if (actionLabel && typeof actionHandler === 'function') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'runtime-notice__action';
        btn.textContent = actionLabel;
        btn.addEventListener('click', actionHandler);
        target.appendChild(btn);
      }
    }

    function showLobbyNotice(message, tone = 'warning', actionLabel = '', actionHandler = null) { renderRuntimeNotice(elLobbyNotice, message, tone, actionLabel, actionHandler); }
    function showGameNotice(message, tone = 'warning', actionLabel = '', actionHandler = null) { renderRuntimeNotice(elGameNotice, message, tone, actionLabel, actionHandler); }


function setModalActive(id, active = true) {
  const el = document.getElementById(id);
  if (!el) return;
  const isActive = !!active;
  el.hidden = !isActive;
  el.classList.toggle('active', isActive);
  el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
}
function closeConfirmModal() { setModalActive('confirmModal', false); }
function showHowToPlay() {
  showMatrixModal('Nasıl Oynanır', 'Oda kur veya hızlı katıl. Taşına tıkla, sonra hedef kareyi seç. Şah-mat, teslim veya bağlantı kopması maç sonucunu belirler.', 'info');
}
function showMatrixModal(title, message, tone = 'info', autoLobby = false) {
  const titleEl = document.getElementById('matrixModalTitle');
  const descEl = document.getElementById('matrixModalDesc');
  const modal = document.getElementById('matrixModal');
  const closeBtn = document.getElementById('matrixModalCloseBtn');
  if (titleEl) titleEl.textContent = String(title || 'Bilgi');
  if (descEl) descEl.textContent = String(message || '');
  if (modal) {
    modal.dataset.tone = tone;
    setModalActive('matrixModal', true);
  }
  if (closeBtn) closeBtn.dataset.pmAutoLobby = autoLobby ? 'true' : 'false';
}
function showGameResultSummary(summary = {}, fallbackTitle = 'Oyun Sonucu', fallbackMessage = '', tone = 'info') {
  const key = [summary?.gameType || 'chess', summary?.resultCode || '', summary?.settledAt || '', summary?.outcome || ''].join(':');
  if (key && key === lastResultSummaryKey) return;
  lastResultSummaryKey = key;
  const title = summary?.title || fallbackTitle;
  const message = summary?.message || fallbackMessage || 'Oyun sonucu işlendi.';
  const resultTone = summary?.outcome === 'win' ? 'success' : summary?.outcome === 'loss' || summary?.outcome === 'abandoned' ? 'error' : tone;
  showMatrixModal(title, message, resultTone, true);
}

function closeMatrixModal() {
  const closeBtn = document.getElementById('matrixModalCloseBtn');
  const shouldLobby = closeBtn?.dataset.pmAutoLobby === 'true';
  setModalActive('matrixModal', false);
  if (shouldLobby) resetToLobby();
}
Object.assign(window, { closeConfirmModal, showHowToPlay, showMatrixModal });

    function clearRuntimeNotices() { showLobbyNotice(''); showGameNotice(''); }
    function setBootBusyState(isBusy) { if (elBtnEnterGame) elBtnEnterGame.disabled = !!isBusy; if (elBtnRetryBoot) elBtnRetryBoot.disabled = !!isBusy; }

    function setBootProgress(value) {
      const pct = Math.max(0, Math.min(100, Number(value) || 0));
      if (elLoaderFill) elLoaderFill.style.width = pct + '%';
      if (elLoaderPct) elLoaderPct.textContent = `${Math.round(pct)}%`;
    }

    function setBootStatus(message, tone = 'info') {
      if (!elLoaderStatus) return;
      elLoaderStatus.textContent = message;
      elLoaderStatus.classList.remove('is-error', 'is-warning');
      if (tone === 'error') elLoaderStatus.classList.add('is-error');
      if (tone === 'warning') elLoaderStatus.classList.add('is-warning');
    }

    function setBootActions({ showEnter = false, showRetry = false, enterLabel = 'SİSTEME BAĞLAN', actionMode = 'continue' } = {}) {
      bootActionMode = actionMode;
      if (elBtnEnterGame) {
        elBtnEnterGame.textContent = enterLabel;
        elBtnEnterGame.style.display = showEnter ? 'block' : 'none';
      }
      if (elBtnRetryBoot) elBtnRetryBoot.style.display = showRetry ? 'block' : 'none';
    }

    function dismissIntro() {
      if (!elStudioIntro) return;
      elStudioIntro.style.opacity = '0';
      setTimeout(() => { elStudioIntro.style.display = 'none'; }, 280);
    }

    function withTimeout(promise, ms, code = 'TIMEOUT') {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { const err = new Error(code); err.code = code; reject(err); }, ms);
        Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }).catch((error) => { clearTimeout(timer); reject(error); });
      });
    }

    function waitForAuthReady(timeoutMs = 15000) {
      return core.waitForAuthReady(timeoutMs);
    }

    async function resolveBootUser(timeoutMs = 15000) {
      try {
        return await waitForAuthReady(timeoutMs);
      } catch (error) {
        const profile = await core.requestWithAuth('/api/me', { method: 'GET', timeoutMs: 6500, retries: 0, allowSessionFallback: true }).catch(() => null);
        const uid = String(profile?.user?.uid || profile?.uid || profile?.profile?.uid || '').trim();
        if (uid) return { uid, sessionFallback: true };
        throw error;
      }
    }

    async function preparePollingSync() {
      await ensureApiBaseReady();
      return true;
    }

    async function bootChessApp(force = false) {
      if (bootCompleted && !force) return true;
      if (bootPromise) return bootPromise;
      bootPromise = (async () => {
        setBootBusyState(true);
        clearRuntimeNotices();
        setBootProgress(8);
        setBootStatus('Oturum doğrulanıyor...');
        setBootActions({ showEnter: false, showRetry: false });
        const user = await resolveBootUser(15000);
        userUid = user.uid;
        setBootProgress(28);
        setBootStatus('Profil hazırlanıyor...');
        await withTimeout(fetchBalance(), 7000, 'PROFILE_TIMEOUT');
        setBootProgress(48);
        setBootStatus('Lobi arayüzü hazırlanıyor...');
        wireLobbySearchUI();
        try { if (typeof ensureRealtimeShell === 'function') ensureRealtimeShell(); } catch (error) { console.warn('[PlayMatrix:Satranc] realtime shell skipped', error); }
        setBootProgress(66);
        setBootStatus('Lobi ve oyun verileri HTTP eşitleme modunda hazırlanıyor...');
        await withTimeout(Promise.resolve(preparePollingSync()).catch(() => null), 1200, 'SYNC_TIMEOUT').catch(() => null);
        try {
          if (typeof hydrateFriendCounts === 'function') {
            await withTimeout(Promise.resolve(hydrateFriendCounts(true)).catch(() => null), 4000, 'FRIEND_COUNTS_TIMEOUT').catch(() => null);
          }
        } catch (error) { console.warn('[PlayMatrix:Satranc] friend counts skipped', error); }
        const preferredRoom = safeGetPendingAutoJoinRoom('chess', 'activeChessRoom');
        let restored = false;
        if (preferredRoom) {
          setBootProgress(82);
          setBootStatus('Önceki oyun kontrol ediliyor...');
          restored = await withTimeout(restoreChessSession(preferredRoom, true), 6000, 'RESTORE_TIMEOUT').catch(() => false);
        }
        if (!restored) startLobbyPolling();
        bootCompleted = true;
        setBootProgress(100);
        setBootStatus('Bağlantı hazır. Arena açılıyor...');
        setBootActions({ showEnter: true, showRetry: false, enterLabel: 'ARENAYA GİR', actionMode: 'continue' });
        setTimeout(dismissIntro, 280);
        return true;
      })().catch((error) => {
        const code = error?.code || error?.message || 'BOOT_ERROR';
        if (['AUTH_TIMEOUT','NO_USER','FIREBASE_UNAVAILABLE','PUBLIC_RUNTIME_CONFIG_UNAVAILABLE','PUBLIC_FIREBASE_CONFIG_MISSING','FIREBASE_IMPORT_FAILED','FIREBASE_SDK_TIMEOUT'].includes(code)) {
          setBootProgress(18);
          setBootStatus('Oturum doğrulanamadı. Önce giriş yapıp tekrar deneyin.', 'error');
          setBootActions({ showEnter: true, showRetry: true, enterLabel: 'ANASAYFAYA DÖN', actionMode: 'home' });
        } else {
          console.warn('[PlayMatrix:Satranc] boot degraded to lobby', error);
          try { startLobbyPolling(); } catch (_) {}
          bootCompleted = true;
          setBootProgress(100);
          setBootStatus('Arena temel modda açılıyor. Bağlantı arka planda yeniden denenecek.', 'warning');
          setBootActions({ showEnter: true, showRetry: true, enterLabel: 'ARENAYA GİR', actionMode: 'continue' });
          setTimeout(dismissIntro, 280);
          return true;
        }
        bootCompleted = false;
        throw error;
      }).finally(() => { setBootBusyState(false); bootPromise = null; });
      return bootPromise;
    }

    elBtnEnterGame?.addEventListener('click', () => {
      if (bootActionMode === 'home') { window.location.href = '/'; return; }
      if (bootCompleted) { dismissIntro(); return; }
      bootChessApp(true).catch(() => null);
    });

    elBtnRetryBoot?.addEventListener('click', () => { bootChessApp(true).catch(() => null); });


    function resolveAccountLevel(profile = {}) {
      const value = Number(profile?.accountLevel ?? profile?.progression?.accountLevel ?? profile?.level ?? 1);
      return Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
    }

    function resolveAccountLevelProgress(profile = {}) {
      const value = Number(profile?.progression?.accountLevelProgressPct ?? profile?.accountLevelProgressPct ?? 0);
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(100, value));
    }

    async function fetchAPI(endpoint, method = 'GET', body = null, attempt = 0) {
      return core.requestWithAuth(endpoint, { method, body, timeoutMs: 8000, retries: attempt === 0 ? 1 : 0 });
    }

    async function restoreChessSession(roomId, suppressError = false) {
      const safeRoomId = String(roomId || '').trim();
      if (!safeRoomId) return false;

      try {
        const snapshot = await fetchAPI(`/api/chess/state/${encodeURIComponent(safeRoomId)}?t=${Date.now()}`);
        const room = snapshot?.room;
        const amIPlayer = !!room && (room.host?.uid === userUid || room.guest?.uid === userUid);
        if (room && amIPlayer && (room.status === 'waiting' || room.status === 'playing')) {
          enterGame(room);
          clearPendingAutoJoin('chess', safeRoomId);
          return true;
        }
      } catch (_) {}

      try {
        const joined = await fetchAPI('/api/chess/join', 'POST', { roomId: safeRoomId });
        if (joined?.room) {
          enterGame(joined.room);
          clearPendingAutoJoin('chess', safeRoomId);
          return true;
        }
      } catch (error) {
        if (!suppressError) showRealtimeToast('Odaya girilemedi', error.message || 'Satranç odasına bağlanılamadı.', 'error');
      }

      clearPendingAutoJoin('chess', safeRoomId);
      try { localStorage.removeItem('activeChessRoom'); } catch (_) {}
      return false;
    }

    async function initApp() {
      userUid = auth.currentUser?.uid || userUid;
      if (!userUid) { const user = await resolveBootUser(6500); userUid = user.uid; }
      fetchBalance();
      wireLobbySearchUI();
      ensureRealtimeShell();
      await preparePollingSync();
      hydrateFriendCounts(true).catch(() => null);

      const preferredRoom = safeGetPendingAutoJoinRoom('chess', 'activeChessRoom');
      if (preferredRoom && await restoreChessSession(preferredRoom, true)) return;

      startLobbyPolling();
    }

    function wireLobbySearchUI(){
      const inp = document.getElementById("roomSearch");
      const btn = document.getElementById("clearSearchBtn");
      if(!inp || !btn) return;

      inp.addEventListener("input", () => {
        lobbySearchQuery = (inp.value || "").trim().toLowerCase();
        fetchLobby(); 
      });

      btn.addEventListener("click", () => {
        inp.value = "";
        lobbySearchQuery = "";
        inp.blur();
        fetchLobby();
      });
    }

    async function fetchBalance() {
      try { 
        const res = await fetchAPI('/api/me'); 
        if (!(res && res.ok)) return;

        try { window.__PM_GAME_ACCOUNT_SYNC__?.apply?.(res); } catch (_) {}
        const balanceEl = document.getElementById("ui-balance") || document.getElementById("uiBalance");
        if (balanceEl) balanceEl.innerText = Number(res.balance || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});

        const profile = (res && typeof res.user === 'object' && res.user) ? res.user : {};
        const accountLevel = Math.max(1, Number(profile.accountLevel) || 1);
        const accountProgress = Math.max(0, Math.min(100, Number(profile?.progression?.accountLevelProgressPct) || 0));

        const levelBarEl = document.getElementById('uiAccountLevelBar');
        const levelPctEl = document.getElementById('uiAccountLevelPct');
        const levelBadgeEl = document.getElementById('uiAccountLevelBadge');

        if (levelBarEl) levelBarEl.style.width = accountProgress + '%';
        if (levelPctEl) levelPctEl.innerText = accountProgress.toFixed(1) + '%';
        if (levelBadgeEl) levelBadgeEl.innerText = accountLevel;
      } catch(e){}
    }

    function startLobbyPolling() {
      clearInterval(pollingInterval);
      fetchLobby(true).catch(() => null);
      pollingInterval = setInterval(() => { if (!document.hidden) fetchLobby(false).catch(() => null); }, 3500);
    }

    function roomMatchesSearch(r){
      if(!lobbySearchQuery) return true;
      const hostName = (r.host || "").toString().toLowerCase();
      const guestName = (r.guest || "").toString().toLowerCase();
      return hostName.includes(lobbySearchQuery) || guestName.includes(lobbySearchQuery);
    }

    async function fetchLobby(initial = false) {
      if (currentRoomId) return;
      try {
        const res = await fetchAPI('/api/chess/lobby?t=' + Date.now());
        const list = document.getElementById("roomList");
        list.innerHTML = "";
        const rooms = Array.isArray(res?.rooms) ? res.rooms : [];
        showLobbyNotice('');

        if (!rooms.length) {
          list.innerHTML = `<div class="pm-chess-empty">Aktif oda bulunamadı. Yeni oda kurun!</div>`;
          return;
        }

        const filtered = rooms.filter(roomMatchesSearch);

        if (!filtered.length) {
          list.innerHTML = `<div class="pm-chess-empty">Aramaya uygun oda bulunamadı.</div>`;
          return;
        }

        const html = filtered.map((r) => {
          const isMe = r.hostUid === userUid;
          const p1 = escapeHTML(r.host);
          const p2 = r.guest === 'Bilinmeyen' ? '?' : escapeHTML(r.guest);
          let statusText = '';
          let btnHtml = '';
          if (r.status === 'waiting') {
            statusText = '<span class="pm-chess-status-waiting"><i class="fa-solid fa-clock"></i> Rakip Bekleniyor</span>';
            btnHtml = isMe ? '<button class="btn-join btn-disabled" disabled>SENİN ODAN</button>' : '<button class="btn-join" data-room-id="' + escapeHTML(r.id) + '">KATIL</button>';
          } else if (r.status === 'playing') {
            statusText = '<span class="pm-chess-status-playing"><i class="fa-solid fa-fire"></i> Maç Devam Ediyor</span>';
            btnHtml = '<button class="btn-join btn-disabled" disabled>DOLU</button>';
          }
          return [
            '<div class="room-card">',
              '<div class="room-vs-area">',
                '<div class="player-name">' + p1 + '</div>',
                '<div class="vs-badge">VS</div>',
                '<div class="player-name">' + p2 + '</div>',
              '</div>',
              '<div class="room-footer">',
                '<div class="room-status">' + statusText + '</div>',
                btnHtml,
              '</div>',
            '</div>'
          ].join('');
        }).join('');
        list.innerHTML = html;
      } catch(error) {
        if (initial) {
          const list = document.getElementById('roomList');
          if (list) list.innerHTML = `<div class="pm-chess-empty pm-chess-empty-error">Odalar yüklenemedi.</div>`;
        }
        showLobbyNotice('Satranç lobisi yüklenemedi. Bağlantını kontrol edip tekrar deneyebilirsin.', 'error', 'Tekrar Dene', () => fetchLobby(true).catch(() => null));
        throw error;
      }
    }

    window.createRoom = async () => {
      try { const res = await fetchAPI('/api/chess/create', 'POST'); try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {} enterGame(res.room); }
      catch(e) { showMatrixModal("Hata", e.message, "error"); }
    };

    window.joinRoom = async (id) => {
      try { const res = await fetchAPI('/api/chess/join', 'POST', id ? {roomId: id} : {}); try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {} enterGame(res.room); }
      catch(e) { showMatrixModal("Hata", e.message, "error"); }
    };

    function startGamePing() {
      pingInterval = setInterval(async () => {
        if (!currentRoomId) return;
        try {
          const res = await fetchAPI('/api/chess/ping', 'POST', { roomId: currentRoomId });
          if (res && res.room && res.room.status === 'abandoned') {
            clearInterval(pollingInterval);
            clearInterval(pingInterval);
            showMatrixModal("OYUN İPTAL", res.room.message, "error", true);
          }
        } catch(e) {}
      }, 5000);
    }

    function enterGame(roomData) {
      clearInterval(pollingInterval);
      currentRoomId = roomData.id;
      isProcessingMove = false;
      localStorage.setItem('activeChessRoom', String(roomData.id || ''));
      clearPendingAutoJoin('chess', roomData.id);
      document.getElementById("lobbyArea").style.display = "none";
      document.getElementById("gameArea").style.display = "flex";
      showLobbyNotice('');
      showGameNotice('Oyun verisi hazırlanıyor...', 'warning');

      myColor = roomData.host.uid === userUid ? 'w' : 'b';

      document.getElementById("myColorBox").style.background = myColor === 'w' ? '#fff' : '#000';
      document.getElementById("oppColorBox").style.background = myColor === 'w' ? '#000' : '#fff';

      playSfx('start');
      syncBoardUI(roomData);
      pollingInterval = setInterval(pollGameState, 1500);
      startGamePing();
    }

    async function pollGameState() {
      if (!currentRoomId || isProcessingMove) return;
      try {
        const res = await fetchAPI(`/api/chess/state/${currentRoomId}?t=${Date.now()}`);
        if(res.room.status === 'abandoned') {
          clearInterval(pollingInterval);
          clearInterval(pingInterval);
          showMatrixModal("OYUN İPTAL", "Rakip odadan ayrıldı.", "error", true);
          return;
        }
        syncBoardUI(res.room);
        showGameNotice('');
      } catch(e) {
        if (e.message === "Oda bulunamadı.") {
          clearInterval(pollingInterval);
          clearInterval(pingInterval);
          showMatrixModal("BİLGİ", "Oda kapandı veya oyun sona erdi.", "info", true);
        } else {
          showGameNotice('Oyun durumu güncellenemedi. Tekrar deneniyor.', 'warning', 'Lobiye Dön', () => { try { localStorage.removeItem('activeChessRoom'); } catch (_) {} window.location.reload(); });
        }
      }
    }


    const INLINE_DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%20role%3D%27img%27%20aria-label%3D%27PlayMatrix%20Avatar%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27pmg%27%20x1%3D%270%27%20x2%3D%271%27%20y1%3D%270%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%25%27%20stop-color%3D%27%23111827%27%2F%3E%3Cstop%20offset%3D%27100%25%27%20stop-color%3D%27%231f2937%27%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27url%28%23pmg%29%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%20fill-opacity%3D%27.94%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%20fill-opacity%3D%27.92%27%2F%3E%3Ctext%20x%3D%2764%27%20y%3D%27118%27%20text-anchor%3D%27middle%27%20font-family%3D%27Inter%2CArial%2Csans-serif%27%20font-size%3D%2716%27%20font-weight%3D%27700%27%20fill%3D%27%23f9fafb%27%3EPM%3C%2Ftext%3E%3C%2Fsvg%3E';
    const DEFAULT_AVATAR = window.PMAvatar?.FALLBACK_AVATAR || INLINE_DEFAULT_AVATAR;

    function resolveFrameIndex(rawLevel) {
      if (window.PMAvatar && typeof window.PMAvatar.getFrameAssetIndex === 'function') {
        return window.PMAvatar.getFrameAssetIndex(rawLevel);
      }
      const lvl = Math.max(0, Math.min(100, Math.floor(Number(rawLevel) || 0)));
      if (lvl <= 0) return 0;
      if (lvl <= 15) return 1;
      if (lvl <= 30) return 2;
      if (lvl <= 40) return 3;
      if (lvl <= 50) return 4;
      if (lvl <= 60) return 5;
      if (lvl <= 80) return 6;
      if (lvl <= 85) return 7;
      if (lvl <= 90) return 8;
      return Math.min(18, Math.max(9, lvl - 82));
    }

    function applyFramedAvatar(avatarId, frameId, avatarUrl, selectedFrameLevel) {
      const host = document.getElementById(`${avatarId}Host`) || document.getElementById(avatarId)?.parentElement;
      if (window.PMAvatar && host) {
        const sizePx = Math.max(34, Number(host.clientWidth || 38));
        const node = window.PMAvatar.createNode({
          avatarUrl,
          level: selectedFrameLevel,
          sizePx,
          extraClass: 'pm-game-avatar-shell',
          imageClass: 'p-avatar',
          wrapperClass: 'pm-avatar',
          sizeTag: 'main',
          alt: 'Oyuncu avatarı'
        });
        host.replaceChildren(node);
        return;
      }
      const avatarEl = document.getElementById(avatarId);
      const frameEl = document.getElementById(frameId);
      if (!avatarEl || !frameEl) return;
      avatarEl.src = avatarUrl || DEFAULT_AVATAR;
      const frameIndex = resolveFrameIndex(selectedFrameLevel);
      if (frameIndex <= 0) {
        frameEl.hidden = true;
        frameEl.removeAttribute('src');
        return;
      }
      frameEl.hidden = false;
      frameEl.src = `/public/assets/frames/frame-${frameIndex}.png`;
      frameEl.dataset.fallback = `/public/assets/frames/frame-${frameIndex}.png`;
    }

    function syncBoardUI(r) {
      if (!r) return;
      currentRoomState = r;
      const isHost = r.host.uid === userUid;
      const me = isHost ? r.host : (r.guest || {username:'Sen'});
      const opp = isHost ? (r.guest || {username:'Bekleniyor...'}) : r.host;

      document.getElementById("myName").innerText = me.username;
      applyFramedAvatar("myAvatar", "myAvatarFrame", me.avatar, me.selectedFrame);
      document.getElementById("myPlate").className = (r.turn === myColor) ? "player-plate active" : "player-plate";

      document.getElementById("oppName").innerText = opp.username;
      applyFramedAvatar("oppAvatar", "oppAvatarFrame", opp.avatar, opp.selectedFrame);
      document.getElementById("oppPlate").className = (r.turn !== myColor && r.status === 'playing') ? "player-plate active" : "player-plate";

      const statusTxt = document.getElementById("gameStatusTxt");
      if (r.status === 'waiting') {
        statusTxt.innerText = "RAKİP BEKLENİYOR...";
        statusTxt.style.color = "rgba(148,163,184,.95)";
      } else if (r.status === 'playing') {
        const myTurn = r.turn === myColor;
        statusTxt.innerText = myTurn ? "SIRA SENDE" : "SIRA RAKİPTE";
        statusTxt.style.color = myTurn ? "#00ffa3" : "#f1c40f";
      } else if (r.status === 'finished') {
        clearInterval(pollingInterval);
        clearInterval(pingInterval);

        statusTxt.innerText = "OYUN BİTTİ";
        statusTxt.style.color = "#ff3b30";
        if (r.resultSummary) {
          if (r.resultSummary.outcome === 'win') playSfx('win');
          else if (r.resultSummary.outcome === 'loss') playSfx('end');
          showGameResultSummary(r.resultSummary, 'Satranç Sonucu', 'Oyun sonucu işlendi.', 'info');
        } else if(r.winner === 'draw') {
          showGameResultSummary({ gameType: 'chess', resultCode: 'draw', settledAt: Date.now(), outcome: 'draw', title: 'BERABERE', message: 'Oyun berabere bitti.' }, 'BERABERE', 'Oyun berabere bitti.', 'info');
        } else {
          const iWon = (r.winner === 'white' && myColor === 'w') || (r.winner === 'black' && myColor === 'b');
          if (iWon) { playSfx('win'); showGameResultSummary({ gameType: 'chess', resultCode: 'win', settledAt: Date.now(), outcome: 'win', title: 'KAZANDIN!', message: 'Galibiyet ve ödül işlemleri işlendi.' }, 'KAZANDIN!', 'Galibiyet ve ödül işlemleri işlendi.', 'success'); }
          else { playSfx('end'); showGameResultSummary({ gameType: 'chess', resultCode: 'loss', settledAt: Date.now(), outcome: 'loss', title: 'KAYBETTİN', message: 'Rakip kazandı veya sen teslim oldun.' }, 'KAYBETTİN', 'Rakip kazandı veya sen teslim oldun.', 'error'); }
        }
        return;
      }

      if (r.fen !== lastFen || r.status !== lastStatus) {
        gameLogic.load(r.fen);
        drawBoard();

        if (lastFen !== "" && r.fen !== lastFen) {
          if (gameLogic.in_check()) playSfx('check');
          else if (r.fen.length < lastFen.length) playSfx('capture');
          else playSfx('move');
        }
        lastFen = r.fen;
        lastStatus = r.status;
      }
    }

    function drawBoard() {
      const boardEl = document.getElementById("chessboard");
      boardEl.innerHTML = "";

      let board = gameLogic.board();
      if (myColor === 'b') {
        board = board.slice().reverse();
        board = board.map(row => row.slice().reverse());
      }

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sqDiv = document.createElement("div");

          let rank = myColor === 'w' ? 8 - r : r + 1;
          let fileStr = "abcdefgh";
          let file = myColor === 'w' ? fileStr[c] : fileStr[7 - c];
          let sqName = file + rank;

          sqDiv.className = `sq ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
          sqDiv.dataset.sq = sqName;

          if (selectedSq === sqName) sqDiv.classList.add('highlight');

          const isMoveObj = validMovesForSelected.find(m => m.to === sqName);
          if (isMoveObj) {
            if(board[r][c] !== null) sqDiv.classList.add('valid-capture');
            else sqDiv.classList.add('valid-move');
          }

          const piece = board[r][c];
          if (piece) {
            const char = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
            const img = document.createElement("img");
            img.src = PIECE_IMGS[char];
            img.className = "piece";
            sqDiv.appendChild(img);
          }

          sqDiv.addEventListener('click', () => handleSquareClick(sqName));
          boardEl.appendChild(sqDiv);
        }
      }
    }

    async function handleSquareClick(sq) {
      if (isProcessingMove || gameLogic.turn() !== myColor) return;

      const moveObj = validMovesForSelected.find(m => m.to === sq);
      if (selectedSq && moveObj) {
        isProcessingMove = true;
        document.getElementById("gameStatusTxt").innerText = "HAMLE İLETİLİYOR...";

        const m = gameLogic.move({ from: moveObj.from, to: moveObj.to, promotion: 'q' });
        selectedSq = null;
        validMovesForSelected = [];
        drawBoard();

        if (gameLogic.in_check()) playSfx('check');
        else if (m && m.captured) playSfx('capture');
        else playSfx('move');

        try {
          const res = await fetchAPI('/api/chess/move', 'POST', { roomId: currentRoomId, from: moveObj.from, to: moveObj.to, promotion: 'q', expectedStateVersion: currentRoomState?.stateVersion || 0, clientMoveId: `${currentRoomId}:${currentRoomState?.stateVersion || 0}:${moveObj.from}-${moveObj.to}` });
          try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {}
          lastFen = res.room.fen;
          syncBoardUI(res.room);
        } catch(e) {
          showMatrixModal("Hata", e.message, "error");
          gameLogic.load(lastFen);
          drawBoard();
        }

        isProcessingMove = false;
        return;
      }

      const pieceObj = gameLogic.get(sq);
      if (pieceObj && pieceObj.color === myColor) {
        selectedSq = sq;
        validMovesForSelected = gameLogic.moves({ square: sq, verbose: true });
        drawBoard();
      } else {
        selectedSq = null;
        validMovesForSelected = [];
        drawBoard();
      }
    }

    window.resignGame = () => {
      showConfirmModal("Teslim Ol", "Teslim olmak istediğinize emin misiniz? (Rakibe galibiyet işlenir)", async () => {
        try { const res = await fetchAPI('/api/chess/resign', 'POST', { roomId: currentRoomId }); try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.(res); } catch (_) {} } catch(e) {}
      });
    };

    window.addEventListener('beforeunload', () => {
      if (!currentRoomId || !auth.currentUser) return;
      auth.currentUser.getIdToken().then((token) => {
        fetch(`${API_URL}/api/chess/leave`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: currentRoomId, reason: 'unload' }),
          keepalive: true
        }).catch(() => null);
      }).catch(() => null);
    });

    onAuthStateChanged(user => {
      if (!user) {
        bootCompleted = false;
        setBootProgress(10);
        setBootStatus('Oturum doğrulanıyor...');
        setBootActions({ showEnter: false, showRetry: false });
        return;
      }
      if (!bootCompleted && !bootPromise) bootChessApp(false).catch(() => null);
    });

    window.addEventListener('load', () => {
      setBootProgress(4);
      setBootStatus('Kaynaklar hazırlanıyor...');
      setBootActions({ showEnter: false, showRetry: false });
      setTimeout(() => { if (!bootCompleted && !bootPromise) bootChessApp(false).catch(() => null); }, 120);
    });



window.addEventListener('error',e=>{try{fetch('/api/client/error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game:document.body.dataset.game,type:'error',message:e.message,source:e.filename,line:e.lineno})})}catch{}});

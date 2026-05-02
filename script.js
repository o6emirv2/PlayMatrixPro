(() => {
  const state = { token: localStorage.getItem('pm_token') || '', user: null, profile: null, socket: null, runtime: null };
  const games = [
    { id: 'chess', name: 'Satranç', desc: 'Backend doğrulamalı sıra sistemi ve hızlı eşleşme.', path: '/games/chess/', quick: true },
    { id: 'pisti', name: 'Pişti', desc: 'In-memory oda, backend kart dağıtımı ve Pişti hızlı eşleşme.', path: '/games/pisti/', quick: true },
    { id: 'crash', name: 'Crash', desc: 'Client-side para manipülasyonuna kapalı cashout akışı.', path: '/games/crash/', quick: false }
  ];
  const $ = (selector) => document.querySelector(selector);
  const api = (path, options = {}) => fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) }
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP_${res.status}`);
    return data;
  });

  function shownKey() { return `pm_shown_notifications:${state.user?.uid || 'guest'}`; }
  function readShown() { try { return new Set(JSON.parse(localStorage.getItem(shownKey()) || '[]')); } catch { return new Set(); } }
  function writeShown(set) { localStorage.setItem(shownKey(), JSON.stringify(Array.from(set).slice(-300))); }
  function showToast(notification) {
    if (!notification?.id) return false;
    const shown = readShown();
    if (shown.has(notification.id)) return false;
    shown.add(notification.id); writeShown(shown);
    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = `<strong>${escapeHtml(notification.title || 'Bildirim')}</strong><span>${escapeHtml(notification.message || '')}</span>`;
    $('#toastStack').appendChild(node);
    setTimeout(() => node.remove(), 5200);
    if (state.token && notification.critical) api('/api/notifications/ack', { method: 'POST', body: JSON.stringify({ ids: [notification.id] }) }).catch(reportError);
    return true;
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function setStatus(node, text, type = '') { node.textContent = text; node.className = `status ${type}`; }

  async function init() {
    state.runtime = await api('/api/runtime-config').then((r) => r.config).catch(() => null);
    renderGames();
    bindUi();
    if (state.token) await loadSession().catch(() => logout(false));
    renderProfile();
    connectSocket();
    setInterval(pollNotifications, 30000);
  }

  function bindUi() {
    $('#loginForm').addEventListener('submit', login);
    $('#authButton').addEventListener('click', () => state.token ? logout(true) : $('#authPanel').scrollIntoView({ behavior: 'smooth' }));
    $('#modalClose').addEventListener('click', () => $('#modalRoot').close());
    document.querySelectorAll('[data-open-modal]').forEach((button) => button.addEventListener('click', () => openModal(button.dataset.openModal)));
    $('#demoNotificationButton').addEventListener('click', async () => {
      if (!state.token) return showToast({ id: 'guest:login-required', title: 'Giriş gerekli', message: 'Bildirim testi için giriş yapmalısın.' });
      const data = await api('/api/notifications/demo', { method: 'POST', body: '{}' });
      showToast(data.notification);
    });
    window.addEventListener('error', (event) => reportError(event.error || event.message));
    window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
  }

  async function login(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      state.token = data.token; localStorage.setItem('pm_token', state.token);
      await loadSession();
      connectSocket(true);
      showToast({ id: `login:${state.user.uid}:${new Date().toISOString().slice(0,10)}`, title: 'Oturum açıldı', message: 'PlayMatrix hesabın yüklendi.' });
    } catch (error) { showToast({ id: `login-error:${Date.now()}`, title: 'Giriş başarısız', message: error.message }); }
  }

  async function loadSession() {
    const session = await api('/api/auth/session');
    state.user = session.user;
    const me = await api('/api/user/me');
    state.profile = me.profile;
    renderProfile();
    await pollNotifications();
  }

  function logout(notify) {
    state.token = ''; state.user = null; state.profile = null;
    localStorage.removeItem('pm_token');
    if (state.socket) state.socket.disconnect();
    renderProfile();
    if (notify) showToast({ id: `logout:${Date.now()}`, title: 'Çıkış yapıldı', message: 'Oturum kapatıldı.' });
  }

  function renderProfile() {
    const profile = state.profile;
    $('#authButton').textContent = state.token ? 'Çıkış Yap' : 'Giriş Yap';
    $('#profileName').textContent = profile?.displayName || state.user?.name || 'Misafir';
    $('#profileEmail').textContent = profile?.email || state.user?.email || 'Giriş yapılmadı';
    $('#balanceLabel').textContent = `${Number(profile?.balance || 0).toLocaleString('tr-TR')} MC`;
    const prog = profile?.progression || { level: 1, progressPercent: 0 };
    $('#levelLabel').textContent = `Seviye ${prog.level}`;
    $('#levelProgress').style.width = `${prog.progressPercent || 0}%`;
    $('[data-avatar-img]').src = `/public/assets/avatars/${profile?.avatarId || 'avatar-1'}.svg`;
    $('[data-frame-img]').src = `/public/assets/frames/frame-${profile?.selectedFrame || 0}.svg`;
  }

  function renderGames() {
    $('#gameGrid').innerHTML = games.map((game) => `<article class="game-card card"><div><h3>${game.name}</h3><p>${game.desc}</p></div><div class="game-actions"><a class="primary link" href="${game.path}">Oyuna Gir</a>${game.quick ? `<button class="ghost" data-quick="${game.id}">Hızlı Eşleş</button>` : ''}</div></article>`).join('');
    document.querySelectorAll('[data-quick]').forEach((button) => button.addEventListener('click', () => quickMatch(button.dataset.quick)));
  }

  function connectSocket(force = false) {
    if (!state.token || typeof io === 'undefined') return;
    if (state.socket && !force) return;
    if (state.socket) state.socket.disconnect();
    state.socket = io({ auth: { token: state.token }, transports: ['websocket', 'polling'] });
    state.socket.on('connect_error', (error) => showToast({ id: `socket-error:${Date.now()}`, title: 'Socket hatası', message: error.message }));
    state.socket.on('quick-match:queued', (data) => showToast({ id: `queue:${state.user.uid}:${data.game}:${Date.now()}`, title: 'Eşleşme aranıyor', message: `${data.game} kuyruğuna alındın.` }));
    state.socket.on('quick-match:found', (data) => { showToast({ id: `match:${data.roomId}`, title: 'Rakip bulundu', message: 'Odaya yönlendiriliyorsun.' }); setTimeout(() => location.href = data.path, 600); });
    state.socket.on('quick-match:error', (data) => showToast({ id: `qm-error:${Date.now()}`, title: 'Hızlı eşleşme hatası', message: data.error || 'İşlem başarısız.' }));
  }

  function quickMatch(game) {
    if (!state.token) return showToast({ id: 'quick-match-login-required', title: 'Giriş gerekli', message: 'Hızlı eşleşme için giriş yapmalısın.' });
    connectSocket();
    state.socket.emit('quick-match:join', { game, bet: 0, mode: 'classic' });
  }

  async function pollNotifications() {
    if (!state.token) return;
    const data = await api('/api/notifications').catch(() => ({ notifications: [] }));
    for (const notification of data.notifications || []) showToast(notification);
  }

  function openModal(type) {
    const content = $('#modalContent');
    if (type === 'notifications') {
      content.innerHTML = `<h2>Bildirimler</h2><p>Gösterilen kritik bildirimler kullanıcı bazlı anahtarla işaretlenir. Aynı notificationId ikinci kez gösterilmez.</p><div class="modal-grid"><button class="primary" id="modalDemoNotification">Test bildirimi üret</button></div>`;
      setTimeout(() => $('#modalDemoNotification')?.addEventListener('click', () => $('#demoNotificationButton').click()), 0);
    } else if (type === 'avatar') {
      const owned = new Set(state.profile?.ownedFrames || [0]);
      content.innerHTML = `<h2>Avatar ve Çerçeve</h2><p>Kilitli çerçeveler pasiftir; seçili frame backend tarafından doğrulanır.</p><div class="avatar-grid">${[0,1,2,3,4,5].map((id) => `<button class="frame-option ${state.profile?.selectedFrame === id ? 'selected' : ''}" data-frame="${id}" ${owned.has(id) ? '' : 'disabled'}><div class="avatar-host"><img src="/public/assets/avatars/avatar-1.svg" alt=""><img src="/public/assets/frames/frame-${id}.svg" alt=""></div><small>${owned.has(id) ? `Frame ${id}` : `Kilitli • Lv ${id * 10}`}</small></button>`).join('')}</div><div class="status" id="avatarStatus"></div>`;
      setTimeout(() => document.querySelectorAll('[data-frame]').forEach((button) => button.addEventListener('click', () => saveAvatar(Number(button.dataset.frame)))), 0);
    } else {
      content.innerHTML = `<h2>E-posta Adresini Güncelle</h2><p>Firebase Auth ve Firestore profil e-postası aynı işlem içinde senkronize edilir.</p><form class="modal-grid" id="emailForm"><label>Yeni e-posta<input name="newEmail" type="email" required></label><label>Mevcut şifre<input name="currentPassword" type="password" required minlength="6"></label><button class="primary" type="submit">E-postayı Güncelle</button><div class="status" id="emailStatus"></div></form>`;
      setTimeout(() => $('#emailForm')?.addEventListener('submit', updateEmail), 0);
    }
    $('#modalRoot').showModal();
  }

  async function saveAvatar(frame) {
    const status = $('#avatarStatus');
    try {
      const data = await api('/api/user/profile/avatar', { method: 'POST', body: JSON.stringify({ avatarId: 'avatar-1', selectedFrame: frame }) });
      state.profile = { ...state.profile, avatarId: data.avatarId, selectedFrame: data.selectedFrame };
      renderProfile();
      setStatus(status, 'Avatar/çerçeve kaydedildi.', 'success');
    } catch (error) { setStatus(status, error.message, 'error'); }
  }

  async function updateEmail(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = $('#emailStatus');
    setStatus(status, 'Güncelleniyor...');
    try {
      const data = await api('/api/auth/update-email', { method: 'POST', body: JSON.stringify({ newEmail: form.get('newEmail'), currentPassword: form.get('currentPassword') }) });
      if (data.token) { state.token = data.token; localStorage.setItem('pm_token', data.token); }
      await loadSession();
      setStatus(status, 'E-posta başarıyla güncellendi.', 'success');
    } catch (error) { setStatus(status, error.message, 'error'); }
  }

  function reportError(error) {
    const payload = { message: error?.message || String(error), stack: error?.stack || '', path: location.pathname };
    fetch('/api/report/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
  }

  init().catch(reportError);
})();

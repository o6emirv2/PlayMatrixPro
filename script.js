'use strict';

const state = {
  token: localStorage.getItem('pm_token') || '',
  user: null,
  config: null,
  selectedFrame: 1,
  games: [
    { id: 'pisti', name: 'Pişti', desc: 'Backend kart dağıtımı, hızlı eşleşme ve doğrulamalı kazanç.', href: '/games/pisti/', accent: 'Kart' },
    { id: 'chess', name: 'Satranç', desc: 'In-memory oda, hızlı eşleşme ve server taraflı hamle doğrulama.', href: '/games/chess/', accent: 'Strateji' },
    { id: 'crash', name: 'Crash', desc: 'Server seed, backend payout ve idempotent bakiye hareketi.', href: '/games/crash/', accent: 'Risk' }
  ]
};

const $ = (selector) => document.querySelector(selector);
const toastRegion = $('#toastRegion');

function getShownKey() {
  return `pm_shown_notifications_${state.user ? state.user.uid : 'guest'}`;
}

function getShownSet() {
  try { return new Set(JSON.parse(localStorage.getItem(getShownKey()) || '[]')); }
  catch (_) { return new Set(); }
}

function saveShownSet(set) {
  localStorage.setItem(getShownKey(), JSON.stringify([...set].slice(-500)));
}

async function api(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || 'İstek başarısız.');
  return data;
}

function toast(notification) {
  if (!notification || !notification.notificationId) return;
  const shown = getShownSet();
  if (shown.has(notification.notificationId)) return;
  shown.add(notification.notificationId);
  saveShownSet(shown);

  const node = document.createElement('article');
  node.className = `toast ${notification.severity || 'info'}`;
  node.innerHTML = `<strong>${notification.title || 'Bildirim'}</strong><span>${notification.message || ''}</span>`;
  toastRegion.appendChild(node);
  setTimeout(() => node.remove(), 5200);

  if (state.token) {
    api('/api/notifications/mark-shown', {
      method: 'POST',
      body: {
        notificationId: notification.notificationId,
        persistent: Boolean(notification.persistent),
        type: notification.type,
        source: notification.source,
        rewardId: notification.rewardId
      }
    }).catch(() => {});
  }
}

function updateProfileUI() {
  const user = state.user;
  $('#openAuthBtn').classList.toggle('hidden', Boolean(user));
  $('#logoutBtn').classList.toggle('hidden', !user);
  $('#profileName').textContent = user ? user.displayName : 'Misafir Oyuncu';
  $('#profileEmail').textContent = user ? user.email : 'Giriş yapılmadı';
  $('#avatarImage').src = user ? user.avatarUrl : '/public/assets/avatars/fallback.svg';
  const frame = user ? Number(user.selectedFrame || 1) : 1;
  $('#avatarFrame').src = `/public/assets/frames/frame-${frame}.png`;
  $('#levelLabel').textContent = `Level ${user ? user.level : 1}`;
  $('#xpLabel').textContent = `${user ? user.xp : 0} XP`;
  $('#levelProgress').style.width = `${user && user.progressPercent ? user.progressPercent : 0}%`;
  $('#balanceLabel').textContent = `${user ? Number(user.balance || 0).toLocaleString('tr-TR') : 0} MC`;
}

function renderGames() {
  $('#gameGrid').innerHTML = state.games.map((game) => `
    <a class="game-card" href="${game.href}">
      <span class="game-accent">${game.accent}</span>
      <h3>${game.name}</h3>
      <p>${game.desc}</p>
      <strong>Oyuna Gir →</strong>
    </a>
  `).join('');
}

function renderFramePicker() {
  const user = state.user || { unlockedFrames: [1], selectedFrame: 1 };
  const unlocked = new Set(user.unlockedFrames || [1]);
  const html = Array.from({ length: 18 }, (_, i) => i + 1).map((frame) => {
    const locked = !unlocked.has(frame);
    const selected = Number(user.selectedFrame || 1) === frame;
    return `
      <button type="button" class="frame-option ${selected ? 'selected' : ''}" data-frame="${frame}" ${locked ? 'disabled aria-disabled="true"' : ''}>
        <span class="avatar-stack compact">
          <img class="avatar-image" src="/public/assets/avatars/fallback.svg" alt="">
          <img class="avatar-frame" src="/public/assets/frames/frame-${frame}.png" alt="">
        </span>
        <small>${locked ? 'Kilitli' : selected ? 'Seçili' : 'Kullan'}</small>
      </button>
    `;
  }).join('');
  $('#framePicker').innerHTML = html;
  document.querySelectorAll('.frame-option:not(:disabled)').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const selectedFrame = Number(button.dataset.frame);
        const data = await api('/api/user/profile/avatar-frame', { method: 'POST', body: { selectedFrame } });
        state.user = data.user;
        updateProfileUI();
        renderFramePicker();
        toast({ notificationId: `frame_${selectedFrame}_${state.user.uid}`, title: 'Çerçeve güncellendi', message: 'Profil çerçeven güvenli şekilde kaydedildi.', severity: 'success' });
      } catch (err) {
        toast({ notificationId: `frame_error_${Date.now()}`, title: 'Çerçeve güncellenemedi', message: err.message, severity: 'danger' });
      }
    });
  });
}

async function loadNotifications() {
  const list = $('#notificationList');
  list.innerHTML = '<p class="muted">Bildirimler yükleniyor...</p>';
  try {
    const data = await api('/api/notifications');
    if (!data.notifications.length) {
      list.innerHTML = '<p class="muted">Yeni bildirim yok. Önceden gösterilen bildirimler tekrar düşmez.</p>';
      return;
    }
    list.innerHTML = data.notifications.map((item) => `<article class="notification-item"><strong>${item.title}</strong><span>${item.message}</span></article>`).join('');
    data.notifications.forEach(toast);
  } catch (err) {
    list.innerHTML = `<p class="form-message danger">${err.message}</p>`;
  }
}

async function loadMe() {
  if (!state.token) {
    updateProfileUI();
    return;
  }
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    updateProfileUI();
    renderFramePicker();
    await loadNotifications();
  } catch (_) {
    localStorage.removeItem('pm_token');
    state.token = '';
    state.user = null;
    updateProfileUI();
  }
}

async function submitLogin(event) {
  event.preventDefault();
  $('#authMessage').textContent = '';
  try {
    const data = await api('/api/auth/sign-in', {
      method: 'POST',
      body: { email: $('#authEmail').value, password: $('#authPassword').value }
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('pm_token', state.token);
    $('#authModal').close();
    updateProfileUI();
    renderFramePicker();
    toast({ notificationId: `login_${state.user.uid}`, title: 'Giriş başarılı', message: 'Oturum açıldı.', severity: 'success' });
  } catch (err) {
    $('#authMessage').textContent = err.message;
  }
}

async function submitRegister() {
  $('#authMessage').textContent = '';
  try {
    await api('/api/auth/sign-up', {
      method: 'POST',
      body: { email: $('#authEmail').value, password: $('#authPassword').value, displayName: $('#authDisplayName').value }
    });
    $('#authMessage').textContent = 'Kayıt oluşturuldu. Şimdi giriş yapabilirsiniz.';
  } catch (err) {
    $('#authMessage').textContent = err.message;
  }
}

async function demoLogin() {
  $('#authEmail').value = 'demo@playmatrix.local';
  $('#authPassword').value = 'demo-password';
  await submitLogin(new Event('submit'));
}

async function submitEmailUpdate(event) {
  event.preventDefault();
  $('#emailMessage').textContent = '';
  try {
    const data = await api('/api/auth/update-email', {
      method: 'POST',
      body: { newEmail: $('#newEmail').value, password: $('#emailPassword').value }
    });
    state.user = data.user;
    updateProfileUI();
    $('#emailMessage').textContent = data.message;
    toast({ notificationId: `email_updated_${state.user.uid}_${state.user.email}`, title: 'E-posta güncellendi', message: 'Auth ve profil e-posta bilgisi senkronlandı.', severity: 'success', persistent: true });
  } catch (err) {
    $('#emailMessage').textContent = err.message;
  }
}

async function bootstrap() {
  renderGames();
  updateProfileUI();
  try {
    state.config = await api('/api/auth/public-config', { headers: {} });
    $('#demoLoginBtn').classList.toggle('hidden', !state.config.app.demoAuthEnabled);
  } catch (_) {}
  await loadMe();

  $('#openAuthBtn').addEventListener('click', () => $('#authModal').showModal());
  $('#openProfileBtn').addEventListener('click', () => { renderFramePicker(); $('#profileModal').showModal(); });
  $('#openEmailModalBtn').addEventListener('click', () => $('#emailModal').showModal());
  $('#openNotificationsBtn').addEventListener('click', async () => { $('#notificationsModal').showModal(); await loadNotifications(); });
  $('#authForm').addEventListener('submit', submitLogin);
  $('#registerBtn').addEventListener('click', submitRegister);
  $('#demoLoginBtn').addEventListener('click', demoLogin);
  $('#emailForm').addEventListener('submit', submitEmailUpdate);
  $('#logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('pm_token');
    state.token = '';
    state.user = null;
    updateProfileUI();
    toast({ notificationId: `logout_${Date.now()}`, title: 'Çıkış yapıldı', message: 'Oturum kapatıldı.', severity: 'info' });
  });
}

bootstrap().catch((err) => toast({ notificationId: `boot_${Date.now()}`, title: 'Başlatma hatası', message: err.message, severity: 'danger' }));

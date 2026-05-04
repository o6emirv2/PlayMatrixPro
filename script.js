import { loadFirebaseWebConfig } from '/public/firebase-runtime.js';
import { AVATAR_CATEGORIES, DEFAULT_AVATAR, getSafeAvatarSrc } from '/public/data/avatar-catalog.js';
import { getAccountLevelProgressFromXp, formatXpExact } from '/public/data/progression-policy.js';

const ROUTES = Object.freeze({
  crash: '/games/crash',
  chess: '/games/chess',
  pisti: '/games/pisti',
  pattern: '/games/pattern-master',
  space: '/games/space-pro',
  snake: '/games/snake-pro'
});
const GAMES = Object.freeze([
  { key: 'crash', title: 'Crash', category: 'Online', icon: 'fa-bolt', route: ROUTES.crash, accent: 'rgba(255,194,26,.35)', desc: 'Gerçek zamanlı çarpan oyunu. Backend kontrollü bakiye ve XP akışı.' },
  { key: 'chess', title: 'Satranç', category: 'Online', icon: 'fa-chess-knight', route: ROUTES.chess, accent: 'rgba(103,216,255,.32)', desc: 'Bot, bahissiz ve bahisli oda desteğiyle strateji oyunu.' },
  { key: 'pisti', title: 'Pişti', category: 'Online', icon: 'fa-layer-group', route: ROUTES.pisti, accent: 'rgba(16,232,135,.3)', desc: '2 ve 4 kişilik online masa deneyimi.' },
  { key: 'pattern', title: 'Pattern Master', category: 'Klasik', icon: 'fa-brain', route: ROUTES.pattern, accent: 'rgba(123,97,255,.34)', desc: 'Skor odaklı hafıza ve refleks oyunu.' },
  { key: 'space', title: 'Space Pro', category: 'Klasik', icon: 'fa-rocket', route: ROUTES.space, accent: 'rgba(74,144,255,.3)', desc: 'Uzay temalı tek oyunculu beceri modu.' },
  { key: 'snake', title: 'Snake Pro', category: 'Klasik', icon: 'fa-staff-snake', route: ROUTES.snake, accent: 'rgba(16,232,135,.22)', desc: 'Klasik yılan oyununun PlayMatrix sürümü.' }
]);
const WHEEL_REWARDS = Object.freeze([10000, 20000, 25000, 45000, 65000, 90000, 120000, 1000000]);
const PROTECTED_MODAL_IDS = Object.freeze(['wheelModal','promoModal','inviteModal','supportModal','emailModal','avatarModal','frameModal','accountModal','notificationsModal','socialModal','betHistoryModal','sessionHistoryModal','accountStatsModal','playerStatsModal']);
const ONBOARDING_ALLOWED_MODAL_IDS = Object.freeze(['authModal','avatarModal','frameModal']);
const CHAT_POLICY = Object.freeze({
  lobbyLabel: 'Global 7 Gün',
  directLabel: 'DM 14 Gün',
  summaryLabel: 'Global 7 Gün · DM 14 Gün',
  disclosure: 'Yerel sohbet mesajları Render in-memory içinde geçici olarak saklanır; restart olursa silinir, en fazla 7 gün görünür. Silinen mesajların içeriği boş gösterilir; manuel silme ve saklama süresi temizliği ayrı etiketlenir.'
});
const $ = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const safeText = (value, fallback = '') => String(value ?? fallback).trim();
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));

const state = {
  firebase: null,
  auth: null,
  firebaseReady: false,
  user: null,
  token: '',
  profile: null,
  leaderboard: { level: [], activity: [] },
  leaderTab: 'level',
  heroIndex: 0,
  socialView: 'chat',
  socket: null,
  lobbyMessages: [],
  frameFilter: 'all',
  currentAvatarCategory: 'all',
  wheelRotation: 0,
  notificationUnread: 0
};

window.__PLAYMATRIX_ROUTES__ = ROUTES;
window.__PLAYMATRIX_API_BASE__ = window.__PLAYMATRIX_API_BASE__ || window.__PLAYMATRIX_API_URL__ || window.location.origin;

function apiBase() {
  const raw = window.__PM_API__?.getApiBaseSync?.() || window.__PLAYMATRIX_API_URL__ || window.__PLAYMATRIX_API_BASE__ || window.location.origin;
  return String(raw || '').replace(/\/+$/, '').replace(/\/api$/i, '');
}
function apiUrl(path) { return `${apiBase()}${String(path).startsWith('/') ? path : `/${path}`}`; }
async function apiFetch(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 7000);
  try {
    const response = await fetch(apiUrl(path), { ...options, headers, signal: controller.signal, credentials: 'omit' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.error || `HTTP_${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally { clearTimeout(timer); }
}
function reportHomeIssue(scope, error, extra = {}) {
  const message = safeText(error?.message || error || 'HOME_ERROR').slice(0, 400);
  if (/LOAD FAILED|FAILED TO FETCH|ABORT|AUTH_REQUIRED/i.test(message) && !/schema|undefined|contract/i.test(message)) return;
  try {
    navigator.sendBeacon?.(apiUrl('/api/client/error'), new Blob([JSON.stringify({ game: 'home', scope, message, source: extra.source || 'script.js', path: location.pathname, reason: extra.reason || 'AnaSayfa bileşeni beklenmeyen hata yakaladı.', solution: extra.solution || 'İlgili AnaSayfa bileşeni, veri sözleşmesi ve endpoint cevabı kontrol edilmeli.', severity: extra.severity || 'error', ...extra })], { type: 'application/json' }));
  } catch (_) {
    fetch(apiUrl('/api/client/error'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game:'home', scope, message, path: location.pathname, ...extra }), keepalive: true }).catch(() => {});
  }
}
function toast(title, message = '', type = 'info') {
  const stack = $('toastStack'); if (!stack) return;
  const item = document.createElement('div');
  item.className = `pm-toast pm-toast-${type}`;
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ''}`;
  stack.append(item);
  setTimeout(() => { item.style.opacity = '0'; item.style.transform = 'translateY(8px)'; setTimeout(() => item.remove(), 260); }, 3600);
}
function escapeHtml(value = '') { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function setText(id, value) { const el = $(id); if (el) el.textContent = value; }
function setHidden(id, hidden) { const el = $(id); if (el) el.hidden = !!hidden; }
function ensureAuth(action = 'Bu işlem') { if (state.user) return true; openAuth('login'); toast('Oturum gerekli', `${action} için giriş yapmalısın.`, 'warning'); return false; }

function fallbackProgress(profile = {}) {
  const progression = profile.progression && typeof profile.progression === 'object' ? profile.progression : null;
  if (progression) {
    return {
      level: Number(progression.level ?? progression.accountLevel ?? profile.level ?? profile.accountLevel ?? 1) || 1,
      xp: String(progression.xp ?? profile.xp ?? profile.accountXp ?? '0'),
      nextLevelXp: progression.nextLevelXp ?? progression.formattedNextLevelXp ?? '',
      progressPercent: clamp(progression.progressPercent ?? progression.accountLevelProgressPct ?? profile.progressPercent ?? profile.accountLevelProgressPct, 0, 100),
      formattedXp: progression.formattedXp || progression.accountXpLabel || formatXpExact(progression.xp ?? profile.xp ?? 0),
      formattedNextLevelXp: progression.formattedNextLevelXp || progression.accountLevelNextXpLabel || ''
    };
  }
  const local = getAccountLevelProgressFromXp(profile.xp ?? profile.accountXp ?? 0);
  return { level: local.accountLevel, xp: local.accountXpExact, progressPercent: local.accountLevelProgressPct, formattedXp: local.accountXpFullLabel, formattedNextLevelXp: local.accountLevelNextXpLabel };
}
function normalizeProfile(raw = {}) {
  const profile = raw.profile || raw.user || raw || {};
  const progress = fallbackProgress(profile);
  const username = safeText(profile.username || profile.displayName || profile.fullName || state.user?.displayName || state.user?.email?.split('@')[0], 'Oyuncu');
  const avatar = getSafeAvatarSrc(profile.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR);
  const selectedFrame = Math.max(0, Math.min(100, Math.trunc(Number(profile.selectedFrame || 0) || 0)));
  return { ...profile, username, avatar, selectedFrame, balance: Math.max(0, Number(profile.balance || profile.mc || 0) || 0), email: profile.email || state.user?.email || '', uid: profile.uid || state.user?.uid || '', progression: progress, level: progress.level, progressPercent: progress.progressPercent };
}
function renderAvatar(host, profile = {}, sizeClass = '') {
  if (!host) return;
  const avatar = getSafeAvatarSrc(profile.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR);
  const frame = Math.max(0, Math.min(100, Math.trunc(Number(profile.selectedFrame || 0) || 0)));
  host.className = `pm-avatar-composite ${sizeClass} ${frame ? 'has-frame' : ''}`.trim();
  host.dataset.pmAvatar = 'true';
  host.innerHTML = `<span class="pm-avatar-base"><img src="${escapeHtml(avatar)}" alt=""></span>${frame ? `<span class="pm-avatar-frame" style="background-image:url('/public/assets/frames/frame-${frame}.png')"></span>` : ''}`;
}
function renderPlainAvatar(host, profile = {}) {
  renderAvatar(host, profile, 'pm-avatar-header');
}
function isOnboardingComplete(profile = state.profile) {
  if (!state.user) return true;
  if (!profile) return false;
  return profile.onboardingComplete === true && !!profile.avatar && Number(profile.selectedFrame || 0) > 0;
}
function requireOnboarding(action = 'Bu işlem') {
  if (isOnboardingComplete()) return true;
  closeDrawer();
  renderAuth('setup');
  openModal('authModal', { bypassOnboarding: true });
  toast('Profil kurulumu gerekli', `${action} için önce avatar ve çerçeve seçimi tamamlanmalı.`, 'warning');
  return false;
}
function formatDate(value) {
  const n = Number(value || 0);
  if (!n) return '—';
  try { return new Intl.DateTimeFormat('tr-TR', { dateStyle:'short', timeStyle:'short' }).format(new Date(n)); } catch (_) { return '—'; }
}
function maskEmail(email = '') {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return email ? `${email.slice(0, 3)}******` : '—';
  return `${name.slice(0, 2)}******@${domain}`;
}
function maskPhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `${'*'.repeat(Math.max(4, digits.length - 3))}${digits.slice(-3)}` : '—';
}
function renderMiniCards(items = []) {
  if (!items.length) return '<div class="pm-empty-state pm-empty-state-compact"><i class="fa-solid fa-message-xmark"></i><p>Henüz bir kayıt bulunamadı.</p></div>';
  return items.map((item) => `<article class="pm-stat-card"><h3>${escapeHtml(item.title || item.game || item.type || 'Kayıt')}</h3><p>${escapeHtml(item.message || item.description || item.result || '')}</p><small>${escapeHtml(formatDate(item.at || item.createdAt || item.time))}</small></article>`).join('');
}

function openModal(id, options = {}) {
  if (PROTECTED_MODAL_IDS.includes(id) && !state.user) return openAuth('login');
  if (!options.bypassOnboarding && state.user && !ONBOARDING_ALLOWED_MODAL_IDS.includes(id) && !isOnboardingComplete()) return requireOnboarding('Bu işlem');
  const el = $(id); if (!el) return;
  qsa('.pm-modal.is-open').forEach((modal) => { if (modal.id !== id) closeModal(modal.id); });
  if (id === 'avatarModal') renderAvatarPicker();
  if (id === 'frameModal') renderFramePicker();
  if (id === 'accountModal') renderAccountModal();
  if (id === 'notificationsModal') loadNotifications();
  if (id === 'betHistoryModal') loadBetHistory();
  if (id === 'sessionHistoryModal') loadSessionHistory();
  if (id === 'accountStatsModal') loadAccountStats();
  if (id === 'socialModal') renderSocial();
  el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open');
}
function closeModal(id) { const el = $(id); if (!el) return; el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); if (!qs('.pm-modal.is-open') && !qs('.pm-drawer.is-open')) document.body.classList.remove('modal-open'); }
function openDrawer() { if (!state.user) return openAuth('login'); if (!requireOnboarding('Profil menüsü')) return; const d = $('profileDrawer'); if (d?.classList.contains('is-open')) return closeDrawer(); d?.classList.add('is-open'); d?.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); }
function closeDrawer() { const d = $('profileDrawer'); d?.classList.remove('is-open'); d?.setAttribute('aria-hidden','true'); if (!qs('.pm-modal.is-open')) document.body.classList.remove('modal-open'); }
function scrollToId(id) { const el = $(id); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); qsa('.pm-category-nav button,.pm-bottom-nav button').forEach(b => b.classList.toggle('is-active', b.dataset.scrollTarget === id)); }

function renderHeroDots() {
  const dots = $('heroDots'); if (!dots) return;
  dots.innerHTML = '';
  qsa('.pm-slide').forEach((_, index) => { const b = document.createElement('button'); b.className = index === state.heroIndex ? 'is-active' : ''; b.type = 'button'; b.addEventListener('click', () => showHero(index)); dots.append(b); });
}
function showHero(index) { const slides = qsa('.pm-slide'); if (!slides.length) return; state.heroIndex = (index + slides.length) % slides.length; slides.forEach((s,i)=>s.classList.toggle('is-active', i === state.heroIndex)); renderHeroDots(); }
function startHero() { renderHeroDots(); setInterval(() => showHero(state.heroIndex + 1), 5000); }

function gameCard(game) {
  const palette = {
    crash: ['#ff8a00', '#ff4757'],
    chess: ['#1463ff', '#22d3ee'],
    pisti: ['#7c3cff', '#ff4fd8'],
    pattern: ['#16a34a', '#7ee05f'],
    space: ['#0064ff', '#67e8f9'],
    snake: ['#10b981', '#0ee486']
  }[game.key] || ['#2f66ff', '#8b5cf6'];
  return `<button class="pm-home-game-card" style="--card-a:${palette[0]};--card-b:${palette[1]}" data-play-game="${escapeHtml(game.key)}" type="button" aria-label="${escapeHtml(game.title)} oyununu aç">
    <span class="pm-game-big-icon"><i class="fa-solid ${game.icon}"></i></span>
    <span class="pm-game-copy">
      <strong>${escapeHtml(game.title)}</strong>
      <small>${escapeHtml(game.category)} · ${escapeHtml(game.desc)}</small>
    </span>
    <span class="pm-game-play">Oyunu Aç</span>
  </button>`;
}
function renderGames() {
  const grid = $('gameGrid');
  if (grid) grid.innerHTML = GAMES.map(g => gameCard(g)).join('');
}
function normalizeLeaderboard(payload) {
  const tabs = payload?.tabs || {};
  const mapItem = (item, index) => {
    const p = normalizeProfile(item);
    return { ...p, rank: Number(item.rank || item.leaderboard?.rank || index + 1), metric: Number(item.leaderboard?.metricValue || item.monthlyActiveScore || item.accountXp || item.xp || 0) || 0 };
  };
  state.leaderboard.level = Array.isArray(tabs.level?.items) ? tabs.level.items.slice(0, 8).map(mapItem) : [];
  state.leaderboard.activity = Array.isArray(tabs.activity?.items) ? tabs.activity.items.slice(0, 8).map(mapItem) : [];
  if (!state.leaderboard.level.length) state.leaderboard.level = [{ username:'PlayMatrix', avatar:'/public/assets/images/logo.png', selectedFrame:100, level:1, progressPercent:0, metric:0, rank:1 }];
  if (!state.leaderboard.activity.length) state.leaderboard.activity = [{ username:'PlayMatrix', avatar:'/public/assets/images/logo.png', selectedFrame:100, level:1, progressPercent:0, metric:0, rank:1 }];
}
function renderLeaderboard() {
  const host = $('leaderboardList'); if (!host) return;
  const list = state.leaderboard[state.leaderTab] || [];
  host.innerHTML = list.map((item, index) => `<button class="pm-leader-row" data-player-uid="${escapeHtml(item.uid || '')}" type="button"><span class="pm-rank">#${item.rank || index + 1}</span><span class="pm-leader-user"><span class="pm-leader-avatar pm-avatar-composite ${Number(item.selectedFrame || 0) ? 'has-frame' : ''}" data-pm-avatar="true"><span class="pm-avatar-base"><img src="${escapeHtml(getSafeAvatarSrc(item.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR))}" alt=""></span>${Number(item.selectedFrame || 0) ? `<span class="pm-avatar-frame" style="background-image:url('/public/assets/frames/frame-${Math.max(0, Math.min(100, Math.trunc(Number(item.selectedFrame || 0) || 0)))}.png')"></span>` : ''}</span><span class="pm-leader-name"><strong>${escapeHtml(item.username || 'Oyuncu')}</strong><span>Seviye ${Number(item.level || item.accountLevel || 1)}</span></span></span><strong class="pm-leader-score">${state.leaderTab === 'activity' ? fmt(item.monthlyActiveScore || item.metric || 0) : fmt(item.accountXp || item.xp || item.metric || 0)}</strong></button>`).join('');
}
async function loadPublicData() {
  try {
    const summary = await apiFetch('/api/home/summary', { timeoutMs: 5500 }).catch(() => null);
    if (summary?.leaderboard) normalizeLeaderboard(summary.leaderboard);
    else normalizeLeaderboard(await apiFetch('/api/leaderboard', { timeoutMs: 5500 }));
    const policy = summary?.chatPolicy || CHAT_POLICY;
    setText('chatPolicyText', policy.summaryLabel || CHAT_POLICY.summaryLabel);
    setText('socialPolicyDisclosure', policy.lobbyDisclosure || policy.disclosure || CHAT_POLICY.disclosure);
  } catch (error) {
    normalizeLeaderboard({});
    reportHomeIssue('home.public_data', error, { severity:'warning' });
  }
  renderLeaderboard();
}
async function refreshProfile() {
  if (!state.user) { state.profile = null; updateShell(); return null; }
  try {
    state.token = await state.user.getIdToken();
    const payload = await apiFetch('/api/user/me', { timeoutMs: 6500 });
    state.profile = normalizeProfile(payload);
  } catch (error) {
    state.profile = normalizeProfile({ uid: state.user.uid, email: state.user.email, username: state.user.displayName || state.user.email?.split('@')[0], avatar: DEFAULT_AVATAR, balance:0, xp:0, selectedFrame:0 });
    reportHomeIssue('home.profile_load', error, { severity:'warning' });
  }
  updateShell(); return state.profile;
}
function updateShell() {
  const loggedIn = !!state.user;
  document.body.dataset.auth = loggedIn ? 'in' : 'out';
  setHidden('guestActions', loggedIn);
  setHidden('authBalanceChip', !loggedIn);
  setHidden('profileDrawerOpen', !loggedIn);
  setText('bottomProfileLabel', loggedIn ? 'Profil' : 'Giriş');
  const p = state.profile || {};
  setText('headerBalance', fmt(p.balance || 0));
  setText('headerUsername', p.username || 'Oyuncu');
  setText('drawerUsername', p.username || 'Oyuncu');
  setText('drawerEmail', p.email || 'Oturum bekleniyor');
  renderAvatar($('headerAvatar'), p, 'pm-avatar-header');
  renderAvatar($('drawerAvatar'), p, 'pm-avatar-large');
  const invite = $('inviteLink'); if (invite) invite.textContent = `https://playmatrix.com.tr/?ref=${encodeURIComponent(p.uid || 'playmatrix')}`;
  setHidden('headerUnreadDot', !state.notificationUnread);
  setText('headerUnreadDot', state.notificationUnread > 99 ? '99+' : String(state.notificationUnread || 0));
  setHidden('drawerUnreadBadge', !state.notificationUnread);
  setText('drawerUnreadBadge', state.notificationUnread > 99 ? '99+' : String(state.notificationUnread || 0));
}

async function initFirebase() {
  try {
    const config = await loadFirebaseWebConfig({ required: false, timeoutMs: 5000 });
    if (!config) return false;
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const app = appMod.initializeApp(config);
    const auth = authMod.getAuth(app);
    state.firebase = { ...authMod, app };
    state.auth = auth;
    state.firebaseReady = true;
    authMod.onAuthStateChanged(auth, async (user) => { state.user = user || null; state.token = user ? await user.getIdToken().catch(()=>'') : ''; await refreshProfile(); if (state.user && !isOnboardingComplete()) renderAuth('setup'), openModal('authModal', { bypassOnboarding:true }); if (state.user) loadNotifications().catch(()=>null); loadPublicData().catch(()=>null); });
    return true;
  } catch (error) {
    reportHomeIssue('home.firebase_boot', error, { severity:'warning', solution:'Firebase public runtime config ve CDN erişimi kontrol edilmeli.' });
    updateShell(); return false;
  }
}
function openAuth(mode = 'login') { renderAuth(mode); openModal('authModal'); }
function renderAuth(mode = 'login') {
  const host = $('authView'); if (!host) return;
  if (mode === 'register') {
    host.innerHTML = `<h2 class="pm-auth-title">Kayıt Ol</h2><h3 class="pm-auth-section-title">Hesap Bilgileri</h3><label class="pm-field pm-icon-field"><span>Kullanıcı Adı</span><i class="fa-regular fa-user"></i><input id="regUsername" placeholder="Kullanıcı adınızı girin" autocomplete="username"></label><label class="pm-field pm-icon-field"><span>E-Posta</span><i class="fa-regular fa-envelope"></i><input id="regEmail" type="email" placeholder="E-posta adresinizi girin" autocomplete="email"></label><label class="pm-field pm-icon-field"><span>Promosyon Kodu</span><i class="fa-solid fa-cart-shopping"></i><input id="regPromo" placeholder="Davet/promo kodu varsa girin" autocomplete="off"></label><label class="pm-field pm-icon-field"><span>Şifre</span><i class="fa-regular fa-eye"></i><input id="regPassword" type="password" placeholder="Şifrenizi girin" autocomplete="new-password"></label><label class="pm-field pm-icon-field"><span>Şifre (Tekrar)</span><i class="fa-regular fa-eye"></i><input id="regPassword2" type="password" placeholder="Şifrenizi tekrar girin" autocomplete="new-password"></label><label class="pm-check-row"><input id="regBonus" type="checkbox" checked><span><strong>50.000 MC kayıt ödülü istiyorum</strong> <small>Tiklenmese bile kayıt ödülü backend tarafından tanımlanır.</small></span></label><label class="pm-check-row"><input id="regAccept" type="checkbox"><span>19 yaşından büyük olduğumu, <strong>Kurallar ve Şartları</strong> kabul ettiğimi onaylıyorum.</span></label><button class="pm-btn pm-btn-primary pm-full" id="registerSubmit" type="button">Kayıt Ol</button><button class="pm-auth-link" type="button" data-open-auth="login">Zaten hesabım var</button><div class="pm-result" id="authResult"></div>`;
    $('registerSubmit')?.addEventListener('click', registerUser);
  } else if (mode === 'password') {
    const identifier = sessionStorage.getItem('pm_login_identifier') || '';
    const maskedPhoneValue = state.profile?.phone || state.profile?.gsm || '';
    host.innerHTML = `<h2 class="pm-auth-title">Şifrenizi Giriniz</h2><label class="pm-field pm-icon-field"><span>Şifre</span><i class="fa-regular fa-eye"></i><input id="loginPassword" type="password" placeholder="Şifrenizi girin" autocomplete="current-password"></label><div class="pm-owner-box"><strong>Bu bilgi size mi ait?</strong><p><i class="fa-solid fa-phone"></i> ${maskedPhoneValue ? `GSM: ${escapeHtml(maskPhone(maskedPhoneValue))}` : `Hesap: ${escapeHtml(identifier)}`}</p></div><button class="pm-btn pm-btn-primary pm-full" id="passwordSubmit" type="button">Giriş Yap</button><button class="pm-auth-link" type="button" data-open-auth="login">‹ Önceki adıma geri dön</button><div class="pm-result" id="authResult"></div>`;
    $('passwordSubmit')?.addEventListener('click', loginUser);
  } else if (mode === 'setup') {
    const avatarReady = !!state.profile?.avatar;
    const frameReady = Number(state.profile?.selectedFrame || 0) > 0;
    host.innerHTML = `<h2 class="pm-auth-title">Profil Kurulumu</h2><p class="pm-muted">Kayıt sonrası avatar ve çerçeve seçimi zorunludur. Seçim tamamlanmadan oyun, profil ve promosyon işlemleri açılmaz.</p><div class="pm-onboarding-preview"><div class="pm-avatar-composite pm-avatar-large" id="setupAvatarPreview"></div><div><strong>${escapeHtml(state.profile?.username || 'Oyuncu')}</strong><span>Avatar: ${avatarReady ? 'Seçildi' : 'Bekliyor'} · Çerçeve: ${frameReady ? `#${Number(state.profile?.selectedFrame || 0)}` : 'Bekliyor'}</span></div></div><div class="pm-profile-tools"><button class="pm-tool-card" data-open-modal="avatarModal" type="button"><i class="fa-solid fa-user-circle"></i><span>Avatar Seç</span></button><button class="pm-tool-card" data-open-modal="frameModal" type="button"><i class="fa-solid fa-certificate"></i><span>Çerçeve Seç</span></button></div><button class="pm-btn pm-btn-primary pm-full" id="finishSetupBtn" type="button" ${avatarReady && frameReady ? '' : 'disabled'}>Kurulumu Tamamla</button><div class="pm-result" id="authResult"></div>`;
    renderAvatar($('setupAvatarPreview'), state.profile || {}, 'pm-avatar-large');
    $('finishSetupBtn')?.addEventListener('click', finishOnboarding);
  } else {
    host.innerHTML = `<h2 class="pm-auth-title">Giriş Yapın</h2><label class="pm-field pm-icon-field"><span>Kullanıcı Adı veya E-Posta</span><i class="fa-regular fa-user"></i><input id="loginIdentifier" placeholder="Kullanıcı adınızı veya e-postanızı girin" autocomplete="username"></label><label class="pm-check-row"><input id="rememberMe" type="checkbox"><span>Beni Hatırla</span></label><button class="pm-btn pm-btn-primary pm-full" id="loginNext" type="button">Devam Et</button><button class="pm-auth-link" type="button" id="forgotPasswordBtn">Şifremi Unuttum</button><button class="pm-auth-link" type="button" data-open-auth="register">Yeni hesap oluştur</button><div class="pm-result" id="authResult"></div>`;
    $('loginNext')?.addEventListener('click', prepareLoginIdentifier);
    $('forgotPasswordBtn')?.addEventListener('click', resetPassword);
  }
}
async function prepareLoginIdentifier() {
  try {
    const identifier = safeText($('loginIdentifier')?.value).toLowerCase();
    if (!identifier) throw new Error('Kullanıcı adı veya e-posta gerekli.');
    sessionStorage.setItem('pm_login_identifier', identifier);
    if (identifier.includes('@')) {
      sessionStorage.setItem('pm_login_email', identifier);
      renderAuth('password');
      return;
    }
    const payload = await apiFetch('/api/auth/resolve-login', { method:'POST', body:JSON.stringify({ identifier }), timeoutMs: 5000 });
    if (!payload.email) throw new Error('Hesap bulunamadı.');
    sessionStorage.setItem('pm_login_email', payload.email);
    renderAuth('password');
  } catch (error) {
    setText('authResult', `Giriş bilgisi bulunamadı: ${error.message}`);
    reportHomeIssue('home.auth.resolve', error, { severity:'warning' });
  }
}
async function loginUser() {
  try {
    if (!state.firebaseReady) throw new Error('FIREBASE_NOT_READY');
    const email = sessionStorage.getItem('pm_login_email') || '';
    const password = $('loginPassword')?.value || '';
    if (!email || !password) throw new Error('E-posta/kullanıcı adı ve şifre gerekli.');
    await state.firebase.signInWithEmailAndPassword(state.auth, email, password);
    await refreshProfile();
    if (!isOnboardingComplete()) return renderAuth('setup');
    closeModal('authModal'); toast('Giriş yapıldı', 'Oturum güvenli şekilde açıldı.', 'success');
  } catch (error) { setText('authResult', `Giriş başarısız: ${error.message}`); reportHomeIssue('home.auth.login', error, { severity:'warning' }); }
}
async function registerUser() {
  try {
    if (!state.firebaseReady) throw new Error('FIREBASE_NOT_READY');
    const username = safeText($('regUsername')?.value);
    const email = safeText($('regEmail')?.value).toLowerCase();
    const promoCode = safeText($('regPromo')?.value).toUpperCase();
    const p1 = $('regPassword')?.value || ''; const p2 = $('regPassword2')?.value || '';
    if (!username || !email || p1.length < 6 || p1 !== p2) throw new Error('Bilgileri kontrol et. Şifre en az 6 karakter olmalı ve iki şifre eşleşmeli.');
    if (!$('regAccept')?.checked) throw new Error('19 yaş ve Kurallar/Şartlar onayı zorunlu.');
    const cred = await state.firebase.createUserWithEmailAndPassword(state.auth, email, p1);
    await state.firebase.updateProfile?.(cred.user, { displayName: username }).catch(()=>null);
    await state.firebase.sendEmailVerification?.(cred.user).catch(()=>null);
    state.user = cred.user;
    state.token = await cred.user.getIdToken(true);
    await apiFetch('/api/user/register-profile', { method:'POST', body:JSON.stringify({ username, email, promoCode, wantsSignupReward: true }) }).catch((error) => reportHomeIssue('home.auth.registerProfile', error, { severity:'warning' }));
    await refreshProfile();
    toast('Kayıt tamamlandı', '50.000 MC kayıt ödülü işlendi. Avatar ve çerçeve seçimi zorunlu.', 'success');
    renderAuth('setup');
  } catch (error) { setText('authResult', `Kayıt başarısız: ${error.message}`); reportHomeIssue('home.auth.register', error, { severity:'warning' }); }
}
async function resetPassword() {
  try { const identifier = safeText($('loginIdentifier')?.value || sessionStorage.getItem('pm_login_email')); if (!identifier) throw new Error('E-posta veya kullanıcı adı gerekli.'); let email = identifier; if (!identifier.includes('@')) { const payload = await apiFetch('/api/auth/resolve-login', { method:'POST', body:JSON.stringify({ identifier }) }); email = payload.email; } await state.firebase.sendPasswordResetEmail(state.auth, email); setText('authResult', 'Şifre sıfırlama e-postası gönderildi.'); }
  catch (error) { setText('authResult', `İşlem başarısız: ${error.message}`); }
}
async function logout() { try { await state.firebase?.signOut?.(state.auth); closeDrawer(); toast('Çıkış yapıldı', 'Oturum kapatıldı.', 'info'); } catch (error) { reportHomeIssue('home.auth.logout', error, { severity:'warning' }); } }
async function finishOnboarding() {
  try {
    if (!state.user) throw new Error('Oturum gerekli.');
    if (!state.profile?.avatar || Number(state.profile?.selectedFrame || 0) <= 0) throw new Error('Avatar ve çerçeve seçimi tamamlanmalı.');
    await apiFetch('/api/user/onboarding-complete', { method:'POST', body:JSON.stringify({ avatar: state.profile.avatar, selectedFrame: state.profile.selectedFrame }) });
    await refreshProfile();
    closeModal('authModal');
    toast('Profil kurulumu tamamlandı', 'Avatar ve çerçeve kaydedildi.', 'success');
  } catch (error) { setText('authResult', `Kurulum tamamlanamadı: ${error.message}`); }
}

function renderAccountModal() {
  const host = $('accountBody'); if (!host) return; const p = state.profile || {};
  host.innerHTML = `<div class="pm-account-profile-head"><div class="pm-avatar-composite pm-avatar-large" id="accountAvatarPreview"></div><div><h3>${escapeHtml(p.username || 'Oyuncu')}</h3><p>ID: ${escapeHtml(p.uid || '—')}</p></div></div><section class="pm-account-section"><h3>Kimlik Bilgileri</h3><p>Temel hesap bilgileriniz</p><div class="pm-account-grid"><label><span>Kullanıcı ID</span><div><strong>${escapeHtml(p.uid || '—')}</strong><button type="button" class="pm-mini-copy" data-copy="${escapeHtml(p.uid || '')}"><i class="fa-regular fa-copy"></i></button></div></label><label><span>Kullanıcı Adı</span><div>${escapeHtml(p.username || '—')}</div></label><label><span>Ad Soyad</span><div>${escapeHtml(p.fullName || p.name || '—')}</div></label><label><span>E-Posta</span><div>${escapeHtml(maskEmail(p.email || ''))}</div></label><label><span>GSM</span><div>${escapeHtml(maskPhone(p.gsm || p.phone || p.phoneNumber || ''))}</div></label></div></section><section class="pm-account-section"><h3>Tercihler & Güvenlik</h3><p>Dil, para birimi, doğrulama ve şifre</p><div class="pm-account-grid"><label><span>Dil Seçimi</span><div>TR</div></label><label><span>Para Birimi</span><div>MC</div></label><label><span>Email Onayı</span><div><em class="${p.emailVerified ? 'is-ok' : 'is-bad'}">${p.emailVerified ? 'Onaylı' : 'Onaylı Değil'}</em></div></label><label><span>Telefon Onayı</span><div><em class="${p.phoneVerified || p.gsmVerified ? 'is-ok' : 'is-bad'}">${p.phoneVerified || p.gsmVerified ? 'Onaylı' : 'Onaylı Değil'}</em></div></label></div><div class="pm-security-note"><i class="fa-solid fa-circle-info"></i><span>Hesap güvenliğiniz için şifrenizi düzenli değiştirmeniz önerilir.</span></div><div class="pm-profile-tools"><button class="pm-tool-card" data-open-modal="avatarModal" type="button"><i class="fa-solid fa-user-circle"></i><span>Avatar Seç</span></button><button class="pm-tool-card" data-open-modal="frameModal" type="button"><i class="fa-solid fa-certificate"></i><span>Çerçeve Seç</span></button><button class="pm-tool-card" data-open-modal="emailModal" type="button"><i class="fa-solid fa-envelope"></i><span>E-posta Güncelle</span></button></div></section>`;
  renderAvatar($('accountAvatarPreview'), p, 'pm-avatar-large');
}
function renderAvatarPicker() {
  const filters = $('avatarFilters'); const grid = $('avatarGrid'); if (!filters || !grid) return;
  const cats = [{ id:'all', title:'Tümü', icon:'fa-border-all', items: AVATAR_CATEGORIES.flatMap(c=>c.items) }, ...AVATAR_CATEGORIES];
  filters.innerHTML = cats.map(c => `<button class="${state.currentAvatarCategory === c.id ? 'is-active' : ''}" data-avatar-category="${c.id}" type="button"><i class="fa-solid ${c.icon || 'fa-circle'}"></i> ${escapeHtml(c.title)}</button>`).join('');
  const selectedCat = cats.find(c => c.id === state.currentAvatarCategory) || cats[0];
  grid.innerHTML = selectedCat.items.map(item => `<button class="pm-avatar-card ${(state.profile?.avatar === item.src) ? 'is-selected' : ''}" data-avatar-src="${escapeHtml(item.src)}" type="button"><img src="${escapeHtml(item.src)}" alt=""><span>Seç</span></button>`).join('');
}
function renderFramePicker() {
  const grid = $('frameGrid'); if (!grid) return; const level = Number(state.profile?.level || 1); const selected = Number(state.profile?.selectedFrame || 0);
  const items = Array.from({ length: 100 }, (_, i) => i + 1).filter(n => state.frameFilter === 'all' || (state.frameFilter === 'open' ? n <= level : n > level));
  grid.innerHTML = items.map(n => { const locked = n > level; return `<button class="pm-frame-card ${selected === n ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}" data-frame="${n}" type="button" ${locked ? 'aria-disabled="true"' : ''}><span class="pm-frame-lock"><i class="fa-solid ${locked ? 'fa-lock' : 'fa-check'}"></i></span><span class="pm-frame-preview"><span class="pm-avatar-base"><img src="${escapeHtml(state.profile?.avatar || DEFAULT_AVATAR)}" alt=""></span><span class="pm-avatar-frame" style="background-image:url('/public/assets/frames/frame-${n}.png')"></span></span><strong>Seviye ${n}</strong><small>Çerçeve ${n}</small><span class="pm-frame-state">${locked ? `Kilitli` : selected === n ? 'Aktif' : 'Kullanılabilir'}</span></button>`; }).join('');
}
async function selectAvatar(src) { if (!ensureAuth('Avatar seçimi')) return; try { const wasComplete = isOnboardingComplete(); await apiFetch('/api/user/avatar', { method:'POST', body:JSON.stringify({ avatar: src }) }); state.profile = { ...(state.profile || {}), avatar: src, onboardingComplete: wasComplete ? true : false }; updateShell(); renderAvatarPicker(); if (!wasComplete) { renderAuth('setup'); openModal('authModal', { bypassOnboarding:true }); } else if ($('setupAvatarPreview')) renderAuth('setup'); toast('Avatar güncellendi', 'Profil avatarı kaydedildi.', 'success'); } catch (error) { toast('Avatar kaydedilemedi', error.message, 'error'); reportHomeIssue('home.avatar.save', error); } }
async function selectFrame(n) { if (!ensureAuth('Çerçeve seçimi')) return; const level = Number(state.profile?.level || 1); if (n > level) return toast('Çerçeve kilitli', `Bu çerçeve için Seviye ${n} gerekli.`, 'warning'); try { const wasComplete = isOnboardingComplete(); await apiFetch('/api/user/frame', { method:'POST', body:JSON.stringify({ frame: n }) }); state.profile = { ...(state.profile || {}), selectedFrame: n, onboardingComplete: wasComplete ? true : false }; updateShell(); renderFramePicker(); if (!wasComplete) { renderAuth('setup'); openModal('authModal', { bypassOnboarding:true }); } else if ($('setupAvatarPreview')) renderAuth('setup'); toast('Çerçeve güncellendi', `Çerçeve ${n} aktif edildi.`, 'success'); } catch (error) { toast('Çerçeve kaydedilemedi', error.message, 'error'); reportHomeIssue('home.frame.save', error); } }
async function updateEmail() { try { if (!state.user || !state.firebaseReady) throw new Error('Oturum gerekli.'); const email = safeText($('emailUpdateInput')?.value); if (!email.includes('@')) throw new Error('Geçerli e-posta gir.'); await state.firebase.verifyBeforeUpdateEmail(state.user, email); setText('emailResult', 'Doğrulama bağlantısı gönderildi. Bağlantı onaylanınca e-posta güncellenir.'); } catch (error) { setText('emailResult', `İşlem başarısız: ${error.message}`); reportHomeIssue('home.email.update', error, { severity:'warning' }); } }
async function spinWheel() { if (!ensureAuth('Çark')) return; if (!requireOnboarding('Çark')) return; const btn = $('spinWheelBtn'); const wheel = $('dailyWheelVisual'); try { btn && (btn.disabled = true); const payload = await apiFetch('/api/wheel/spin', { method:'POST', body:JSON.stringify({}) }); const amount = Number(payload.amount || payload.reward || payload.prize || 0) || 0; const index = Math.max(0, WHEEL_REWARDS.findIndex((x) => x === amount)); const segment = 360 / WHEEL_REWARDS.length; const targetIndex = index >= 0 ? index : 0; state.wheelRotation += 1440 + (360 - (targetIndex * segment + segment / 2)); if (wheel) wheel.style.transform = `rotate(${state.wheelRotation}deg)`; setText('wheelResult', `${fmt(amount)} MC kazandın.`); await refreshProfile(); } catch (error) { setText('wheelResult', error.status === 409 ? 'Bugünkü çark hakkın kullanılmış.' : `Çark hatası: ${error.message}`); } finally { setTimeout(() => { if (btn) btn.disabled = false; }, 900); } }
async function claimPromo() { if (!ensureAuth('Promo')) return; try { const code = safeText($('promoCodeInput')?.value).toUpperCase(); const payload = await apiFetch('/api/promo/claim', { method:'POST', body:JSON.stringify({ code }) }); setText('promoResult', `${escapeHtml(code)} kodu ile ${fmt(payload.amount || 0)} MC tanımlandı.`); await refreshProfile(); } catch (error) { setText('promoResult', `Promo kullanılamadı: ${error.message}`); } }
async function sendSupport() { if (!ensureAuth('Canlı destek')) return; try { await apiFetch('/api/support/message', { method:'POST', body:JSON.stringify({ subject: $('supportSubject')?.value || 'AnaSayfa destek', message: $('supportMessage')?.value || '', source:'home' }) }); setText('supportResult', 'Mesaj admin canlı destek ekranına iletildi.'); } catch (error) { setText('supportResult', `Gönderilemedi: ${error.message}`); } }
async function loadNotifications() { const host = $('notificationsBody'); if (!host) return; try { const payload = await apiFetch('/api/notifications', { timeoutMs:5000 }); const items = Array.isArray(payload.items) ? payload.items : []; state.notificationUnread = Number(payload.unread || payload.summary?.unread || 0) || 0; updateShell(); if (!items.length) { host.innerHTML = `<i class="fa-solid fa-message-xmark"></i><p>Henüz bir kayıt bulunamadı.</p>`; return; } host.classList.remove('pm-empty-state'); host.classList.add('pm-notification-list'); host.innerHTML = items.map(n=>`<article class="pm-notification-item ${n.read ? '' : 'is-unread'}"><i class="fa-solid ${n.icon || 'fa-bell'}"></i><div><h3>${escapeHtml(n.title || 'Bildirim')}</h3><p>${escapeHtml(n.message || n.text || '')}</p><small>${escapeHtml(formatDate(n.at || n.createdAt))}</small></div></article>`).join(''); } catch { host.className = 'pm-empty-state'; host.innerHTML = `<i class="fa-solid fa-message-xmark"></i><p>Henüz bir kayıt bulunamadı.</p>`; } }
function renderSocial() {
  const host = $('socialContent'); if (!host) return;
  setText('socialTitle', 'Sosyal Merkez');
  setText('socialSubtitle', 'Anlık kullanım kapalı');
  const form = $('chatForm'); if (form) form.hidden = true;
  host.innerHTML = `<div class="pm-empty-mini pm-maintenance-state"><i class="fa-solid fa-shield-halved"></i><strong>Sosyal Merkez şu an anlık kullanıma kapalı</strong><p>Yerel sohbet, DM, arkadaşlık ve oyun daveti geçici olarak bakım/aktif değil durumundadır. Gerçek bildirimler Bildirimler panelinden takip edilir.</p></div>`;
}
async function loadBetHistory() {
  const host = $('betHistoryBody'); if (!host) return;
  try { const payload = await apiFetch('/api/history/bets', { timeoutMs:5000 }); host.innerHTML = renderMiniCards(Array.isArray(payload.items) ? payload.items : []); }
  catch (error) { host.innerHTML = '<div class="pm-empty-state pm-empty-state-compact"><i class="fa-solid fa-message-xmark"></i><p>Henüz bir kayıt bulunamadı.</p></div>'; }
}
async function loadSessionHistory() {
  const host = $('sessionHistoryBody'); if (!host) return;
  try { const payload = await apiFetch('/api/history/sessions', { timeoutMs:5000 }); host.innerHTML = renderMiniCards(Array.isArray(payload.items) ? payload.items : []); }
  catch (error) { host.innerHTML = '<div class="pm-empty-state pm-empty-state-compact"><i class="fa-solid fa-message-xmark"></i><p>Henüz bir kayıt bulunamadı.</p></div>'; }
}
async function loadAccountStats() {
  const host = $('accountStatsBody'); if (!host) return;
  try { const payload = await apiFetch('/api/account/stats', { timeoutMs:5000 }); renderStatsBody(host, payload.profile || payload.data || state.profile || {}); }
  catch (error) { renderStatsBody(host, state.profile || {}); }
}
function renderStatsBody(host, p = {}) {
  const stats = p.stats || p.statistics || {};
  host.innerHTML = `<div class="pm-account-profile-head"><div class="pm-avatar-composite pm-avatar-large" id="statsAvatarPreview"></div><div><h3>${escapeHtml(p.username || p.displayName || 'Oyuncu')}</h3><p>ID: ${escapeHtml(p.uid || '—')}</p></div></div><div class="pm-stats-grid"><article class="pm-stat-card"><h3>${fmt(p.balance || 0)} MC</h3><p>Güncel bakiye</p></article><article class="pm-stat-card"><h3>Seviye ${Number(p.level || p.accountLevel || 1)}</h3><p>Hesap seviyesi</p></article><article class="pm-stat-card"><h3>${fmt(p.accountXp || p.xp || 0)}</h3><p>Toplam XP</p></article><article class="pm-stat-card"><h3>${fmt(stats.totalWins || stats.wins || 0)}</h3><p>Toplam galibiyet</p></article><article class="pm-stat-card"><h3>${fmt(stats.gamesPlayed || stats.totalGames || 0)}</h3><p>Oynanan oyun</p></article><article class="pm-stat-card"><h3>${fmt(p.monthlyActiveScore || 0)}</h3><p>Aylık aktiflik</p></article></div>`;
  renderAvatar($('statsAvatarPreview'), p, 'pm-avatar-large');
}
async function openPlayerStats(uid = '') {
  if (!ensureAuth('Oyuncu istatistikleri')) return;
  if (!requireOnboarding('Oyuncu istatistikleri')) return;
  const cached = [...(state.leaderboard.level || []), ...(state.leaderboard.activity || [])].find((x) => String(x.uid || '') === String(uid || ''));
  openModal('playerStatsModal');
  const host = $('playerStatsBody'); if (!host) return;
  if (cached) renderStatsBody(host, cached);
  if (!uid) return;
  try { const payload = await apiFetch(`/api/user-stats/${encodeURIComponent(uid)}`, { timeoutMs:5500 }); renderStatsBody(host, payload.data || payload.profile || cached || {}); }
  catch (error) { if (!cached) host.innerHTML = '<div class="pm-empty-state pm-empty-state-compact"><i class="fa-solid fa-message-xmark"></i><p>Oyuncu verileri alınamadı.</p></div>'; }
}
async function markNotificationsRead() {
  try { await apiFetch('/api/notifications/read-all', { method:'POST', body:JSON.stringify({}) }); await loadNotifications(); toast('Bildirimler güncellendi', 'Tüm bildirimler okunmuş işaretlendi.', 'success'); }
  catch (error) { toast('Bildirim işlemi başarısız', error.message, 'error'); }
}
async function clearNotifications() {
  try { await apiFetch('/api/notifications/clear', { method:'POST', body:JSON.stringify({}) }); await loadNotifications(); toast('Bildirimler silindi', 'Tüm bildirimler temizlendi.', 'success'); }
  catch (error) { toast('Bildirim işlemi başarısız', error.message, 'error'); }
}
async function handleSocialAction(action) {
  if (!ensureAuth('Sosyal Merkez')) return;
  const out = $('socialToolResults');
  const write = (html) => { if (out) out.innerHTML = html; };
  try {
    if (action === 'load-dm') {
      const payload = await apiFetch('/api/chat/direct/list', { timeoutMs: 5000 });
      const items = Array.isArray(payload.items) ? payload.items : [];
      write(items.length ? items.map(x => `<article><strong>${escapeHtml(x.username || x.peerUid || 'DM')}</strong><p>${escapeHtml(x.lastMessage || 'Son mesaj yok')}</p></article>`).join('') : '<div class="pm-empty-mini"><strong>DM kaydı yok</strong><p>Yeni konuşmalar burada görünecek.</p></div>');
      return;
    }
    if (action === 'search-message') {
      const q = safeText($('socialSearchInput')?.value);
      const payload = await apiFetch(`/api/chat/direct/search?q=${encodeURIComponent(q)}`, { timeoutMs: 5000 });
      const items = Array.isArray(payload.items) ? payload.items : [];
      write(items.length ? items.map(x => `<article><strong>${escapeHtml(x.peerUid || 'Mesaj')}</strong><p>${escapeHtml(x.text || x.message || '')}</p></article>`).join('') : '<div class="pm-empty-mini"><strong>Sonuç yok</strong><p>Aktif mesajlarda eşleşme bulunmadı.</p></div>');
      return;
    }
    if (action === 'load-requests') {
      const payload = await apiFetch('/api/friends/list', { timeoutMs: 5000 });
      const c = payload.counts || {};
      write(`<article><strong>Arkadaşlık Özeti</strong><p>Kabul edilen: ${fmt(c.accepted || 0)} · Gelen: ${fmt(c.incoming || 0)} · Giden: ${fmt(c.outgoing || 0)}</p></article>`);
      return;
    }
    if (action === 'send-friend') {
      const targetUid = safeText($('friendTargetInput')?.value);
      if (!targetUid) throw new Error('Hedef kullanıcı UID gerekli.');
      await apiFetch('/api/friends/request', { method:'POST', body:JSON.stringify({ targetUid }) });
      write('<article><strong>İstek gönderildi</strong><p>Arkadaşlık isteği işlendi.</p></article>');
      return;
    }
    if (action === 'send-invite') {
      const targetUid = safeText($('inviteTargetInput')?.value);
      const gameKey = safeText($('inviteGameSelect')?.value || 'chess');
      if (!targetUid) throw new Error('Hedef kullanıcı UID gerekli.');
      if (state.socket?.connected) {
        state.socket.emit('game:invite_send', { targetUid, gameKey, gameName: gameKey === 'pisti' ? 'Pişti' : 'Satranç' }, (ack) => {
          if (ack?.ok) write('<article><strong>Davet gönderildi</strong><p>Oyun daveti karşı tarafa iletildi.</p></article>');
          else write(`<article><strong>Davet gönderilemedi</strong><p>${escapeHtml(ack?.message || ack?.error || 'Hata')}</p></article>`);
        });
      } else {
        write('<article><strong>Bağlantı bekleniyor</strong><p>Soket bağlantısı hazır değil; sosyal panel yeniden açıldığında tekrar dene.</p></article>');
      }
    }
  } catch (error) {
    write(`<article><strong>İşlem tamamlanamadı</strong><p>${escapeHtml(error.message || 'Beklenmeyen hata')}</p></article>`);
    reportHomeIssue(`home.social.${action}`, error, { severity:'warning' });
  }
}
async function loadLobbyHistory() { renderSocial(); }
async function connectSocialSocket() { renderSocial(); }
async function sendChat(event) { event.preventDefault(); toast('Sosyal Merkez kapalı', 'Anlık sohbet şu an kullanıma kapalı.', 'warning'); }
function updateChatCounter(){ setText('chatCounter', `${($('chatInput')?.value || '').length}/280`); }
function copyInvite(){ const text = $('inviteLink')?.textContent || 'https://playmatrix.com.tr/'; navigator.clipboard?.writeText(text).then(()=>toast('Kopyalandı', 'Davet bağlantısı panoya alındı.', 'success')).catch(()=>toast('Kopyalanamadı', text, 'warning')); }
function installEvents() {
  document.addEventListener('click', (event) => {
    if (event.target?.classList?.contains('pm-modal')) { event.preventDefault(); closeModal(event.target.id); return; }
    const target = event.target.closest('button,a'); if (!target) return;
    if (target.dataset.scrollTarget) { event.preventDefault(); if (target.closest('.pm-drawer-panel')) closeDrawer(); scrollToId(target.dataset.scrollTarget); return; }
    if (target.dataset.openModal) { event.preventDefault(); if (target.closest('.pm-drawer-panel')) closeDrawer(); openModal(target.dataset.openModal); return; }
    if (target.dataset.closeModal) { event.preventDefault(); closeModal(target.dataset.closeModal); return; }
    if (target.dataset.openAuth) { event.preventDefault(); openAuth(target.dataset.openAuth); return; }
    if (target.dataset.closeDrawer !== undefined) { event.preventDefault(); closeDrawer(); return; }
    if (target.dataset.profileAction === 'open') { event.preventDefault(); openDrawer(); return; }
    if (target.id === 'profileDrawerOpen') { event.preventDefault(); openDrawer(); return; }
    if (target.dataset.copy !== undefined) { event.preventDefault(); navigator.clipboard?.writeText(target.dataset.copy || '').then(()=>toast('Kopyalandı','Kullanıcı ID panoya alındı.','success')).catch(()=>{}); return; }
    if (target.dataset.logout !== undefined) { event.preventDefault(); logout(); return; }
    if (target.dataset.playGame) { event.preventDefault(); const game = GAMES.find(g=>g.key===target.dataset.playGame); if (ensureAuth(game?.title || 'Oyun') && requireOnboarding(game?.title || 'Oyun')) location.href = game.route; return; }
    if (target.dataset.leaderTab) { state.leaderTab = target.dataset.leaderTab; qsa('[data-leader-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.leaderTab === state.leaderTab)); renderLeaderboard(); return; }
    if (target.dataset.playerUid !== undefined) { event.preventDefault(); openPlayerStats(target.dataset.playerUid); return; }
    if (target.dataset.avatarCategory) { state.currentAvatarCategory = target.dataset.avatarCategory; renderAvatarPicker(); return; }
    if (target.dataset.avatarSrc) { selectAvatar(target.dataset.avatarSrc); return; }
    if (target.dataset.frameFilter) { state.frameFilter = target.dataset.frameFilter; qsa('[data-frame-filter]').forEach(b => b.classList.toggle('is-active', b.dataset.frameFilter === state.frameFilter)); renderFramePicker(); return; }
    if (target.dataset.frame) { selectFrame(Number(target.dataset.frame)); return; }
    if (target.dataset.accordion) { const panel = $('footer-' + target.dataset.accordion); if (panel) panel.classList.toggle('is-open'); target.classList.toggle('is-open'); return; }
    if (target.dataset.socialView) { state.socialView = target.dataset.socialView; renderSocial(); return; }
    if (target.dataset.socialAction) { handleSocialAction(target.dataset.socialAction); return; }
  });
  $('brandButton')?.addEventListener('click', () => scrollToId('heroSection'));
  $('spinWheelBtn')?.addEventListener('click', spinWheel);
  $('claimPromoBtn')?.addEventListener('click', claimPromo);
  $('copyInviteBtn')?.addEventListener('click', copyInvite);
  $('sendSupportBtn')?.addEventListener('click', sendSupport);
  $('sendEmailUpdateBtn')?.addEventListener('click', updateEmail);
  $('markNotificationsReadBtn')?.addEventListener('click', markNotificationsRead);
  $('clearNotificationsBtn')?.addEventListener('click', clearNotifications);
  $('socialHomeBtn')?.addEventListener('click', () => closeModal('socialModal'));
  $('chatForm')?.addEventListener('submit', sendChat);
  $('chatInput')?.addEventListener('input', updateChatCounter);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { qsa('.pm-modal.is-open').forEach(m=>closeModal(m.id)); closeDrawer(); } });
  window.addEventListener('scroll', () => { if (qs('.pm-drawer.is-open')) closeDrawer(); }, { passive:true });
}

(function installTouchHardening(){
  let lastTouchAt = 0;
  document.addEventListener('touchend', (event) => {
    const now = Date.now();
    if (now - lastTouchAt < 320) event.preventDefault();
    lastTouchAt = now;
  }, { passive:false });
  document.addEventListener('contextmenu', (event) => {
    if (!event.target?.closest?.('input, textarea')) event.preventDefault();
  });
})();

async function boot() {
  try {
    renderGames(); startHero(); installEvents(); updateShell();
    await window.__PM_API__?.ensureApiBase?.().catch(()=>null);
    await initFirebase();
    await loadPublicData();
  } catch (error) {
    reportHomeIssue('home.boot', error, { severity:'error' });
    toast('AnaSayfa başlatma hatası', 'Bazı alanlar geçici olarak yüklenemedi.', 'error');
  }
}
window.addEventListener('error', (event) => reportHomeIssue('home.window_error', event.error || event.message, { source:event.filename, line:event.lineno }));
window.addEventListener('unhandledrejection', (event) => reportHomeIssue('home.promise_rejection', event.reason || 'PROMISE_REJECTION', { source:'script.js' }));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();

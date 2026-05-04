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
  currentAvatarCategory: 'all'
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
  host.className = `pm-avatar-composite ${sizeClass}`.trim();
  host.innerHTML = `<span class="pm-avatar-base"><img src="${escapeHtml(avatar)}" alt=""></span>${frame ? `<span class="pm-avatar-frame" style="background-image:url('/public/assets/frames/frame-${frame}.png')"></span>` : ''}`;
}
function renderPlainAvatar(host, profile = {}) {
  if (!host) return;
  const avatar = getSafeAvatarSrc(profile.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR);
  host.innerHTML = `<img src="${escapeHtml(avatar)}" alt="">`;
}

function openModal(id) {
  if (['wheelModal','promoModal','inviteModal','supportModal','emailModal','avatarModal','frameModal','accountModal','notificationsModal','socialModal'].includes(id) && !state.user) return openAuth('login');
  const el = $(id); if (!el) return;
  if (id === 'avatarModal') renderAvatarPicker();
  if (id === 'frameModal') renderFramePicker();
  if (id === 'accountModal') renderAccountModal();
  if (id === 'notificationsModal') loadNotifications();
  if (id === 'socialModal') { renderSocial(); connectSocialSocket().catch(() => null); }
  el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open');
}
function closeModal(id) { const el = $(id); if (!el) return; el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); if (!qs('.pm-modal.is-open') && !qs('.pm-drawer.is-open')) document.body.classList.remove('modal-open'); }
function openDrawer() { if (!state.user) return openAuth('login'); const d = $('profileDrawer'); d?.classList.add('is-open'); d?.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); }
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
  host.innerHTML = list.map((item, index) => `<article class="pm-leader-row" data-player-uid="${escapeHtml(item.uid || '')}"><span class="pm-rank">#${item.rank || index + 1}</span><div class="pm-leader-user"><span class="pm-leader-avatar"><img src="${escapeHtml(getSafeAvatarSrc(item.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR))}" alt=""></span><span class="pm-leader-name"><strong>${escapeHtml(item.username || 'Oyuncu')}</strong><span>Seviye ${Number(item.level || item.accountLevel || 1)}</span></span></div><strong class="pm-leader-score">${state.leaderTab === 'activity' ? fmt(item.monthlyActiveScore || item.metric || 0) : fmt(item.accountXp || item.xp || item.metric || 0)}</strong></article>`).join('');
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
  setText('drawerLevel', `Seviye ${p.level || 1}`);
  setText('drawerNext', (p.level || 1) >= 100 ? 'Maksimum' : `Seviye ${(p.level || 1) + 1}`);
  setText('drawerProgressText', `%${Number(p.progressPercent || 0).toFixed(1)}`);
  const fill = $('drawerProgressFill'); if (fill) fill.style.width = `${clamp(p.progressPercent,0,100)}%`;
  renderPlainAvatar($('headerAvatar'), p);
  renderAvatar($('drawerAvatar'), p, 'pm-avatar-large');
  const invite = $('inviteLink'); if (invite) invite.textContent = `https://playmatrix.com.tr/?ref=${encodeURIComponent(p.uid || 'playmatrix')}`;
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
    authMod.onAuthStateChanged(auth, async (user) => { state.user = user || null; state.token = user ? await user.getIdToken().catch(()=>'') : ''; await refreshProfile(); loadPublicData().catch(()=>null); });
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
    host.innerHTML = `<h2 class="pm-auth-title">Kayıt Ol</h2><label class="pm-field"><span>Kullanıcı Adı</span><input id="regUsername" placeholder="Kullanıcı adınızı girin" autocomplete="username"></label><label class="pm-field"><span>E-posta</span><input id="regEmail" type="email" placeholder="E-posta adresinizi girin" autocomplete="email"></label><label class="pm-field"><span>Şifre</span><input id="regPassword" type="password" placeholder="Şifrenizi girin" autocomplete="new-password"></label><label class="pm-field"><span>Şifre Tekrar</span><input id="regPassword2" type="password" placeholder="Şifrenizi tekrar girin" autocomplete="new-password"></label><label class="pm-check-row"><input id="regAccept" type="checkbox"><span>19 yaşından büyük olduğumu, Kurallar ve Şartları kabul ettiğimi onaylıyorum.</span></label><button class="pm-btn pm-btn-primary pm-full" id="registerSubmit" type="button">Kayıt Ol</button><button class="pm-auth-link" type="button" data-open-auth="login">Zaten hesabım var</button><div class="pm-result" id="authResult"></div>`;
    $('registerSubmit')?.addEventListener('click', registerUser);
  } else if (mode === 'password') {
    host.innerHTML = `<h2 class="pm-auth-title">Şifrenizi Giriniz</h2><label class="pm-field"><span>Şifre</span><input id="loginPassword" type="password" placeholder="Şifrenizi girin" autocomplete="current-password"></label><button class="pm-btn pm-btn-primary pm-full" id="passwordSubmit" type="button">Giriş Yap</button><button class="pm-auth-link" type="button" data-open-auth="login">‹ Önceki adıma geri dön</button><div class="pm-result" id="authResult"></div>`;
    $('passwordSubmit')?.addEventListener('click', loginUser);
  } else {
    host.innerHTML = `<h2 class="pm-auth-title">Giriş Yapın</h2><label class="pm-field"><span>E-posta</span><input id="loginEmail" type="email" placeholder="E-posta adresinizi girin" autocomplete="email"></label><label class="pm-check-row"><input id="rememberMe" type="checkbox"><span>Beni Hatırla</span></label><button class="pm-btn pm-btn-primary pm-full" id="loginNext" type="button">Devam Et</button><button class="pm-auth-link" type="button" id="forgotPasswordBtn">Şifremi Unuttum</button><button class="pm-auth-link" type="button" data-open-auth="register">Yeni hesap oluştur</button><div class="pm-result" id="authResult"></div>`;
    $('loginNext')?.addEventListener('click', () => { const email = $('loginEmail')?.value || ''; sessionStorage.setItem('pm_login_email', email); renderAuth('password'); });
    $('forgotPasswordBtn')?.addEventListener('click', resetPassword);
  }
}
async function loginUser() {
  try {
    if (!state.firebaseReady) throw new Error('FIREBASE_NOT_READY');
    const email = sessionStorage.getItem('pm_login_email') || $('loginEmail')?.value || '';
    const password = $('loginPassword')?.value || '';
    await state.firebase.signInWithEmailAndPassword(state.auth, email, password);
    closeModal('authModal'); toast('Giriş yapıldı', 'Oturum güvenli şekilde açıldı.', 'success');
  } catch (error) { setText('authResult', `Giriş başarısız: ${error.message}`); reportHomeIssue('home.auth.login', error, { severity:'warning' }); }
}
async function registerUser() {
  try {
    if (!state.firebaseReady) throw new Error('FIREBASE_NOT_READY');
    const username = safeText($('regUsername')?.value);
    const email = safeText($('regEmail')?.value);
    const p1 = $('regPassword')?.value || ''; const p2 = $('regPassword2')?.value || '';
    if (!username || !email || p1.length < 6 || p1 !== p2) throw new Error('Bilgileri kontrol et. Şifre en az 6 karakter olmalı ve iki şifre eşleşmeli.');
    if (!$('regAccept')?.checked) throw new Error('Kurallar ve şartlar kabul edilmeli.');
    const cred = await state.firebase.createUserWithEmailAndPassword(state.auth, email, p1);
    await state.firebase.updateProfile?.(cred.user, { displayName: username }).catch(()=>null);
    await state.firebase.sendEmailVerification?.(cred.user).catch(()=>null);
    closeModal('authModal'); toast('Kayıt tamamlandı', 'E-posta doğrulama bağlantısı gönderildi.', 'success');
  } catch (error) { setText('authResult', `Kayıt başarısız: ${error.message}`); reportHomeIssue('home.auth.register', error, { severity:'warning' }); }
}
async function resetPassword() {
  try { const email = safeText($('loginEmail')?.value); if (!email) throw new Error('E-posta adresi gerekli.'); await state.firebase.sendPasswordResetEmail(state.auth, email); setText('authResult', 'Şifre sıfırlama e-postası gönderildi.'); }
  catch (error) { setText('authResult', `İşlem başarısız: ${error.message}`); }
}
async function logout() { try { await state.firebase?.signOut?.(state.auth); closeDrawer(); toast('Çıkış yapıldı', 'Oturum kapatıldı.', 'info'); } catch (error) { reportHomeIssue('home.auth.logout', error, { severity:'warning' }); } }

function renderAccountModal() {
  const host = $('accountBody'); if (!host) return; const p = state.profile || {};
  host.innerHTML = `<div class="pm-stat-card"><h3>${escapeHtml(p.username || 'Oyuncu')}</h3><p>Kullanıcı ID: ${escapeHtml(p.uid || '—')}</p></div><div class="pm-stat-card"><h3>${fmt(p.balance || 0)} MC</h3><p>Güncel bakiye</p></div><div class="pm-stat-card"><h3>Seviye ${p.level || 1}</h3><p>İlerleme: %${Number(p.progressPercent || 0).toFixed(1)}</p></div><div class="pm-profile-tools"><button class="pm-tool-card" data-open-modal="avatarModal"><i class="fa-solid fa-user-circle"></i><span>Avatar Seç</span></button><button class="pm-tool-card" data-open-modal="frameModal"><i class="fa-solid fa-certificate"></i><span>Çerçeve Seç</span></button><button class="pm-tool-card" data-open-modal="emailModal"><i class="fa-solid fa-envelope"></i><span>E-posta Güncelle</span></button></div>`;
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
async function selectAvatar(src) { if (!ensureAuth('Avatar seçimi')) return; try { await apiFetch('/api/user/avatar', { method:'POST', body:JSON.stringify({ avatar: src }) }); state.profile.avatar = src; updateShell(); renderAvatarPicker(); toast('Avatar güncellendi', 'Profil avatarı kaydedildi.', 'success'); } catch (error) { toast('Avatar kaydedilemedi', error.message, 'error'); reportHomeIssue('home.avatar.save', error); } }
async function selectFrame(n) { if (!ensureAuth('Çerçeve seçimi')) return; const level = Number(state.profile?.level || 1); if (n > level) return toast('Çerçeve kilitli', `Bu çerçeve için Kilitli.`, 'warning'); try { await apiFetch('/api/user/frame', { method:'POST', body:JSON.stringify({ frame: n }) }); state.profile.selectedFrame = n; updateShell(); renderFramePicker(); toast('Çerçeve güncellendi', `Çerçeve ${n} aktif edildi.`, 'success'); } catch (error) { toast('Çerçeve kaydedilemedi', error.message, 'error'); reportHomeIssue('home.frame.save', error); } }
async function updateEmail() { try { if (!state.user || !state.firebaseReady) throw new Error('Oturum gerekli.'); const email = safeText($('emailUpdateInput')?.value); if (!email.includes('@')) throw new Error('Geçerli e-posta gir.'); await state.firebase.verifyBeforeUpdateEmail(state.user, email); setText('emailResult', 'Doğrulama bağlantısı gönderildi. Bağlantı onaylanınca e-posta güncellenir.'); } catch (error) { setText('emailResult', `İşlem başarısız: ${error.message}`); reportHomeIssue('home.email.update', error, { severity:'warning' }); } }
async function spinWheel() { if (!ensureAuth('Çark')) return; try { const payload = await apiFetch('/api/wheel/spin', { method:'POST', body:JSON.stringify({}) }); setText('wheelResult', `${fmt(payload.amount || payload.reward || payload.prize || 0)} MC kazandın.`); await refreshProfile(); } catch (error) { setText('wheelResult', error.status === 409 ? 'Bugünkü çark hakkın kullanılmış.' : `Çark hatası: ${error.message}`); } }
async function claimPromo() { if (!ensureAuth('Promo')) return; try { const code = safeText($('promoCodeInput')?.value).toUpperCase(); const payload = await apiFetch('/api/promo/claim', { method:'POST', body:JSON.stringify({ code }) }); setText('promoResult', `${escapeHtml(code)} kodu ile ${fmt(payload.amount || 0)} MC tanımlandı.`); await refreshProfile(); } catch (error) { setText('promoResult', `Promo kullanılamadı: ${error.message}`); } }
async function sendSupport() { if (!ensureAuth('Canlı destek')) return; try { await apiFetch('/api/support/message', { method:'POST', body:JSON.stringify({ subject: $('supportSubject')?.value || 'AnaSayfa destek', message: $('supportMessage')?.value || '', source:'home' }) }); setText('supportResult', 'Mesaj admin canlı destek ekranına iletildi.'); } catch (error) { setText('supportResult', `Gönderilemedi: ${error.message}`); } }
async function loadNotifications() { const host = $('notificationsBody'); if (!host) return; try { const payload = await apiFetch('/api/notifications', { timeoutMs:5000 }); const items = Array.isArray(payload.items) ? payload.items : []; if (!items.length) { host.innerHTML = `<i class="fa-solid fa-message-xmark"></i><p>Henüz bir kayıt bulunamadı.</p>`; return; } host.innerHTML = items.map(n=>`<article class="pm-stat-card"><h3>${escapeHtml(n.title || 'Bildirim')}</h3><p>${escapeHtml(n.message || '')}</p></article>`).join(''); } catch { host.innerHTML = `<i class="fa-solid fa-message-xmark"></i><p>Henüz bir kayıt bulunamadı.</p>`; } }
function renderSocial() {
  const host = $('socialContent'); if (!host) return;
  qsa('[data-social-view]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.socialView === state.socialView));
  const titles = { chat:'#Yerel Sohbet (TR)', dm:'DM Kutusu', search:'Mesaj Ara', requests:'İstek Listesi', add:'Arkadaş Ekleme', invites:'Oyun Daveti' };
  setText('socialTitle', titles[state.socialView] || '#Yerel Sohbet (TR)');
  const form = $('chatForm'); if (form) form.style.display = state.socialView === 'chat' ? '' : 'none';
  if (state.socialView === 'dm') {
    host.innerHTML = `<div class="pm-social-tool"><h3>DM Kutusu</h3><p>Aktif DM konuşmaların Render in-memory modelinden okunur.</p><button class="pm-btn pm-btn-primary" type="button" data-social-action="load-dm">DM Kutusunu Yenile</button><div class="pm-social-results" id="socialToolResults"></div></div>`;
    return;
  }
  if (state.socialView === 'search') {
    host.innerHTML = `<div class="pm-social-tool"><h3>Mesaj Ara</h3><p>Aktif in-memory mesajlarda arama yap.</p><label class="pm-field"><span>Aranacak metin</span><input id="socialSearchInput" maxlength="80" placeholder="Mesaj içinde ara" /></label><button class="pm-btn pm-btn-primary" type="button" data-social-action="search-message">Ara</button><div class="pm-social-results" id="socialToolResults"></div></div>`;
    return;
  }
  if (state.socialView === 'requests') {
    host.innerHTML = `<div class="pm-social-tool"><h3>İstek Listesi</h3><p>Gelen, giden ve kabul edilmiş arkadaşlık kayıtları burada gösterilir.</p><button class="pm-btn pm-btn-primary" type="button" data-social-action="load-requests">Listeyi Yenile</button><div class="pm-social-results" id="socialToolResults"></div></div>`;
    return;
  }
  if (state.socialView === 'add') {
    host.innerHTML = `<div class="pm-social-tool"><h3>Arkadaş Ekleme</h3><p>Kullanıcı UID veya profil kodu ile arkadaşlık isteği gönder.</p><label class="pm-field"><span>Kullanıcı UID</span><input id="friendTargetInput" maxlength="128" placeholder="Hedef kullanıcı UID" /></label><button class="pm-btn pm-btn-primary" type="button" data-social-action="send-friend">İstek Gönder</button><div class="pm-social-results" id="socialToolResults"></div></div>`;
    return;
  }
  if (state.socialView === 'invites') {
    host.innerHTML = `<div class="pm-social-tool"><h3>Oyun Daveti</h3><p>Satranç veya Pişti için arkadaşına oyun daveti gönder.</p><label class="pm-field"><span>Hedef Kullanıcı UID</span><input id="inviteTargetInput" maxlength="128" placeholder="Hedef kullanıcı UID" /></label><label class="pm-field"><span>Oyun</span><select id="inviteGameSelect"><option value="chess">Satranç</option><option value="pisti">Pişti</option></select></label><button class="pm-btn pm-btn-primary" type="button" data-social-action="send-invite">Davet Gönder</button><div class="pm-social-results" id="socialToolResults"></div></div>`;
    return;
  }
  if (!state.lobbyMessages.length) { host.innerHTML = `<div class="pm-empty-mini"><div><strong>Lobi şu an sakin</strong><p>İlk mesajı göndererek akışı sen başlatabilirsin.</p></div></div>`; return; }
  host.innerHTML = state.lobbyMessages.map(m => `<div class="pm-social-message ${m.uid === state.profile?.uid ? 'is-me' : ''}"><strong>${escapeHtml(m.username || 'Oyuncu')}</strong><p>${escapeHtml(m.text || m.message || '')}</p></div>`).join('');
  host.scrollTop = host.scrollHeight;
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
async function loadLobbyHistory() { try { const payload = await apiFetch('/api/social/chat/tr', { timeoutMs:5000 }); state.lobbyMessages = Array.isArray(payload.messages) ? payload.messages : []; renderSocial(); } catch (error) { reportHomeIssue('home.social.history', error, { severity:'warning' }); } }
async function connectSocialSocket() {
  if (state.socket || !state.user || !window.__PM_API__) { await loadLobbyHistory(); return; }
  try {
    state.token = await state.user.getIdToken();
    await window.__PM_API__.loadSocketClientScript();
    state.socket = window.io(apiBase(), { transports:['websocket','polling'], auth:{ token: state.token } });
    state.socket.on('chat:lobby_history', payload => { state.lobbyMessages = Array.isArray(payload.messages) ? payload.messages : []; renderSocial(); });
    state.socket.on('chat:lobby_new', msg => { state.lobbyMessages.push(msg); state.lobbyMessages = state.lobbyMessages.slice(-100); renderSocial(); });
    state.socket.emit('chat:lobby_load_history', {}, (payload) => { if (payload?.messages) { state.lobbyMessages = payload.messages; renderSocial(); } });
  } catch (error) { await loadLobbyHistory(); }
}
async function sendChat(event) {
  event.preventDefault(); if (!ensureAuth('Sohbet')) return; const input = $('chatInput'); const message = safeText(input?.value); if (!message) return;
  input.value = ''; updateChatCounter();
  const base = { message, text:message, username: state.profile?.username || 'Oyuncu', avatar: state.profile?.avatar || '' };
  if (state.socket?.connected) state.socket.emit('chat:lobby_send', base, (ack) => { if (!ack?.ok) toast('Mesaj gönderilemedi', ack?.message || ack?.error || '', 'warning'); });
  else { try { const payload = await apiFetch('/api/social/chat/tr', { method:'POST', body:JSON.stringify({ text:message }) }); state.lobbyMessages.push({ ...payload.message, username: state.profile?.username || 'Oyuncu' }); renderSocial(); } catch (error) { toast('Mesaj gönderilemedi', error.message, 'error'); } }
}
function updateChatCounter(){ setText('chatCounter', `${($('chatInput')?.value || '').length}/280`); }
function copyInvite(){ const text = $('inviteLink')?.textContent || 'https://playmatrix.com.tr/'; navigator.clipboard?.writeText(text).then(()=>toast('Kopyalandı', 'Davet bağlantısı panoya alındı.', 'success')).catch(()=>toast('Kopyalanamadı', text, 'warning')); }
function installEvents() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button,a'); if (!target) return;
    if (target.dataset.scrollTarget) { event.preventDefault(); if (target.closest('.pm-drawer-panel')) closeDrawer(); scrollToId(target.dataset.scrollTarget); return; }
    if (target.dataset.openModal) { event.preventDefault(); if (target.closest('.pm-drawer-panel')) closeDrawer(); openModal(target.dataset.openModal); return; }
    if (target.dataset.closeModal) { event.preventDefault(); closeModal(target.dataset.closeModal); return; }
    if (target.dataset.openAuth) { event.preventDefault(); openAuth(target.dataset.openAuth); return; }
    if (target.dataset.closeDrawer !== undefined) { event.preventDefault(); closeDrawer(); return; }
    if (target.dataset.profileAction === 'open') { event.preventDefault(); openDrawer(); return; }
    if (target.id === 'profileDrawerOpen') { event.preventDefault(); openDrawer(); return; }
    if (target.dataset.logout !== undefined) { event.preventDefault(); logout(); return; }
    if (target.dataset.playGame) { event.preventDefault(); const game = GAMES.find(g=>g.key===target.dataset.playGame); if (ensureAuth(game?.title || 'Oyun')) location.href = game.route; return; }
    if (target.dataset.leaderTab) { state.leaderTab = target.dataset.leaderTab; qsa('[data-leader-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.leaderTab === state.leaderTab)); renderLeaderboard(); return; }
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
  $('socialHomeBtn')?.addEventListener('click', () => closeModal('socialModal'));
  $('chatForm')?.addEventListener('submit', sendChat);
  $('chatInput')?.addEventListener('input', updateChatCounter);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { qsa('.pm-modal.is-open').forEach(m=>closeModal(m.id)); closeDrawer(); } });
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

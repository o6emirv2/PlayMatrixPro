import { loadFirebaseWebConfig } from '/public/firebase-runtime.js';
import { AVATAR_CATEGORIES, DEFAULT_AVATAR, getSafeAvatarSrc } from '/public/data/avatar-catalog.js';
import { getAccountLevelProgressFromXp, formatXpExact } from '/public/data/progression-policy.js';

const ROUTES = Object.freeze({ crash: '/games/crash', chess: '/games/chess', pisti: '/games/pisti', pattern: '/games/pattern-master', space: '/games/space-pro', snake: '/games/snake-pro' });
const GAMES = Object.freeze([
  { key:'crash', title:'Crash', category:'Online', icon:'fa-bolt', route:ROUTES.crash, desc:'Gerçek zamanlı çarpan oyunu. Backend kontrollü bakiye ve XP akışı.', colors:['#ff8a00','#ff4757'] },
  { key:'chess', title:'Satranç', category:'Online', icon:'fa-chess-knight', route:ROUTES.chess, desc:'Bot, bahissiz ve bahisli oda desteğiyle strateji oyunu.', colors:['#1463ff','#22d3ee'] },
  { key:'pisti', title:'Pişti', category:'Online', icon:'fa-layer-group', route:ROUTES.pisti, desc:'2 ve 4 kişilik online masa deneyimi.', colors:['#7c3cff','#ff4fd8'] },
  { key:'pattern', title:'Pattern Master', category:'Klasik', icon:'fa-brain', route:ROUTES.pattern, desc:'Skor odaklı hafıza ve refleks oyunu.', colors:['#16a34a','#7ee05f'] },
  { key:'space', title:'Space Pro', category:'Klasik', icon:'fa-rocket', route:ROUTES.space, desc:'Uzay temalı tek oyunculu beceri modu.', colors:['#0064ff','#67e8f9'] },
  { key:'snake', title:'Snake Pro', category:'Klasik', icon:'fa-staff-snake', route:ROUTES.snake, desc:'Klasik yılan oyununun PlayMatrix sürümü.', colors:['#10b981','#0ee486'] }
]);
const CHAT_POLICY = Object.freeze({ summaryLabel:'Global 7 Gün · DM 14 Gün', disclosure:'Sosyal Merkez geçici olarak kapalıdır; açıldığında global sohbet 7 gün, DM 14 gün görünür.' });
const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const qs = (sel, root = document) => root.querySelector(sel);
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const safeText = (value, fallback = '') => String(value ?? fallback).trim();
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const MODALS_REQUIRING_AUTH = new Set(['wheelModal','promoModal','inviteModal','supportModal','emailModal','avatarModal','frameModal','accountModal','accountStatsModal','betHistoryModal','sessionHistoryModal','notificationsModal','socialModal']);
const state = { firebase:null, auth:null, firebaseReady:false, user:null, token:'', profile:null, leaderboard:{ level:[], activity:[] }, leaderTab:'level', heroIndex:0, frameFilter:'all', currentAvatarCategory:'all', onboardingStep:'' };

window.__PLAYMATRIX_ROUTES__ = ROUTES;
window.__PLAYMATRIX_API_BASE__ = window.__PLAYMATRIX_API_BASE__ || window.__PLAYMATRIX_API_URL__ || window.location.origin;

function apiBase() {
  const raw = window.__PM_API__?.getApiBaseSync?.() || window.__PLAYMATRIX_API_URL__ || window.__PLAYMATRIX_API_BASE__ || window.location.origin;
  return String(raw || '').replace(/\/+$/, '').replace(/\/api$/i, '');
}
function apiUrl(path) { return `${apiBase()}${String(path).startsWith('/') ? path : `/${path}`}`; }
async function apiFetch(path, options = {}) {
  const headers = { Accept:'application/json', ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 7000);
  try {
    const response = await fetch(apiUrl(path), { ...options, headers, signal: controller.signal, credentials:'omit' });
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
function escapeHtml(value = '') { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function setText(id, value) { const el = $(id); if (el) el.textContent = value; }
function setHidden(id, hidden) { const el = $(id); if (el) el.hidden = !!hidden; }
function toast(title, message = '', type = 'info') {
  const stack = $('toastStack');
  if (!stack) return;
  const item = document.createElement('div');
  item.className = `pm-toast pm-toast-${type}`;
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ''}`;
  stack.append(item);
  setTimeout(() => { item.style.opacity = '0'; item.style.transform = 'translateY(8px)'; setTimeout(() => item.remove(), 260); }, 3600);
}
function reportHomeIssue(scope, error, extra = {}) {
  const message = safeText(error?.message || error || 'HOME_ERROR').slice(0, 400);
  if (/LOAD FAILED|FAILED TO FETCH|ABORT|AUTH_REQUIRED|USER_CANCELLED/i.test(message) && !/schema|undefined|contract/i.test(message)) return;
  const payload = { game:'home', scope, message, source:extra.source || 'script.js', path:location.pathname, reason:extra.reason || 'AnaSayfa bileşeni beklenmeyen hata yakaladı.', solution:extra.solution || 'AnaSayfa veri sözleşmesi, endpoint cevabı ve UI bileşeni kontrol edilmeli.', severity:extra.severity || 'error', ...extra };
  try { navigator.sendBeacon?.(apiUrl('/api/client/error'), new Blob([JSON.stringify(payload)], { type:'application/json' })); }
  catch (_) { fetch(apiUrl('/api/client/error'), { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload), keepalive:true }).catch(() => {}); }
}
function ensureAuth(action = 'Bu işlem') {
  if (state.user) return true;
  openAuth('login');
  toast('Oturum gerekli', `${action} için giriş yapmalısın.`, 'warning');
  return false;
}
function fallbackProgress(profile = {}) {
  const progression = profile.progression && typeof profile.progression === 'object' ? profile.progression : null;
  if (progression) return { level:Number(progression.level ?? progression.accountLevel ?? profile.level ?? profile.accountLevel ?? 1) || 1, xp:String(progression.xp ?? profile.xp ?? profile.accountXp ?? '0'), nextLevelXp:progression.nextLevelXp ?? progression.formattedNextLevelXp ?? '', progressPercent:clamp(progression.progressPercent ?? progression.accountLevelProgressPct ?? profile.progressPercent ?? profile.accountLevelProgressPct, 0, 100), formattedXp:progression.formattedXp || progression.accountXpLabel || formatXpExact(progression.xp ?? profile.xp ?? 0), formattedNextLevelXp:progression.formattedNextLevelXp || progression.accountLevelNextXpLabel || '' };
  const local = getAccountLevelProgressFromXp(profile.xp ?? profile.accountXp ?? 0);
  return { level:local.accountLevel, xp:local.accountXpExact, progressPercent:local.accountLevelProgressPct, formattedXp:local.accountXpFullLabel, formattedNextLevelXp:local.accountLevelNextXpLabel };
}
function normalizeProfile(raw = {}) {
  const profile = raw.profile || raw.user || raw.data || raw || {};
  const progress = fallbackProgress(profile);
  const username = safeText(profile.username || profile.displayName || profile.fullName || state.user?.displayName || state.user?.email?.split('@')[0], 'Oyuncu');
  const avatar = getSafeAvatarSrc(profile.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR);
  const selectedFrame = Math.max(0, Math.min(100, Math.trunc(Number(profile.selectedFrame || 0) || 0)));
  return { ...profile, username, avatar, selectedFrame, balance:Math.max(0, Number(profile.balance || profile.mc || 0) || 0), email:profile.email || state.user?.email || '', uid:profile.uid || state.user?.uid || '', progression:progress, level:progress.level, progressPercent:progress.progressPercent };
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
function isDrawerOpen() { return $('profileDrawer')?.classList.contains('is-open'); }
function lockOverlay() { document.body.classList.add('modal-open'); }
function unlockOverlayIfIdle() { if (!qs('.pm-modal.is-open') && !isDrawerOpen()) document.body.classList.remove('modal-open'); }
function openDrawer() {
  if (!state.user) return openAuth('login');
  const drawer = $('profileDrawer');
  drawer?.classList.add('is-open');
  drawer?.setAttribute('aria-hidden', 'false');
  lockOverlay();
}
function closeDrawer() {
  const drawer = $('profileDrawer');
  drawer?.classList.remove('is-open');
  drawer?.setAttribute('aria-hidden', 'true');
  unlockOverlayIfIdle();
}
function toggleDrawer() { isDrawerOpen() ? closeDrawer() : openDrawer(); }
function openModal(id) {
  if (MODALS_REQUIRING_AUTH.has(id) && !state.user) return openAuth('login');
  const el = $(id);
  if (!el) return;
  if (id === 'avatarModal') renderAvatarPicker();
  if (id === 'frameModal') renderFramePicker();
  if (id === 'accountModal') renderAccountModal();
  if (id === 'accountStatsModal') renderAccountStatsModal();
  if (id === 'betHistoryModal') loadRuntimeList('/api/home/bet-history', 'betHistoryBody', 'Bahis kaydı yok.');
  if (id === 'sessionHistoryModal') loadRuntimeList('/api/home/session-history', 'sessionHistoryBody', 'Oturum kaydı yok.');
  if (id === 'notificationsModal') loadNotifications();
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
  lockOverlay();
}
function closeModal(id, force = false) {
  if (!force && state.onboardingStep && (id === 'avatarModal' || id === 'frameModal')) {
    toast('Seçim zorunlu', 'Kayıt sonrası avatar ve çerçeve seçimi tamamlanmalı.', 'warning');
    return;
  }
  const el = $(id);
  if (!el) return;
  el.classList.remove('is-open');
  el.setAttribute('aria-hidden', 'true');
  unlockOverlayIfIdle();
}
function scrollToId(id) {
  closeDrawer();
  const el = $(id);
  if (!el) return;
  el.scrollIntoView({ behavior:'smooth', block:'start' });
  qsa('.pm-category-nav button,.pm-bottom-nav button').forEach((b) => b.classList.toggle('is-active', b.dataset.scrollTarget === id));
}
function renderHeroDots() {
  const dots = $('heroDots');
  if (!dots) return;
  dots.innerHTML = '';
  qsa('.pm-slide').forEach((_, index) => {
    const b = document.createElement('button');
    b.className = index === state.heroIndex ? 'is-active' : '';
    b.type = 'button';
    b.addEventListener('click', () => showHero(index));
    dots.append(b);
  });
}
function showHero(index) {
  const slides = qsa('.pm-slide');
  if (!slides.length) return;
  state.heroIndex = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => slide.classList.toggle('is-active', i === state.heroIndex));
  renderHeroDots();
}
function startHero() { renderHeroDots(); window.setInterval(() => showHero(state.heroIndex + 1), 5000); }
function renderGames() {
  const grid = $('gameGrid');
  if (!grid) return;
  grid.innerHTML = GAMES.map((game) => `<button class="pm-home-game-card" style="--card-a:${game.colors[0]};--card-b:${game.colors[1]}" data-play-game="${escapeHtml(game.key)}" type="button" aria-label="${escapeHtml(game.title)} oyununu aç"><span class="pm-game-big-icon"><i class="fa-solid ${game.icon}"></i></span><span class="pm-game-copy"><strong>${escapeHtml(game.title)}</strong><small>${escapeHtml(game.category)} · ${escapeHtml(game.desc)}</small></span><span class="pm-game-play">Oyunu Aç</span></button>`).join('');
}
function normalizeLeaderboard(payload) {
  const tabs = payload?.tabs || payload?.leaderboard?.tabs || {};
  const mapItem = (item, index) => {
    const p = normalizeProfile(item);
    return { ...p, rank:Number(item.rank || item.leaderboard?.rank || index + 1), metric:Number(item.leaderboard?.metricValue || item.monthlyActiveScore || item.accountXp || item.xp || 0) || 0 };
  };
  state.leaderboard.level = Array.isArray(tabs.level?.items) ? tabs.level.items.slice(0, 20).map(mapItem) : [];
  state.leaderboard.activity = Array.isArray(tabs.activity?.items) ? tabs.activity.items.slice(0, 20).map(mapItem) : [];
  const fallback = { username:'PlayMatrix', avatar:'/public/assets/images/logo.png', selectedFrame:100, level:1, progressPercent:0, metric:0, rank:1, uid:'playmatrix' };
  if (!state.leaderboard.level.length) state.leaderboard.level = [fallback];
  if (!state.leaderboard.activity.length) state.leaderboard.activity = [fallback];
}
function renderLeaderboard() {
  const host = $('leaderboardList');
  if (!host) return;
  const list = state.leaderboard[state.leaderTab] || [];
  host.innerHTML = list.map((item, index) => `<article class="pm-leader-row" data-player-uid="${escapeHtml(item.uid || '')}" data-player-index="${index}" tabindex="0" role="button"><span class="pm-rank">#${item.rank || index + 1}</span><div class="pm-leader-user"><span class="pm-leader-avatar"><img src="${escapeHtml(getSafeAvatarSrc(item.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR))}" alt=""></span><span class="pm-leader-name"><strong>${escapeHtml(item.username || 'Oyuncu')}</strong><span>Seviye ${Number(item.level || item.accountLevel || 1)}</span></span></div><strong class="pm-leader-score">${state.leaderTab === 'activity' ? fmt(item.monthlyActiveScore || item.metric || 0) : fmt(item.accountXp || item.xp || item.metric || 0)}</strong></article>`).join('');
}
async function loadPublicData() {
  try {
    const summary = await apiFetch('/api/home/summary', { timeoutMs:5500 }).catch(() => null);
    if (summary?.leaderboard) normalizeLeaderboard(summary.leaderboard);
    else normalizeLeaderboard(await apiFetch('/api/leaderboard', { timeoutMs:5500 }));
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
    const payload = await apiFetch('/api/user/me', { timeoutMs:6500 });
    state.profile = normalizeProfile(payload);
  } catch (error) {
    state.profile = normalizeProfile({ uid:state.user.uid, email:state.user.email, username:state.user.displayName || state.user.email?.split('@')[0], avatar:DEFAULT_AVATAR, balance:0, xp:0, selectedFrame:0 });
    reportHomeIssue('home.profile_load', error, { severity:'warning' });
  }
  updateShell();
  return state.profile;
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
  const fill = $('drawerProgressFill');
  if (fill) fill.style.width = `${clamp(p.progressPercent, 0, 100)}%`;
  renderPlainAvatar($('headerAvatar'), p);
  renderAvatar($('drawerAvatar'), p, 'pm-avatar-large');
  const invite = $('inviteLink');
  if (invite) invite.textContent = `https://playmatrix.com.tr/?ref=${encodeURIComponent(p.uid || 'playmatrix')}`;
}
async function initFirebase() {
  try {
    const config = await loadFirebaseWebConfig({ required:false, timeoutMs:5000 });
    if (!config) return false;
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const app = appMod.initializeApp(config);
    const auth = authMod.getAuth(app);
    state.firebase = { ...authMod, app };
    state.auth = auth;
    state.firebaseReady = true;
    authMod.onAuthStateChanged(auth, async (user) => { state.user = user || null; state.token = user ? await user.getIdToken().catch(() => '') : ''; if (user) await apiFetch('/api/home/session-touch', { method:'POST', body:JSON.stringify({ action:'login' }) }).catch(() => null); await refreshProfile(); loadPublicData().catch(() => null); });
    return true;
  } catch (error) {
    reportHomeIssue('home.firebase_boot', error, { severity:'warning', solution:'Firebase public runtime config ve CDN erişimi kontrol edilmeli.' });
    updateShell();
    return false;
  }
}
function openAuth(mode = 'login') { renderAuth(mode); openModal('authModal'); }
function renderAuth(mode = 'login') {
  const host = $('authView');
  if (!host) return;
  if (mode === 'register') {
    host.innerHTML = `<h2 class="pm-auth-title">Kayıt Ol</h2><h3 class="pm-auth-subtitle">Hesap Bilgileri</h3><label class="pm-field"><span>Kullanıcı Adı</span><input id="regUsername" placeholder="Kullanıcı adınızı girin" autocomplete="username"></label><label class="pm-field"><span>E-posta</span><input id="regEmail" type="email" placeholder="E-posta adresinizi girin" autocomplete="email"></label><label class="pm-field"><span>Promosyon Kodu</span><input id="regPromo" placeholder="Davet eden kişi yoksa boş bırakılabilir" autocomplete="off"></label><label class="pm-field"><span>Şifre</span><input id="regPassword" type="password" placeholder="Şifrenizi girin" autocomplete="new-password"></label><label class="pm-field"><span>Şifre Tekrarı</span><input id="regPassword2" type="password" placeholder="Şifrenizi tekrar girin" autocomplete="new-password"></label><label class="pm-check-row"><input id="regReward" type="checkbox" checked><span>50.000 MC kayıt ödülü istiyorum.</span></label><label class="pm-check-row"><input id="regAccept" type="checkbox"><span>19 yaşından büyük olduğumu, Kurallar ve Şartları kabul ettiğimi onaylıyorum.</span></label><button class="pm-btn pm-btn-primary pm-full" id="registerSubmit" type="button">Kayıt Ol</button><button class="pm-auth-link" type="button" data-open-auth="login">Zaten hesabım var</button><div class="pm-result" id="authResult"></div>`;
    $('registerSubmit')?.addEventListener('click', registerUser);
    return;
  }
  if (mode === 'password') {
    const label = sessionStorage.getItem('pm_login_identifier') || '';
    host.innerHTML = `<h2 class="pm-auth-title">Şifrenizi Giriniz</h2><label class="pm-field"><span>Şifre</span><input id="loginPassword" type="password" placeholder="Şifrenizi girin" autocomplete="current-password"></label><div class="pm-login-identity"><strong>Bu bilgi size mi ait?</strong><span><i class="fa-solid fa-user"></i>${escapeHtml(label)}</span></div><button class="pm-btn pm-btn-primary pm-full" id="passwordSubmit" type="button">Giriş Yap</button><button class="pm-auth-link" type="button" data-open-auth="login">‹ Önceki adıma geri dön</button><div class="pm-result" id="authResult"></div>`;
    $('passwordSubmit')?.addEventListener('click', loginUser);
    return;
  }
  host.innerHTML = `<h2 class="pm-auth-title">Giriş Yapın</h2><label class="pm-field"><span>Kullanıcı Adı veya E-posta</span><input id="loginIdentifier" placeholder="Kullanıcı adınızı veya e-posta adresinizi girin" autocomplete="username"></label><label class="pm-check-row"><input id="rememberMe" type="checkbox"><span>Beni Hatırla</span></label><button class="pm-btn pm-btn-primary pm-full" id="loginNext" type="button">Devam Et</button><button class="pm-auth-link" type="button" id="forgotPasswordBtn">Şifremi Unuttum</button><button class="pm-auth-link" type="button" data-open-auth="register">Yeni hesap oluştur</button><div class="pm-result" id="authResult"></div>`;
  $('loginNext')?.addEventListener('click', resolveLoginIdentifier);
  $('forgotPasswordBtn')?.addEventListener('click', resetPassword);
}
async function resolveLoginIdentifier() {
  try {
    const identifier = safeText($('loginIdentifier')?.value);
    if (!identifier) throw new Error('Kullanıcı adı veya e-posta gerekli.');
    const payload = await apiFetch('/api/auth/resolve-login', { method:'POST', body:JSON.stringify({ identifier }), timeoutMs:5000 });
    sessionStorage.setItem('pm_login_email', payload.email || identifier);
    sessionStorage.setItem('pm_login_identifier', identifier);
    renderAuth('password');
  } catch (error) {
    if (safeText($('loginIdentifier')?.value).includes('@')) {
      sessionStorage.setItem('pm_login_email', safeText($('loginIdentifier')?.value));
      sessionStorage.setItem('pm_login_identifier', safeText($('loginIdentifier')?.value));
      renderAuth('password');
    } else setText('authResult', `Giriş bilgisi bulunamadı: ${error.message}`);
  }
}
async function loginUser() {
  try {
    if (!state.firebaseReady) throw new Error('FIREBASE_NOT_READY');
    const email = sessionStorage.getItem('pm_login_email') || '';
    const password = $('loginPassword')?.value || '';
    await state.firebase.signInWithEmailAndPassword(state.auth, email, password);
    closeModal('authModal');
    toast('Giriş yapıldı', 'Oturum güvenli şekilde açıldı.', 'success');
  } catch (error) { setText('authResult', `Giriş başarısız: ${error.message}`); reportHomeIssue('home.auth.login', error, { severity:'warning' }); }
}
async function registerUser() {
  try {
    if (!state.firebaseReady) throw new Error('FIREBASE_NOT_READY');
    const username = safeText($('regUsername')?.value);
    const email = safeText($('regEmail')?.value);
    const promoCode = safeText($('regPromo')?.value).toUpperCase();
    const p1 = $('regPassword')?.value || '';
    const p2 = $('regPassword2')?.value || '';
    if (!username || !email || p1.length < 6 || p1 !== p2) throw new Error('Bilgileri kontrol et. Şifre en az 6 karakter olmalı ve iki şifre eşleşmeli.');
    if (!$('regAccept')?.checked) throw new Error('19 yaş onayı ve kurallar kabul edilmeli.');
    const cred = await state.firebase.createUserWithEmailAndPassword(state.auth, email, p1);
    await state.firebase.updateProfile?.(cred.user, { displayName:username }).catch(() => null);
    await state.firebase.sendEmailVerification?.(cred.user).catch(() => null);
    state.user = cred.user;
    state.token = await cred.user.getIdToken(true);
    await apiFetch('/api/profile/update', { method:'POST', body:JSON.stringify({ username, fullName:username, avatar:DEFAULT_AVATAR, selectedFrame:0, signupRewardRequested:true }) }).catch(() => null);
    if (promoCode) await apiFetch('/api/promo/claim', { method:'POST', body:JSON.stringify({ code:promoCode }) }).catch(() => null);
    await refreshProfile();
    state.onboardingStep = 'avatar';
    closeModal('authModal');
    openModal('avatarModal');
    toast('Kayıt tamamlandı', 'Şimdi zorunlu avatar ve çerçeve seçimini tamamla.', 'success');
  } catch (error) { setText('authResult', `Kayıt başarısız: ${error.message}`); reportHomeIssue('home.auth.register', error, { severity:'warning' }); }
}
async function resetPassword() {
  try {
    if (!state.firebaseReady) throw new Error('FIREBASE_NOT_READY');
    const identifier = safeText($('loginIdentifier')?.value || sessionStorage.getItem('pm_login_email'));
    const email = identifier.includes('@') ? identifier : (await apiFetch('/api/auth/resolve-login', { method:'POST', body:JSON.stringify({ identifier }) })).email;
    await state.firebase.sendPasswordResetEmail(state.auth, email);
    setText('authResult', 'Şifre sıfırlama e-postası gönderildi.');
  } catch (error) { setText('authResult', `İşlem başarısız: ${error.message}`); }
}
async function logout() {
  try {
    await apiFetch('/api/home/session-touch', { method:'POST', body:JSON.stringify({ action:'logout' }) }).catch(() => null);
    await state.firebase?.signOut?.(state.auth);
    closeDrawer();
    qsa('.pm-modal.is-open').forEach((m) => closeModal(m.id));
    toast('Çıkış yapıldı', 'Oturum kapatıldı.', 'info');
  } catch (error) { reportHomeIssue('home.auth.logout', error, { severity:'warning' }); }
}
function renderAccountModal() {
  const host = $('accountBody');
  if (!host) return;
  const p = state.profile || {};
  host.innerHTML = `<div class="pm-account-hero"><div class="pm-avatar-composite pm-avatar-large" id="accountAvatarPreview"></div><div><h3>${escapeHtml(p.username || 'Oyuncu')}</h3><p>ID: ${escapeHtml(p.uid || '—')}</p></div></div><div class="pm-account-fields"><div><span>Kullanıcı ID</span><strong>${escapeHtml(p.uid || '—')}</strong></div><div><span>Ad Soyad</span><strong>${escapeHtml(p.fullName || p.username || '—')}</strong></div><div><span>E-posta</span><strong>${escapeHtml(p.email || '—')}</strong></div><div><span>GSM</span><strong>${escapeHtml(p.phone || p.gsm || '—')}</strong></div><div><span>Dil</span><strong>TR</strong></div><div><span>Para Birimi</span><strong>MC</strong></div></div><div class="pm-profile-tools"><button class="pm-tool-card" data-open-modal="avatarModal" type="button"><i class="fa-solid fa-user-circle"></i><span>Avatar Seç</span></button><button class="pm-tool-card" data-open-modal="frameModal" type="button"><i class="fa-solid fa-certificate"></i><span>Çerçeve Seç</span></button><button class="pm-tool-card" data-open-modal="emailModal" type="button"><i class="fa-solid fa-envelope"></i><span>E-posta Güncelle</span></button><button class="pm-tool-card" data-open-modal="notificationsModal" type="button"><i class="fa-solid fa-bell"></i><span>Bildirimler</span></button></div>`;
  renderAvatar($('accountAvatarPreview'), p, 'pm-avatar-large');
}
function statsCards(profile = {}) {
  return `<div class="pm-stats-grid"><article><i class="fa-solid fa-layer-group"></i><strong>Seviye ${Number(profile.level || profile.accountLevel || 1)}</strong><span>Hesap Seviyesi</span></article><article><i class="fa-solid fa-chart-line"></i><strong>%${Number(profile.progressPercent || profile.accountLevelProgressPct || 0).toFixed(1)}</strong><span>Seviye İlerlemesi</span></article><article><i class="fa-solid fa-coins"></i><strong>${fmt(profile.balance || profile.mc || 0)} MC</strong><span>MC Bakiye</span></article><article><i class="fa-solid fa-signal"></i><strong>Bağlı</strong><span>Sosyal Durum</span></article><article><i class="fa-solid fa-gamepad"></i><strong>Aktif</strong><span>Oyun Profili</span></article><article><i class="fa-solid fa-server"></i><strong>Firebase</strong><span>Veri Kaynağı</span></article></div>`;
}
function renderAccountStatsModal() {
  const host = $('accountStatsBody');
  if (!host) return;
  host.innerHTML = statsCards(state.profile || {});
}
async function openPlayerStats(uid, index) {
  if (!ensureAuth('Oyuncu istatistikleri')) return;
  const list = state.leaderboard[state.leaderTab] || [];
  let profile = list[index] || list.find((p) => p.uid === uid) || null;
  try {
    if (uid) profile = normalizeProfile(await apiFetch(`/api/user-stats/${encodeURIComponent(uid)}`, { timeoutMs:5000 }));
  } catch (_) {}
  const host = $('playerStatsBody');
  if (host) host.innerHTML = `<div class="pm-account-hero"><div class="pm-avatar-composite pm-avatar-large" id="playerStatsAvatar"></div><div><h3>${escapeHtml(profile?.username || 'Oyuncu')}</h3><p>ID: ${escapeHtml(profile?.uid || '—')}</p></div></div>${statsCards(profile || {})}<button class="pm-btn pm-btn-primary pm-full" type="button" data-open-modal="socialModal">Arkadaş Ekle / Sosyal Merkez</button>`;
  renderAvatar($('playerStatsAvatar'), profile || {}, 'pm-avatar-large');
  openModal('playerStatsModal');
}
function renderAvatarPicker() {
  const filters = $('avatarFilters');
  const grid = $('avatarGrid');
  if (!filters || !grid) return;
  const cats = [{ id:'all', title:'Tümü', icon:'fa-border-all', items:AVATAR_CATEGORIES.flatMap((c) => c.items) }, ...AVATAR_CATEGORIES];
  filters.innerHTML = cats.map((c) => `<button class="${state.currentAvatarCategory === c.id ? 'is-active' : ''}" data-avatar-category="${escapeHtml(c.id)}" type="button"><i class="fa-solid ${c.icon || 'fa-circle'}"></i> ${escapeHtml(c.title)}</button>`).join('');
  const selectedCat = cats.find((c) => c.id === state.currentAvatarCategory) || cats[0];
  grid.innerHTML = selectedCat.items.map((item) => `<button class="pm-avatar-card ${state.profile?.avatar === item.src ? 'is-selected' : ''}" data-avatar-src="${escapeHtml(item.src)}" type="button"><img src="${escapeHtml(item.src)}" alt=""><span>Seç</span></button>`).join('');
}
function renderFramePicker() {
  const grid = $('frameGrid');
  if (!grid) return;
  const level = Number(state.profile?.level || 1);
  const selected = Number(state.profile?.selectedFrame || 0);
  const avatar = state.profile?.avatar || DEFAULT_AVATAR;
  const items = Array.from({ length:100 }, (_, i) => i + 1).filter((n) => state.frameFilter === 'all' || (state.frameFilter === 'open' ? n <= level : n > level));
  grid.innerHTML = items.map((n) => { const locked = n > level; return `<button class="pm-frame-card ${selected === n ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}" data-frame="${n}" type="button" ${locked ? 'aria-disabled="true"' : ''}><span class="pm-frame-lock"><i class="fa-solid ${locked ? 'fa-lock' : 'fa-check'}"></i></span><span class="pm-frame-preview"><span class="pm-avatar-base"><img src="${escapeHtml(avatar)}" alt=""></span><span class="pm-avatar-frame" style="background-image:url('/public/assets/frames/frame-${n}.png')"></span></span><strong>Seviye ${n}</strong><small>Çerçeve ${n}</small><span class="pm-frame-state">${locked ? 'Kilitli' : selected === n ? 'Aktif' : 'Kullanılabilir'}</span></button>`; }).join('');
}
async function selectAvatar(src) {
  if (!ensureAuth('Avatar seçimi')) return;
  try {
    await apiFetch('/api/user/avatar', { method:'POST', body:JSON.stringify({ avatar:src }) });
    state.profile = { ...(state.profile || {}), avatar:src };
    updateShell();
    renderAvatarPicker();
    toast('Avatar güncellendi', 'Profil avatarı kaydedildi.', 'success');
    if (state.onboardingStep === 'avatar') { state.onboardingStep = 'frame'; closeModal('avatarModal', true); openModal('frameModal'); }
  } catch (error) { toast('Avatar kaydedilemedi', error.message, 'error'); reportHomeIssue('home.avatar.save', error); }
}
async function selectFrame(n) {
  if (!ensureAuth('Çerçeve seçimi')) return;
  const level = Number(state.profile?.level || 1);
  if (n > level) return toast('Çerçeve kilitli', `Bu çerçeve için seviye ${n} gerekli.`, 'warning');
  try {
    await apiFetch('/api/user/frame', { method:'POST', body:JSON.stringify({ frame:n }) });
    state.profile = { ...(state.profile || {}), selectedFrame:n };
    updateShell();
    renderFramePicker();
    toast('Çerçeve güncellendi', `Çerçeve ${n} aktif edildi.`, 'success');
    if (state.onboardingStep === 'frame') { state.onboardingStep = ''; closeModal('frameModal', true); }
  } catch (error) { toast('Çerçeve kaydedilemedi', error.message, 'error'); reportHomeIssue('home.frame.save', error); }
}
async function updateEmail() {
  try {
    if (!state.user || !state.firebaseReady) throw new Error('Oturum gerekli.');
    const email = safeText($('emailUpdateInput')?.value);
    if (!email.includes('@')) throw new Error('Geçerli e-posta gir.');
    await state.firebase.verifyBeforeUpdateEmail(state.user, email);
    setText('emailResult', 'Doğrulama bağlantısı gönderildi. Bağlantı onaylanınca e-posta güncellenir.');
  } catch (error) { setText('emailResult', `İşlem başarısız: ${error.message}`); reportHomeIssue('home.email.update', error, { severity:'warning' }); }
}
async function spinWheel() {
  if (!ensureAuth('Çark')) return;
  const visual = $('wheelVisual');
  try {
    visual?.classList.add('is-spinning');
    const payload = await apiFetch('/api/wheel/spin', { method:'POST', body:JSON.stringify({}) });
    setText('wheelResult', `${fmt(payload.amount || payload.reward || payload.prize || 0)} MC kazandın.`);
    await refreshProfile();
  } catch (error) { setText('wheelResult', error.status === 409 ? 'Bugünkü çark hakkın kullanılmış.' : `Çark hatası: ${error.message}`); }
  finally { setTimeout(() => visual?.classList.remove('is-spinning'), 900); }
}
async function claimPromo() {
  if (!ensureAuth('Promo')) return;
  try {
    const code = safeText($('promoCodeInput')?.value).toUpperCase();
    const payload = await apiFetch('/api/promo/claim', { method:'POST', body:JSON.stringify({ code }) });
    setText('promoResult', `${escapeHtml(code)} kodu ile ${fmt(payload.amount || 0)} MC tanımlandı.`);
    await refreshProfile();
  } catch (error) { setText('promoResult', `Promo kullanılamadı: ${error.message}`); }
}
async function sendSupport() {
  if (!ensureAuth('Canlı destek')) return;
  try {
    await apiFetch('/api/support/message', { method:'POST', body:JSON.stringify({ subject:$('supportSubject')?.value || 'AnaSayfa destek', message:$('supportMessage')?.value || '', source:'home' }) });
    setText('supportResult', 'Mesaj admin canlı destek ekranına iletildi.');
  } catch (error) { setText('supportResult', `Gönderilemedi: ${error.message}`); }
}
async function loadNotifications() {
  const host = $('notificationsBody');
  if (!host) return;
  try {
    const payload = await apiFetch('/api/notifications', { timeoutMs:5000 });
    const items = Array.isArray(payload.items) ? payload.items : [];
    const dot = $('headerUnreadDot');
    if (dot) { const unread = Number(payload.unread || 0); dot.hidden = unread <= 0; dot.textContent = String(Math.min(99, unread)); }
    host.className = items.length ? 'pm-notification-list' : 'pm-empty-state';
    host.innerHTML = items.length ? items.map((n) => `<article class="pm-notification-card ${n.read ? '' : 'is-unread'}"><strong>${escapeHtml(n.title || 'Bildirim')}</strong><p>${escapeHtml(n.message || n.text || '')}</p><small>${new Date(Number(n.at || n.createdAt || Date.now())).toLocaleString('tr-TR')}</small></article>`).join('') : `<i class="fa-solid fa-message-xmark"></i><p>Henüz bir kayıt bulunamadı.</p>`;
  } catch { host.className = 'pm-empty-state'; host.innerHTML = `<i class="fa-solid fa-message-xmark"></i><p>Henüz bir kayıt bulunamadı.</p>`; }
}
async function clearNotifications() {
  try { await apiFetch('/api/notifications/clear', { method:'POST', body:JSON.stringify({}) }); await loadNotifications(); toast('Bildirimler silindi', '', 'success'); }
  catch (error) { toast('Bildirimler silinemedi', error.message, 'error'); }
}
async function readNotifications() {
  try { await apiFetch('/api/notifications/read-all', { method:'POST', body:JSON.stringify({}) }); await loadNotifications(); toast('Bildirimler okundu', '', 'success'); }
  catch (error) { toast('İşlem başarısız', error.message, 'error'); }
}
async function loadRuntimeList(endpoint, bodyId, emptyText) {
  const host = $(bodyId);
  if (!host) return;
  try {
    const payload = await apiFetch(endpoint, { timeoutMs:5000 });
    const items = Array.isArray(payload.items) ? payload.items : [];
    host.innerHTML = items.length ? items.map((item) => `<article class="pm-stat-card"><h3>${escapeHtml(item.title || item.game || item.action || 'Kayıt')}</h3><p>${escapeHtml(item.description || item.message || item.result || '')}</p><small>${new Date(Number(item.at || item.createdAt || Date.now())).toLocaleString('tr-TR')}</small></article>`).join('') : `<div class="pm-empty-state"><i class="fa-solid fa-box-open"></i><p>${escapeHtml(emptyText)}</p></div>`;
  } catch { host.innerHTML = `<div class="pm-empty-state"><i class="fa-solid fa-box-open"></i><p>${escapeHtml(emptyText)}</p></div>`; }
}
function copyInvite() {
  const text = $('inviteLink')?.textContent || 'https://playmatrix.com.tr/';
  navigator.clipboard?.writeText(text).then(() => toast('Kopyalandı', 'Davet bağlantısı panoya alındı.', 'success')).catch(() => toast('Kopyalanamadı', text, 'warning'));
}
function installEvents() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button,a,[role="button"]');
    if (!target) return;
    if (target.dataset.scrollTarget) { event.preventDefault(); scrollToId(target.dataset.scrollTarget); return; }
    if (target.dataset.openModal) { event.preventDefault(); if (target.closest('.pm-drawer-panel')) closeDrawer(); openModal(target.dataset.openModal); return; }
    if (target.dataset.closeModal) { event.preventDefault(); closeModal(target.dataset.closeModal); return; }
    if (target.dataset.openAuth) { event.preventDefault(); openAuth(target.dataset.openAuth); return; }
    if (target.dataset.closeDrawer !== undefined) { event.preventDefault(); closeDrawer(); return; }
    if (target.dataset.profileAction === 'open') { event.preventDefault(); toggleDrawer(); return; }
    if (target.id === 'profileDrawerOpen') { event.preventDefault(); toggleDrawer(); return; }
    if (target.dataset.logout !== undefined) { event.preventDefault(); logout(); return; }
    if (target.dataset.playGame) { event.preventDefault(); const game = GAMES.find((g) => g.key === target.dataset.playGame); if (ensureAuth(game?.title || 'Oyun')) location.href = game.route; return; }
    if (target.dataset.leaderTab) { state.leaderTab = target.dataset.leaderTab; qsa('[data-leader-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.leaderTab === state.leaderTab)); renderLeaderboard(); return; }
    if (target.closest('.pm-leader-row')) { const row = target.closest('.pm-leader-row'); openPlayerStats(row.dataset.playerUid || '', Number(row.dataset.playerIndex || 0)); return; }
    if (target.dataset.avatarCategory) { state.currentAvatarCategory = target.dataset.avatarCategory; renderAvatarPicker(); return; }
    if (target.dataset.avatarSrc) { selectAvatar(target.dataset.avatarSrc); return; }
    if (target.dataset.frameFilter) { state.frameFilter = target.dataset.frameFilter; qsa('[data-frame-filter]').forEach((b) => b.classList.toggle('is-active', b.dataset.frameFilter === state.frameFilter)); renderFramePicker(); return; }
    if (target.dataset.frame) { selectFrame(Number(target.dataset.frame)); return; }
    if (target.dataset.accordion) { const panel = $('footer-' + target.dataset.accordion); if (panel) panel.classList.toggle('is-open'); target.classList.toggle('is-open'); return; }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!isDrawerOpen()) return;
    if (!event.target.closest('.pm-drawer-panel') && !event.target.closest('#profileDrawerOpen')) closeDrawer();
  }, { capture:true });
  window.addEventListener('scroll', () => { if (isDrawerOpen()) closeDrawer(); }, { passive:true });
  window.addEventListener('pagehide', closeDrawer);
  $('brandButton')?.addEventListener('click', () => scrollToId('heroSection'));
  $('spinWheelBtn')?.addEventListener('click', spinWheel);
  $('claimPromoBtn')?.addEventListener('click', claimPromo);
  $('copyInviteBtn')?.addEventListener('click', copyInvite);
  $('sendSupportBtn')?.addEventListener('click', sendSupport);
  $('sendEmailUpdateBtn')?.addEventListener('click', updateEmail);
  $('clearNotificationsBtn')?.addEventListener('click', clearNotifications);
  $('readNotificationsBtn')?.addEventListener('click', readNotifications);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { qsa('.pm-modal.is-open').forEach((m) => closeModal(m.id)); closeDrawer(); } });
}
(function installTouchHardening(){
  let lastTouchAt = 0;
  document.addEventListener('touchend', (event) => { const now = Date.now(); if (now - lastTouchAt < 320 && !event.target.closest('input,textarea,select')) event.preventDefault(); lastTouchAt = now; }, { passive:false });
  document.addEventListener('contextmenu', (event) => { if (!event.target?.closest?.('input, textarea, select')) event.preventDefault(); });
})();
async function boot() {
  try {
    renderGames();
    startHero();
    installEvents();
    updateShell();
    await window.__PM_API__?.ensureApiBase?.().catch(() => null);
    await initFirebase();
    await loadPublicData();
  } catch (error) { reportHomeIssue('home.boot', error, { severity:'error' }); toast('AnaSayfa başlatma hatası', 'Bazı alanlar geçici olarak yüklenemedi.', 'error'); }
}
window.addEventListener('error', (event) => reportHomeIssue('home.window_error', event.error || event.message, { source:event.filename, line:event.lineno }));
window.addEventListener('unhandledrejection', (event) => reportHomeIssue('home.promise_rejection', event.reason || 'PROMISE_REJECTION', { source:'script.js' }));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();

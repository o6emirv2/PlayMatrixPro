const ROUTES = Object.freeze({
  games: '/#games',
  leaderboard: '/#leaderboard',
  promos: '/#promos',
  social: '/#social',
  profile: '/#profile',
  support: '/#support'
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  slide: 0,
  slides: [],
  timer: 0,
  touchStartX: 0,
  touchDeltaX: 0,
  balance: 0,
  user: null
};

function compactNumber(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0';
  const abs = Math.abs(numeric);
  const units = [
    [1e18, 'Qi'], [1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']
  ];
  for (const [limit, suffix] of units) {
    if (abs >= limit) {
      const formatted = (numeric / limit).toFixed(abs >= limit * 100 ? 0 : abs >= limit * 10 ? 1 : 2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
      return `${formatted}${suffix}`;
    }
  }
  return new Intl.NumberFormat('tr-TR').format(Math.trunc(numeric));
}

function readRuntimeUser() {
  const runtimeUser = window.__PM_RUNTIME?.auth?.currentUser || null;
  if (runtimeUser) return runtimeUser;
  try {
    const raw = localStorage.getItem('playmatrix:user') || localStorage.getItem('pm:user') || '';
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function readBalance(user) {
  const candidates = [
    user?.balance, user?.mc, user?.wallet?.mc, user?.profile?.balance, user?.economy?.balance,
    window.__PLAYMATRIX_USER__?.balance, window.__PLAYMATRIX_USER__?.mc
  ];
  const found = candidates.find((item) => Number.isFinite(Number(item)));
  return Number(found || 0);
}

function applyUserState() {
  const user = readRuntimeUser();
  state.user = user;
  state.balance = readBalance(user);

  const balanceEl = $('#balanceValue');
  if (balanceEl) {
    balanceEl.dataset.fullValue = String(state.balance);
    balanceEl.textContent = compactNumber(state.balance);
    balanceEl.title = `${new Intl.NumberFormat('tr-TR').format(state.balance)} MC`;
  }

  const avatar = $('#profileAvatar');
  const avatarUrl = user?.photoURL || user?.avatarUrl || user?.profile?.avatarUrl || '/public/assets/avatars/system/fallback.svg';
  if (avatar) avatar.src = avatarUrl;
}

function setSlide(index, { resetTimer = true } = {}) {
  if (!state.slides.length) return;
  state.slide = (index + state.slides.length) % state.slides.length;
  const track = $('#heroTrack');
  if (track) track.style.transform = `translate3d(${-state.slide * 100}%, 0, 0)`;
  $$('.pm-dot').forEach((dot, dotIndex) => {
    const active = dotIndex === state.slide;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-current', active ? 'true' : 'false');
  });
  if (resetTimer) startHeroTimer();
}

function startHeroTimer() {
  window.clearInterval(state.timer);
  state.timer = window.setInterval(() => setSlide(state.slide + 1, { resetTimer: false }), 5000);
}

function bindHeroSlider() {
  state.slides = $$('.pm-hero-slide');
  $$('.pm-dot').forEach((dot) => {
    dot.addEventListener('click', () => setSlide(Number(dot.dataset.slide || 0)));
  });

  const viewport = $('#heroViewport');
  if (!viewport) return;

  viewport.addEventListener('pointerdown', (event) => {
    state.touchStartX = event.clientX;
    state.touchDeltaX = 0;
    viewport.setPointerCapture?.(event.pointerId);
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!state.touchStartX) return;
    state.touchDeltaX = event.clientX - state.touchStartX;
  });

  viewport.addEventListener('pointerup', () => {
    if (Math.abs(state.touchDeltaX) > 42) {
      setSlide(state.slide + (state.touchDeltaX < 0 ? 1 : -1));
    }
    state.touchStartX = 0;
    state.touchDeltaX = 0;
  });

  startHeroTimer();
}

function openModal(title, text) {
  const modal = $('#pmModal');
  if (!modal) return;
  $('#pmModalTitle').textContent = title;
  $('#pmModalText').textContent = text;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = $('#pmModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function handleAction(action) {
  const messages = {
    games: ['Oyunlar', 'Oyun vitrini bir sonraki aşamada aktif oyun kartlarıyla bağlanacak.'],
    leaderboard: ['Liderlik', 'Liderlik ekranı canlı seviye ve aktivite verileriyle bağlanacak.'],
    promos: ['Promolar', 'Promosyon ve ödül işlemleri hesap oturumuna göre açılacak.'],
    social: ['Sosyal Merkez', 'Sosyal merkez bu tasarım omurgası üzerine ayrı panel olarak eklenecek.'],
    profile: ['Hesabım', 'Profil, avatar ve çerçeve işlemleri hesap verileriyle bağlanacak.'],
    support: ['Destek Talebi', 'Destek talebi formu güvenli oturum modeliyle açılacak.']
  };
  const [title, text] = messages[action] || ['PlayMatrix', 'Bu alan hazırlanıyor.'];
  openModal(title, text);
}

function bindNavigation() {
  document.addEventListener('click', (event) => {
    const scrollButton = event.target.closest('[data-scroll-target]');
    if (scrollButton) {
      const targetId = scrollButton.dataset.scrollTarget;
      const target = targetId === 'top' ? document.body : document.getElementById(targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      event.preventDefault();
      handleAction(actionButton.dataset.action);
    }
  });

  $$('[data-close-modal]').forEach((node) => node.addEventListener('click', closeModal));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });
}

function boot() {
  applyUserState();
  bindHeroSlider();
  bindNavigation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

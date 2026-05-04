import { bootHomeApplication } from '/public/js/home/app.js?v=pm25-final';

const PM_GAME_ROUTES = Object.freeze({
  crash: '/games/crash', chess: '/games/chess', satranc: '/games/chess', pisti: '/games/pisti',
  pattern: '/games/pattern-master', patternmaster: '/games/pattern-master', space: '/games/space-pro', spacepro: '/games/space-pro',
  snake: '/games/snake-pro', snakepro: '/games/snake-pro'
});

window.__PLAYMATRIX_ROUTES__ = PM_GAME_ROUTES;
window.__PLAYMATRIX_API_BASE__ = window.__PLAYMATRIX_API_BASE__ || window.location.origin;

function reportHomeIssue(scope, error, extra = {}) {
  try {
    if (typeof window.__PM_REPORT_CLIENT_ERROR__ === 'function') {
      window.__PM_REPORT_CLIENT_ERROR__(scope, error, { source: 'script.js', game: 'home', ...extra });
    }
  } catch (_) {}
}

function currentUser() {
  return window.__PM_RUNTIME?.auth?.currentUser || null;
}

function openAuthForGame(gameName = 'oyun') {
  if (typeof window.openPlayMatrixSheet === 'function') {
    window.openPlayMatrixSheet('auth', 'Hesabına giriş yap', `${gameName} için önce hesabına giriş yapmalısın.`);
    return true;
  }
  const loginButton = document.getElementById('loginBtn');
  if (loginButton) {
    loginButton.click();
    return true;
  }
  return false;
}

document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href]');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  const normalized = href.replace(/\/$/, '');
  const mapped = Object.values(PM_GAME_ROUTES).find((route) => route === normalized);
  if (!mapped) return;
  if (link.dataset.noNormalize !== '1') link.setAttribute('href', mapped);
  const card = link.closest('.game-card');
  const requiresAuth = link.dataset.access === 'auth' || card?.dataset.access === 'auth' || card?.querySelector('.mini-tag')?.textContent?.toLowerCase?.().includes('giriş gerekir');
  if (requiresAuth && !currentUser()) {
    event.preventDefault();
    event.stopPropagation();
    const gameName = card?.querySelector('.game-title')?.textContent?.trim() || 'Bu oyun';
    openAuthForGame(gameName);
  }
}, true);

bootHomeApplication().catch((error) => {
  console.error('[PlayMatrix] Home application boot failed', error);
  reportHomeIssue('home.boot', error, { type: 'boot', severity: 'error', path: location.pathname });
});

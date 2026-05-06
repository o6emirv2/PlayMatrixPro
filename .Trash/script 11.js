import { bootHomeApplication } from '/public/js/home/app.js';
import { HOME_GAME_ROUTES } from '/public/js/home/game-catalog.js';

const PM_GAME_ROUTES = HOME_GAME_ROUTES;

window.__PLAYMATRIX_ROUTES__ = PM_GAME_ROUTES;
window.__PLAYMATRIX_API_BASE__ = window.__PLAYMATRIX_API_BASE__ || window.location.origin;

function reportHomeIssue(scope, error, extra = {}) {
  try {
    if (typeof window.__PM_REPORT_CLIENT_ERROR__ === 'function') {
      window.__PM_REPORT_CLIENT_ERROR__(scope, error, { source: 'script.js', game: 'home', ...extra });
    }
  } catch (_) {}
}


bootHomeApplication().catch((error) => {
  console.error('[PlayMatrix] Home application boot failed', error);
  reportHomeIssue('home.boot', error, { type: 'boot', severity: 'error', path: location.pathname });
});

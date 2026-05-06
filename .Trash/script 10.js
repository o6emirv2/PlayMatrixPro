import { bootHomeApplication } from '/public/js/home/app.js';

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


bootHomeApplication().catch((error) => {
  console.error('[PlayMatrix] Home application boot failed', error);
  reportHomeIssue('home.boot', error, { type: 'boot', severity: 'error', path: location.pathname });
});

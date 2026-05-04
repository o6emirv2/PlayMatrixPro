import { bootHomeApplication } from '/public/js/home/app.js';

const PM_GAME_ROUTES = Object.freeze({
  crash: '/games/crash', chess: '/games/chess', satranc: '/games/chess', pisti: '/games/pisti',
  pattern: '/games/pattern-master', patternmaster: '/games/pattern-master', space: '/games/space-pro', spacepro: '/games/space-pro',
  snake: '/games/snake-pro', snakepro: '/games/snake-pro'
});

window.__PLAYMATRIX_ROUTES__ = PM_GAME_ROUTES;
window.__PLAYMATRIX_API_BASE__ = window.__PLAYMATRIX_API_BASE__ || window.location.origin;

window.addEventListener('error', (event) => {
  try { fetch('/api/client/error', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ game:'home', type:'error', scope:'home.window_error', message:event.message, source:event.filename, line:event.lineno, path:location.pathname }) }); } catch {}
});
window.addEventListener('unhandledrejection', (event) => {
  try { fetch('/api/client/error', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ game:'home', type:'unhandledrejection', scope:'home.promise_rejection', message:String(event.reason?.message || event.reason || ''), source:'script.js', path:location.pathname }) }); } catch {}
});

document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href]');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  const normalized = href.replace(/\/$/, '');
  const mapped = Object.values(PM_GAME_ROUTES).find(route => route === normalized);
  if (mapped && link.dataset.noNormalize !== '1') link.setAttribute('href', mapped);
});

bootHomeApplication().catch((error) => {
  console.error('[PlayMatrix] Home application boot failed', error);
  try { fetch('/api/client/error', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ game:'home', type:'boot', scope:'home.boot', message:String(error?.message || error || 'BOOT_FAILED'), source:'script.js', path:location.pathname, severity:'error' }) }); } catch {}
});

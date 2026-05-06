function callHome(action, ...args) {
  const api = window.PlayMatrixHome || {};
  const fn = api[action];
  if (typeof fn === 'function') return fn(...args);
  window.dispatchEvent(new CustomEvent('playmatrix:home-action', { detail: { action, args } }));
  return false;
}

window.openPlayMatrixSheet = window.openPlayMatrixSheet || ((name) => {
  const map = { auth: 'openAuth', profile: 'openAccountStats', stats: 'openAccountStats', wheel: 'openWheel', promo: 'openPromo', support: 'openSupport', social: 'openSocialCenter', avatar: 'openAvatar', frame: 'openFrame' };
  return callHome(map[name] || name);
});

window.closePlayMatrixSheet = window.closePlayMatrixSheet || (() => {
  document.querySelectorAll('[aria-hidden="false"].pm-modal, [aria-hidden="false"].pm-drawer').forEach((node) => node.setAttribute('aria-hidden', 'true'));
  document.body.classList.remove('pm-layer-open');
});

window.renderGameShowcaseSkeleton = window.renderGameShowcaseSkeleton || (() => null);
window.__PM_LEGACY_COMPAT__ = Object.freeze({ version: 'clean-55', source: 'premium-home-bridge' });

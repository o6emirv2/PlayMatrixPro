import { qsa } from './dom-utils.js';

export function installModalSafety(root = document) {
  const preventTextSelect = (event) => {
    if (event.target.closest('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
  };
  root.addEventListener('selectstart', preventTextSelect, { passive: false });
  root.addEventListener('dragstart', (event) => event.preventDefault(), { passive: false });
  qsa('button, a, [role="button"]', root).forEach((element) => {
    element.setAttribute('draggable', 'false');
    element.style.touchAction = 'manipulation';
  });
  let lastTouch = 0;
  root.addEventListener('touchend', (event) => {
    const now = Date.now();
    if (now - lastTouch < 280 && event.target.closest('button, a, [role="button"]')) event.preventDefault();
    lastTouch = now;
  }, { passive: false });
}

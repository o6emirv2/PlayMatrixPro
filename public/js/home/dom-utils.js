const SAFE_EVENT_NAME = 'playmatrix:home:error';

export function byId(id, root = document) {
  return root.getElementById ? root.getElementById(id) : document.getElementById(id);
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function safeText(value, fallback = '') {
  return String(value ?? fallback).replace(/[<>]/g, '').trim();
}

export function reportHomeError(scope, error, extra = {}) {
  const message = error instanceof Error ? error.message : String(error || 'UNKNOWN_ERROR');
  const payload = { scope: safeText(scope, 'home'), message: safeText(message, 'UNKNOWN_ERROR'), extra, timestamp: new Date().toISOString() };
  try { window.dispatchEvent(new CustomEvent(SAFE_EVENT_NAME, { detail: payload })); } catch (_) {}
  try { console.error('[PlayMatrixHome]', payload.scope, payload.message); } catch (_) {}
  return payload;
}

export function on(root, eventName, selector, handler) {
  root.addEventListener(eventName, (event) => {
    const target = event.target.closest(selector);
    if (!target || !root.contains(target)) return;
    handler(event, target);
  });
}

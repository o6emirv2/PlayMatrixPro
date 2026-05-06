const doc = typeof document !== "undefined" ? document : null;

export const qs = (selector, root = doc) => root?.querySelector?.(selector) || null;
export const qsa = (selector, root = doc) => Array.from(root?.querySelectorAll?.(selector) || []);
export const byId = (id) => (doc ? doc.getElementById(id) : null);

export function createElement(tagName, className = "", text = "") {
  const node = doc.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
  return node;
}

export function createEl(tagName, options = {}, children = []) {
  const node = doc.createElement(tagName);
  const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const className = opts.className || opts.class || '';
  if (className) node.className = String(className);
  if (opts.id) node.id = String(opts.id);
  if (opts.text !== undefined && opts.text !== null) node.textContent = String(opts.text);
  if (opts.html !== undefined && opts.html !== null) node.innerHTML = String(opts.html);
  if (opts.attrs && typeof opts.attrs === 'object') {
    Object.entries(opts.attrs).forEach(([key, value]) => {
      if (value === false || value === undefined || value === null) return;
      node.setAttribute(key, value === true ? '' : String(value));
    });
  }
  const childList = Array.isArray(children) ? children : [children];
  childList.forEach((child) => {
    if (child === undefined || child === null || child === false) return;
    node.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
  });
  return node;
}

export function bindIfPresent(id, eventName, handler, options) {
  const element = byId(id);
  if (!element || typeof handler !== "function") return null;
  element.addEventListener(eventName, handler, options);
  return element;
}

export function setHidden(elementOrId, hidden = true) {
  const element = typeof elementOrId === "string" ? byId(elementOrId) : elementOrId;
  if (!element) return null;
  element.hidden = !!hidden;
  element.classList.toggle("is-hidden", !!hidden);
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
  return element;
}

export function setExpanded(elementOrId, expanded = true) {
  const element = typeof elementOrId === "string" ? byId(elementOrId) : elementOrId;
  if (!element) return null;
  element.setAttribute("aria-expanded", expanded ? "true" : "false");
  return element;
}

export function safeText(value, fallback = "") {
  const normalized = value === undefined || value === null ? fallback : value;
  return String(normalized).replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

export function setText(id, value, fallback = "") {
  const element = byId(id);
  if (!element) return null;
  element.textContent = safeText(value, fallback);
  return element;
}

export function reportHomeError(scope, error, extra = {}) {
  try {
    if (typeof window.__PM_REPORT_CLIENT_ERROR__ === "function") {
      window.__PM_REPORT_CLIENT_ERROR__(scope, error, { source: "home-module", game: "home", ...extra });
      return;
    }
    const body = JSON.stringify({
      game: "home",
      scope,
      type: "home-module",
      message: error?.message || String(error || ""),
      stack: error?.stack || "",
      path: location.pathname,
      source: "home-module",
      ...extra
    });
    fetch("/api/client/error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch (_) {}
}

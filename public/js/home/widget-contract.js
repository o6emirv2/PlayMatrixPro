const WIDGET_STATES = new Set(["idle", "loading", "ready", "empty", "error"]);

function normalizeState(state) {
  const value = String(state || "idle").trim().toLowerCase();
  return WIDGET_STATES.has(value) ? value : "idle";
}

export function setWidgetState(target, state = "idle", message = "") {
  const node = typeof target === "string" ? document.getElementById(target) : target;
  if (!node) return null;
  const normalized = normalizeState(state);
  node.dataset.widgetState = normalized;
  node.setAttribute("data-widget-state", normalized);
  if (message !== undefined && message !== null && "textContent" in node) node.textContent = String(message);
  return node;
}

export function setWidgetBusy(target, busy = false) {
  const node = typeof target === "string" ? document.getElementById(target) : target;
  if (!node) return null;
  node.setAttribute("aria-busy", busy ? "true" : "false");
  node.classList.toggle("is-loading", !!busy);
  return node;
}

export function installHomeWidgetContract() {
  if (window.PMHomeWidgetContract) return window.PMHomeWidgetContract;
  const contract = Object.freeze({ setWidgetState, setWidgetBusy, states: Array.from(WIDGET_STATES) });
  window.PMHomeWidgetContract = contract;
  document.querySelectorAll("[data-home-widget]").forEach((node) => {
    if (!node.dataset.widgetState) node.dataset.widgetState = "idle";
  });
  return contract;
}

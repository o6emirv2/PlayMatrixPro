export async function crashApiFetch(endpoint, options = {}) {
  const api = window.__PM_API__;
  if (api && typeof api.fetchJson === "function") return api.fetchJson(endpoint, options);
  const base = String(window.__PM_API__?.getApiBaseSync?.() || window.__PM_RUNTIME?.apiBase || window.__PLAYMATRIX_API_URL__ || '').replace(/\/+$/, "");
  if (!base) throw new Error('API_BASE_MISSING');
  const response = await fetch(`${base}${endpoint}`, { cache: "no-store", credentials: "include", ...options });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `Crash API hatası (${response.status})`);
  return payload;
}

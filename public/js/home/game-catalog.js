export const HOME_GAME_ROUTES = Object.freeze({
  crash: "/static-games/crash",
  chess: "/static-games/chess",
  satranc: "/static-games/chess",
  pisti: "/static-games/pisti",
  pattern: "/games/pattern-master",
  patternmaster: "/games/pattern-master",
  space: "/games/space",
  spacepro: "/games/space",
  snake: "/games/snake",
  snakepro: "/games/snake"
});

export const HOME_GAMES = Object.freeze([
  { key: "crash", name: "Crash", category: "static", access: "public", url: HOME_GAME_ROUTES.crash, icon: "fa-arrow-trend-up" },
  { key: "satranc", name: "Satranç", category: "static", access: "public", url: HOME_GAME_ROUTES.satranc, icon: "fa-chess" },
  { key: "pisti", name: "Pişti", category: "static", access: "public", url: HOME_GAME_ROUTES.pisti, icon: "fa-layer-group" },
  { key: "patternmaster", name: "Pattern Master", category: "classic", access: "free", url: HOME_GAME_ROUTES.patternmaster, icon: "fa-shapes" },
  { key: "spacepro", name: "Space Pro", category: "classic", access: "free", url: HOME_GAME_ROUTES.spacepro, icon: "fa-user-astronaut" },
  { key: "snakepro", name: "Snake Pro", category: "classic", access: "free", url: HOME_GAME_ROUTES.snakepro, icon: "fa-wave-square" }
]);

export function normalizeGameRoute(rawUrl = "") {
  const normalized = String(rawUrl || "").trim().replace(/\.html(?:$|[?#])/i, "");
  const lower = decodeURIComponent(normalized).toLowerCase();
  if (lower.includes("crash")) return HOME_GAME_ROUTES.crash;
  if (lower.includes("satranc") || lower.includes("chess")) return HOME_GAME_ROUTES.satranc;
  if (lower.includes("pisti") || lower.includes("pişti")) return HOME_GAME_ROUTES.pisti;
  if (lower.includes("patternmaster")) return HOME_GAME_ROUTES.patternmaster;
  if (lower.includes("spacepro")) return HOME_GAME_ROUTES.spacepro;
  if (lower.includes("snakepro")) return HOME_GAME_ROUTES.snakepro;
  return normalized || "/";
}

export function installGameRouteNormalizer(root = document) {
  root.querySelectorAll?.('a[href*="Oyunlar/"]').forEach((anchor) => {
    const nextRoute = normalizeGameRoute(anchor.getAttribute("href"));
    if (nextRoute && nextRoute !== anchor.getAttribute("href")) anchor.setAttribute("href", nextRoute);
  });
  installOnlineGameAuthGuard(root);
}

export function getGameAccentClass(game = {}) {
  const key = String(game.key || game.name || "").toLowerCase();
  if (key.includes("crash")) return "game-card--crash";
  if (key.includes("satran") || key.includes("chess")) return "game-card--chess";
  if (key.includes("pişti") || key.includes("pisti")) return "game-card--pisti";
  if (key.includes("pattern")) return "game-card--pattern";
  if (key.includes("space")) return "game-card--space";
  if (key.includes("snake")) return "game-card--snake";
  return "game-card--default";
}


function getCurrentHomeUser() {
  try { return window.__PM_RUNTIME?.auth?.currentUser || null; } catch (_) { return null; }
}

function openHomeAuthSheet(gameName = 'Online oyun') {
  try { if (typeof window.setAuthMode === 'function') window.setAuthMode('login'); } catch (_) {}
  try {
    if (typeof window.openSheet === 'function') {
      window.openSheet('auth', 'Hesabına giriş yap', `${gameName} için önce hesabına giriş yapmalısın.`);
      return;
    }
  } catch (_) {}
  const loginButton = document.getElementById('loginBtn');
  if (loginButton && typeof loginButton.click === 'function') loginButton.click();
}

function installOnlineGameAuthGuard(root = document) {
  if (document.body?.dataset.onlineGameAuthGuardBound === '1') return;
  if (document.body) document.body.dataset.onlineGameAuthGuardBound = '1';
  root.addEventListener('click', (event) => {
    const trigger = event.target?.closest?.('a[href*="games"], [data-requires-auth="true"]');
    if (!trigger) return;
    const href = trigger.getAttribute?.('href') || '';
    if (!href && trigger.dataset.requiresAuth !== 'true') return;
    const normalized = normalizeGameRoute(href || trigger.dataset.href || '');
    const isOnline = /\/games\/(snake|space|pattern-master)$/i.test(normalized);
    if (!isOnline && trigger.dataset.requiresAuth !== 'true') return;
    if (getCurrentHomeUser()) return;
    event.preventDefault();
    event.stopPropagation();
    const gameName = trigger.dataset.gameName || trigger.closest?.('.game-card')?.querySelector?.('.game-title')?.textContent || 'Online oyun';
    openHomeAuthSheet(gameName);
  }, true);
}

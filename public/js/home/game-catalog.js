export const HOME_GAME_ROUTES = Object.freeze({
  crash: "/games/crash",
  chess: "/games/chess",
  satranc: "/games/chess",
  pisti: "/games/pisti",
  pattern: "/games/pattern-master",
  patternmaster: "/games/pattern-master",
  space: "/games/space-pro",
  spacepro: "/games/space-pro",
  snake: "/games/snake-pro",
  snakepro: "/games/snake-pro"
});

export const HOME_GAMES = Object.freeze([
  { key: "crash", name: "Crash", category: "online", access: "auth", url: HOME_GAME_ROUTES.crash, color: "69,162,255", icon: "fa-arrow-trend-up", desc: "Gerçek para içermeyen, refleks ve zamanlama odaklı hızlı tempo multiplier oyunu.", tags: ["Canlı Oyun", "Rekabet", "Hızlı Tur"], keywords: "crash multiplier online rocket roket çarpan" },
  { key: "satranc", name: "Satranç", category: "online", access: "auth", url: HOME_GAME_ROUTES.satranc, color: "104,178,255", icon: "fa-chess", desc: "Klasik satranç deneyimini modern arayüz ve giriş tabanlı rekabet akışıyla oyna.", tags: ["PvP", "Strateji", "Arena"], keywords: "chess online pvp satranç" },
  { key: "pisti", name: "Pişti", category: "online", access: "auth", url: HOME_GAME_ROUTES.pisti, color: "93,95,254", icon: "fa-layer-group", desc: "Kart takibi ve tempo yönetimi isteyen online pişti deneyimi.", tags: ["Kart", "Online", "Klasik"], keywords: "card kart multiplayer online pisti pişti" },
  { key: "patternmaster", name: "Pattern Master", category: "classic", access: "auth", url: HOME_GAME_ROUTES.patternmaster, color: "97,220,176", icon: "fa-shapes", desc: "Dikkat ve görsel hafıza odaklı ücretsiz pattern oyunu.", tags: ["Ücretsiz", "Zeka", "Refleks"], keywords: "arcade pattern master ücretsiz zeka" },
  { key: "spacepro", name: "Space Pro", category: "classic", access: "auth", url: HOME_GAME_ROUTES.spacepro, color: "103,170,255", icon: "fa-user-astronaut", desc: "Tarayıcıda anında açılan hafif ve hızlı klasik arcade uzay oyunu.", tags: ["Arcade", "Retro", "Ücretsiz"], keywords: "arcade pro space uzay" },
  { key: "snakepro", name: "Snake Pro", category: "classic", access: "auth", url: HOME_GAME_ROUTES.snakepro, color: "85,214,140", icon: "fa-wave-square", desc: "Retro hisli, akıcı ve ücretsiz snake deneyimi.", tags: ["Retro", "Arcade", "Ücretsiz"], keywords: "arcade pro retro snake yılan" }
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
    const sheetOpener = typeof window.openPlayMatrixSheet === 'function' ? window.openPlayMatrixSheet : window.openSheet;
    if (typeof sheetOpener === 'function') {
      sheetOpener('auth', 'Hesabına giriş yap', `${gameName} için önce hesabına giriş yapmalısın.`);
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
    const trigger = event.target?.closest?.('[data-access="auth"], [data-requires-auth="true"]');
    if (!trigger) return;
    const href = trigger.getAttribute?.('href') || '';
    if (!href && trigger.dataset.requiresAuth !== 'true') return;
    const normalized = normalizeGameRoute(href || trigger.dataset.href || '');
    const isProtectedGame = /\/games\/(crash|chess|pisti|pattern-master|space-pro|snake-pro)$/i.test(normalized);
    if (!isProtectedGame && trigger.dataset.requiresAuth !== 'true' && trigger.dataset.access !== 'auth') return;
    if (getCurrentHomeUser()) return;
    event.preventDefault();
    event.stopPropagation();
    const gameName = trigger.dataset.gameName || trigger.closest?.('.game-card')?.querySelector?.('.game-title')?.textContent || 'Online oyun';
    openHomeAuthSheet(gameName);
  }, true);
}

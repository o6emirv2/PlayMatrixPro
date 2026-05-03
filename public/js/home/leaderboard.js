import { byId, createEl } from "./dom-utils.js";

function ensureEmptyState(node) {
  if (!node || node.children.length) return;
  node.appendChild(createEl("div", { class: "lb-empty", text: "Liderlik verisi hazırlanıyor." }));
}

function installLeaderboardStatsFallback() {
  if (document.body?.dataset.leaderboardStatsFallbackBound === '1') return;
  if (document.body) document.body.dataset.leaderboardStatsFallbackBound = '1';

  document.addEventListener('click', (event) => {
    const item = event.target?.closest?.('#leaderboardListArea .lb-item');
    if (!item || item.classList.contains('skeleton')) return;
    const uid = String(item.dataset.uid || item.dataset.playerUid || window.__PM_RUNTIME?.auth?.currentUser?.uid || '').trim();
    if (!uid || typeof window.showPlayerStats !== 'function') return;
    event.preventDefault();
    window.showPlayerStats(uid);
  }, true);
}

export function installLeaderboardGuards() {
  const area = byId("leaderboardListArea");
  if (!area) return;
  area.dataset.module = "leaderboard";
  area.querySelectorAll('.lb-item').forEach((item) => {
    if (!item.dataset.uid && window.__PM_RUNTIME?.auth?.currentUser?.uid) item.dataset.uid = window.__PM_RUNTIME.auth.currentUser.uid;
    if (item.tagName !== 'BUTTON') item.setAttribute('role', 'button');
    item.tabIndex = 0;
  });
  ensureEmptyState(area);
  installLeaderboardStatsFallback();
}

import { byId } from "./dom-utils.js";

export function setProgressBar(id, percent) {
  const node = byId(id);
  if (!node) return;
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  node.style.setProperty("--pm-progress", `${value}%`);
  node.dataset.progress = String(Math.round(value));
}

function openHomeModalById(id) {
  const modal = byId(id);
  if (!modal) return false;
  modal.hidden = false;
  modal.style.removeProperty('display');
  modal.classList.remove('is-closing');
  modal.classList.add('active', 'is-opening');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  window.setTimeout(() => modal.classList.remove('is-opening'), 180);
  return true;
}

function closeHomeModalById(id) {
  const modal = byId(id);
  if (!modal) return false;
  modal.classList.remove('active', 'is-opening');
  modal.classList.add('is-closing');
  modal.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    if (modal.classList.contains('is-closing')) {
      modal.classList.remove('is-closing');
      modal.hidden = true;
    }
    if (!document.querySelector('.ps-modal.active')) document.body.classList.remove('modal-open');
  }, 150);
  return true;
}

function installProfileModalFallbackDelegation() {
  if (document.body?.dataset.profileModalFallbackBound === '1') return;
  if (document.body) document.body.dataset.profileModalFallbackBound = '1';

  document.addEventListener('click', (event) => {
    const avatarButton = event.target?.closest?.('#openAvatarSelectionBtn');
    if (avatarButton) {
      event.preventDefault();
      if (typeof window.openAvatarSelectionModal === 'function') window.openAvatarSelectionModal();
      else if (typeof window.openAvatarPicker === 'function') window.openAvatarPicker();
      else openHomeModalById('avatarPickerModal');
      return;
    }

    const frameButton = event.target?.closest?.('#openFrameSelectionBtn');
    if (frameButton) {
      event.preventDefault();
      if (typeof window.openFrameSelectionModal === 'function') window.openFrameSelectionModal();
      else if (typeof window.openFramePicker === 'function') window.openFramePicker();
      else openHomeModalById('framePickerModal');
      return;
    }

    const statsTarget = event.target?.closest?.('#leaderboardListArea .lb-item, [data-open-player-stats], [data-player-uid]');
    if (statsTarget && !statsTarget.classList?.contains('skeleton')) {
      const uid = String(statsTarget.dataset.uid || statsTarget.dataset.playerUid || window.__PM_RUNTIME?.auth?.currentUser?.uid || '').trim();
      if (uid && typeof window.showPlayerStats === 'function') {
        event.preventDefault();
        window.showPlayerStats(uid);
      }
    }
  }, true);

  document.addEventListener('click', (event) => {
    const closeButton = event.target?.closest?.('[data-pm-action="closeAvatarPicker"], [data-pm-action="closeFramePicker"]');
    if (!closeButton) return;
    const action = closeButton.dataset.pmAction;
    if (action === 'closeAvatarPicker') {
      event.preventDefault();
      if (typeof window.closeAvatarPicker === 'function') window.closeAvatarPicker();
      else closeHomeModalById('avatarPickerModal');
    }
    if (action === 'closeFramePicker') {
      event.preventDefault();
      if (typeof window.closeFramePicker === 'function') window.closeFramePicker();
      else closeHomeModalById('framePickerModal');
    }
  }, true);
}

export function installProfilePanelGuards() {
  ["profileProgressFill", "topProgressFill", "userProgressFill"].forEach((id) => setProgressBar(id, byId(id)?.dataset.progress || 0));
  installProfileModalFallbackDelegation();
}

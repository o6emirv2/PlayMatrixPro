const DEFAULT_ROOT_ID = 'framePickerModal';
const DEFAULT_CONTAINER_ID = 'framePickerContainer';
const DEFAULT_FALLBACK_AVATAR = '/public/assets/avatars/system/fallback.svg';
const FRAME_MAX_LEVEL = 100;
const FRAME_BATCH_SIZE = 18;

function normalizeFrameLevel(value = 0) {
  const parsed = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(FRAME_MAX_LEVEL, parsed));
}

function isFrameUnlocked(frameLevel = 0, accountLevel = 1) {
  const normalizedFrame = normalizeFrameLevel(frameLevel);
  if (normalizedFrame <= 0) return true;
  return normalizedFrame <= Math.max(1, normalizeFrameLevel(accountLevel));
}

function getSafeSelectedFrame(rawSelectedFrame = 0, currentLevel = 1) {
  const normalizedSelected = normalizeFrameLevel(rawSelectedFrame);
  return isFrameUnlocked(normalizedSelected, currentLevel) ? normalizedSelected : 0;
}

function createElement(tagName, className = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  return element;
}

function resolveFrameAssetIndex(level = 0) {
  if (window.PMAvatar?.getFrameAssetIndex) return window.PMAvatar.getFrameAssetIndex(level);
  const normalized = normalizeFrameLevel(level);
  return normalized <= 0 ? 0 : normalized;
}

function mountFramePreview(host, { avatar = DEFAULT_FALLBACK_AVATAR, frameLevel = 0, exactFrameIndex = null, size = 64, extraClass = 'pm-avatar--picker' } = {}) {
  if (!host) return null;
  if (window.PMAvatar?.mount) {
    return window.PMAvatar.mount(host, {
      avatarUrl: avatar || DEFAULT_FALLBACK_AVATAR,
      level: normalizeFrameLevel(frameLevel),
      exactFrameIndex: exactFrameIndex == null ? resolveFrameAssetIndex(frameLevel) : exactFrameIndex,
      sizePx: size,
      extraClass,
      alt: 'Çerçeve önizlemesi',
      sizeTag: 'frame-picker'
    });
  }
  const img = document.createElement('img');
  img.src = avatar || DEFAULT_FALLBACK_AVATAR;
  img.alt = 'Çerçeve önizlemesi';
  img.className = 'pm-frame-picker-fallback-img';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    if (img.dataset.fallbackApplied === 'true') return;
    img.dataset.fallbackApplied = 'true';
    img.src = DEFAULT_FALLBACK_AVATAR;
  });
  host.replaceChildren(img);
  return img;
}

function idle(callback) {
  if (typeof window.requestIdleCallback === 'function') return window.requestIdleCallback(callback, { timeout: 150 });
  return window.requestAnimationFrame(() => callback({ timeRemaining: () => 8 }));
}

export function createFramePicker({
  documentRef = document,
  rootId = DEFAULT_ROOT_ID,
  containerId = DEFAULT_CONTAINER_ID,
  fallbackAvatar = DEFAULT_FALLBACK_AVATAR,
  getSelectedFrame = () => 0,
  getCurrentLevel = () => 1,
  getCurrentAvatar = () => fallbackAvatar,
  onSelect = null,
  openModal = null,
  closeModal = null,
} = {}) {
  const root = () => documentRef.getElementById(rootId);
  const container = () => documentRef.getElementById(containerId);
  let renderToken = 0;

  function closeFramePicker() {
    renderToken += 1;
    if (typeof closeModal === 'function') closeModal(rootId);
    else root()?.classList.remove('active');
  }

  function getCardStatus(level, selectedFrame, currentLevel) {
    if (!isFrameUnlocked(level, currentLevel)) return 'Kilitli';
    if (level === selectedFrame) return 'Kullanımda';
    return 'Seç';
  }

  function refreshSummary(host, selectedFrame, currentLevel, avatar) {
    const title = host?.querySelector('[data-frame-summary-title]');
    const text = host?.querySelector('[data-frame-summary-text]');
    const preview = host?.querySelector('[data-frame-summary-preview]');
    if (title) title.textContent = selectedFrame > 0 ? `Seviye ${selectedFrame} Çerçevesi` : 'Çerçevesiz Görünüm';
    if (text) text.textContent = `Mevcut seviyen: ${currentLevel}. Kilitli çerçeveler pasif görünür; avatar netliği korunur.`;
    if (preview) mountFramePreview(preview, { avatar, frameLevel: selectedFrame, exactFrameIndex: resolveFrameAssetIndex(selectedFrame), size: 78, extraClass: 'pm-avatar--picker' });
  }

  function updateOneCard(card, selectedFrame, currentLevel) {
    const level = normalizeFrameLevel(card.dataset.frameLevel);
    const locked = !isFrameUnlocked(level, currentLevel);
    const selected = level === selectedFrame;
    card.classList.toggle('is-locked', locked);
    card.dataset.frameLocked = locked ? 'true' : 'false';
    card.classList.toggle('is-selected', selected);
    card.disabled = locked;
    card.tabIndex = locked ? -1 : 0;
    card.setAttribute('aria-disabled', locked ? 'true' : 'false');
    card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    const status = card.querySelector('.frame-picker-card-status');
    if (status) status.textContent = getCardStatus(level, selectedFrame, currentLevel);
  }

  function buildFrameCard(level, selectedFrame, currentLevel, avatar) {
    const normalizedLevel = normalizeFrameLevel(level);
    const isLocked = !isFrameUnlocked(normalizedLevel, currentLevel);
    const isSelected = normalizedLevel === selectedFrame;
    const frameAssetIndex = resolveFrameAssetIndex(normalizedLevel);
    const card = createElement('button', 'frame-picker-card');
    card.type = 'button';
    card.dataset.frameLevel = String(normalizedLevel);
    card.dataset.frameAssetIndex = String(frameAssetIndex);
    card.classList.toggle('is-locked', isLocked);
    card.dataset.frameLocked = isLocked ? 'true' : 'false';
    card.classList.toggle('is-selected', isSelected);
    card.disabled = isLocked;
    card.tabIndex = isLocked ? -1 : 0;
    card.setAttribute('aria-disabled', isLocked ? 'true' : 'false');
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    card.setAttribute('aria-label', normalizedLevel === 0 ? 'Çerçevesiz profil görünümü' : `Seviye ${normalizedLevel} çerçevesi`);
    if (isLocked) card.setAttribute('title', `Seviye ${normalizedLevel} kilitli. Açmak için hesap seviyen ${normalizedLevel} olmalı.`);

    const preview = createElement('span', 'frame-picker-preview');
    mountFramePreview(preview, { avatar, frameLevel: normalizedLevel, exactFrameIndex: frameAssetIndex, size: normalizedLevel === 0 ? 60 : 64 });

    const meta = createElement('span', 'frame-picker-meta');
    const title = createElement('strong', 'frame-picker-card-title');
    title.textContent = normalizedLevel === 0 ? 'Çerçevesiz' : `Seviye ${normalizedLevel}`;
    const status = createElement('span', 'frame-picker-card-status');
    status.textContent = getCardStatus(normalizedLevel, selectedFrame, currentLevel);
    const asset = createElement('span', 'frame-picker-card-asset');
    asset.textContent = frameAssetIndex > 0 ? `Çerçeve ${frameAssetIndex}` : 'Standart';
    meta.append(title, asset, status);
    card.append(preview, meta);

    if (!isLocked) {
      card.addEventListener('click', async () => {
        if (card.disabled) return;
        card.disabled = true;
        card.classList.add('is-saving');
        try {
          if (typeof onSelect === 'function') await onSelect(normalizedLevel);
          updateActiveSelection();
        } finally {
          card.classList.remove('is-saving');
        }
      });
    }
    return card;
  }

  function renderFrameOptions() {
    const host = container();
    if (!host) return null;
    const token = ++renderToken;
    const currentLevel = normalizeFrameLevel(getCurrentLevel());
    const selectedFrame = getSafeSelectedFrame(getSelectedFrame(), currentLevel);
    const avatar = getCurrentAvatar() || fallbackAvatar;
    host.replaceChildren();

    const summary = createElement('div', 'frame-picker-summary');
    const summaryPreview = createElement('div', 'frame-picker-summary-preview');
    summaryPreview.dataset.frameSummaryPreview = 'true';
    const summaryCopy = createElement('div', 'frame-picker-summary-copy');
    const summaryTitle = createElement('strong');
    summaryTitle.dataset.frameSummaryTitle = 'true';
    const summaryText = createElement('span');
    summaryText.dataset.frameSummaryText = 'true';
    summaryCopy.append(summaryTitle, summaryText);
    summary.append(summaryPreview, summaryCopy);

    const grid = createElement('div', 'frame-picker-grid');
    host.append(summary, grid);
    refreshSummary(host, selectedFrame, currentLevel, avatar);

    const levels = Array.from({ length: FRAME_MAX_LEVEL + 1 }, (_, level) => level);
    let index = 0;
    const renderBatch = () => {
      if (token !== renderToken) return;
      const fragment = documentRef.createDocumentFragment();
      const limit = Math.min(index + FRAME_BATCH_SIZE, levels.length);
      for (; index < limit; index += 1) fragment.appendChild(buildFrameCard(levels[index], selectedFrame, currentLevel, avatar));
      grid.appendChild(fragment);
      if (index < levels.length) idle(renderBatch);
    };
    renderBatch();
    return host;
  }

  function openFramePicker() {
    renderFrameOptions();
    if (typeof openModal === 'function') openModal(rootId);
    else root()?.classList.add('active');
    window.setTimeout(() => container()?.focus?.(), 30);
    return root();
  }

  function updateActiveSelection() {
    const host = container();
    if (!host) return;
    const currentLevel = normalizeFrameLevel(getCurrentLevel());
    const selectedFrame = getSafeSelectedFrame(getSelectedFrame(), currentLevel);
    const avatar = getCurrentAvatar() || fallbackAvatar;
    refreshSummary(host, selectedFrame, currentLevel, avatar);
    host.querySelectorAll('.frame-picker-card').forEach((card) => updateOneCard(card, selectedFrame, currentLevel));
  }

  return Object.freeze({ openFramePicker, closeFramePicker, renderFrameOptions, updateActiveSelection });
}

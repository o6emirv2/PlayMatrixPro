const BASE_STEP = 100;
const MAX_LEVEL = 100;

function buildThresholds() {
  const thresholds = [0, 0];
  let previousStep = BASE_STEP;
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    let step;
    if (level === 1) step = BASE_STEP;
    else if (level <= 30) step = previousStep * 2;
    else if (level <= 71) step = previousStep * 3;
    else if (level <= 86) step = previousStep * 5;
    else if (level <= 91) step = previousStep * 10;
    else if (level <= 99) step = previousStep * 15;
    else step = previousStep * 30;

    if (level === 99) step = previousStep * 30;
    thresholds[level + 1] = thresholds[level] + step;
    previousStep = step;
  }
  return thresholds;
}

const THRESHOLDS = buildThresholds();

function normalizeXp(xp) {
  const n = Number(xp);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function getProgression(xpValue = 0) {
  const xp = normalizeXp(xpValue);
  let level = 1;
  for (let l = 1; l <= MAX_LEVEL; l += 1) if (xp >= THRESHOLDS[l]) level = l;
  const current = THRESHOLDS[level] || 0;
  const next = THRESHOLDS[Math.min(MAX_LEVEL, level + 1)] || current;
  const span = Math.max(1, next - current);
  const pct = level >= MAX_LEVEL ? 100 : Math.max(0, Math.min(100, ((xp - current) / span) * 100));
  return {
    accountLevel: level,
    currentXp: xp,
    currentLevelXp: current,
    nextLevelXp: next,
    accountLevelProgressPct: Math.round(pct * 100) / 100,
    version: 'v10-clean-curve'
  };
}

module.exports = { THRESHOLDS, getProgression, normalizeXp, BASE_STEP, MAX_LEVEL };

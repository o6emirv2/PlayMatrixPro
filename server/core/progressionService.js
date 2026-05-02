const BASE_STEP = 100;
function buildThresholds() {
  const thresholds = [0, 0];
  let step = BASE_STEP;
  for (let level = 1; level < 100; level += 1) {
    thresholds[level + 1] = thresholds[level] + step;
    if (level < 30) step *= 2;
    else if (level === 30) step *= 2;
    else if (level < 71) step *= 3;
    else if (level < 86) step *= 5;
    else if (level < 91) step *= 10;
    else if (level < 99) step *= 15;
    else step *= 30;
  }
  return thresholds;
}
const THRESHOLDS = buildThresholds();
function normalizeXp(xp) { const n = Number(xp); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
function getProgression(xpValue = 0) {
  const xp = normalizeXp(xpValue);
  let level = 1;
  for (let l = 1; l <= 100; l += 1) if (xp >= THRESHOLDS[l]) level = l;
  const current = THRESHOLDS[level] || 0;
  const next = THRESHOLDS[Math.min(100, level + 1)] || current;
  const span = Math.max(1, next - current);
  const pct = level >= 100 ? 100 : Math.max(0, Math.min(100, ((xp - current) / span) * 100));
  return { accountLevel: level, currentXp: xp, currentLevelXp: current, nextLevelXp: next, accountLevelProgressPct: Math.round(pct * 100) / 100, version: 'v5' };
}
module.exports = { THRESHOLDS, getProgression, normalizeXp };

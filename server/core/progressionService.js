const BASE_TRANSITION_XP = 100n;
const MAX_LEVEL = 100;

function multiplierForTransition(level) {
  if (level >= 99) return 30n;
  if (level >= 92) return 15n;
  if (level >= 87) return 10n;
  if (level >= 72) return 5n;
  if (level >= 31) return 3n;
  return 2n;
}

function transitionCosts() {
  const costs = [0n, BASE_TRANSITION_XP];
  for (let level = 2; level < MAX_LEVEL; level += 1) {
    const previous = costs[level - 1];
    costs[level] = previous * multiplierForTransition(level - 1);
  }
  return costs;
}

const COSTS = transitionCosts();

function thresholdForLevel(level) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));
  let total = 0n;
  for (let current = 1; current < safeLevel; current += 1) total += COSTS[current];
  return total;
}

function toBigIntXp(value) {
  try { return BigInt(String(value ?? '0').replace(/[^0-9]/g, '') || '0'); }
  catch { return 0n; }
}

function calculateProgression(xpValue) {
  const xp = toBigIntXp(xpValue);
  let level = 1;
  while (level < MAX_LEVEL && xp >= thresholdForLevel(level + 1)) level += 1;
  const currentThreshold = thresholdForLevel(level);
  const nextThreshold = level >= MAX_LEVEL ? currentThreshold : thresholdForLevel(level + 1);
  const span = nextThreshold - currentThreshold;
  const gained = xp - currentThreshold;
  const progressPercent = level >= MAX_LEVEL || span === 0n ? 100 : Number((gained * 10000n) / span) / 100;
  return {
    level,
    maxLevel: MAX_LEVEL,
    xp: xp.toString(),
    currentLevelXp: currentThreshold.toString(),
    nextLevelXp: nextThreshold.toString(),
    progressPercent: Math.max(0, Math.min(100, progressPercent))
  };
}

module.exports = { calculateProgression, thresholdForLevel, multiplierForTransition };

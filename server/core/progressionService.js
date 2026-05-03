const ACCOUNT_LEVEL_CAP = 100;
const ACCOUNT_BASE_XP = 120;
const ACCOUNT_PROGRESSION_VERSION = 51;
const ACCOUNT_LEVEL_CURVE_MODE = 'PM_TIERED_MULTIPLIER_2_3_5_10_15_30_V51';

function normalizeXp(value = 0) {
  if (typeof value === 'bigint') return value > 0n ? value : 0n;
  const raw = String(value ?? '').trim();
  if (!raw) return 0n;
  if (/^\d+$/.test(raw)) return BigInt(raw);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0n;
  return BigInt(Math.floor(parsed));
}

function toSafeNumber(value = 0n) {
  const big = normalizeXp(value);
  if (big <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(big);
  const approx = Number(big.toString());
  return Number.isFinite(approx) ? approx : Number.MAX_SAFE_INTEGER;
}

function getStepMultiplier(level) {
  const safeLevel = Math.max(1, Math.min(99, Math.floor(Number(level) || 1)));
  if (safeLevel < 30) return 2n;
  if (safeLevel < 71) return 3n;
  if (safeLevel < 86) return 5n;
  if (safeLevel < 91) return 10n;
  if (safeLevel < 98) return 15n;
  if (safeLevel === 98) return 30n;
  return 1n;
}

function buildLevelSteps() {
  const steps = Array(ACCOUNT_LEVEL_CAP + 1).fill(0n);
  let step = BigInt(ACCOUNT_BASE_XP);
  for (let level = 1; level < ACCOUNT_LEVEL_CAP; level += 1) {
    steps[level] = step;
    step *= getStepMultiplier(level);
  }
  steps[ACCOUNT_LEVEL_CAP] = 0n;
  return steps;
}

function buildLevelThresholds() {
  const steps = buildLevelSteps();
  const thresholds = Array(ACCOUNT_LEVEL_CAP + 1).fill(0n);
  thresholds[1] = 0n;
  for (let level = 2; level <= ACCOUNT_LEVEL_CAP; level += 1) {
    thresholds[level] = thresholds[level - 1] + steps[level - 1];
  }
  return thresholds;
}

const LEVEL_STEPS = buildLevelSteps();
const LEVEL_THRESHOLDS = buildLevelThresholds();

function getLevelFromXp(xpValue = 0) {
  const xp = normalizeXp(xpValue);
  let low = 1;
  let high = ACCOUNT_LEVEL_CAP;
  let resolved = 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (xp >= LEVEL_THRESHOLDS[mid]) {
      resolved = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return resolved;
}

function getProgression(xpValue = 0) {
  const xpBig = normalizeXp(xpValue);
  const level = getLevelFromXp(xpBig);
  const isMaxLevel = level >= ACCOUNT_LEVEL_CAP;
  const currentLevelStart = LEVEL_THRESHOLDS[level] || 0n;
  const nextLevel = isMaxLevel ? currentLevelStart : (LEVEL_THRESHOLDS[level + 1] || currentLevelStart);
  const span = nextLevel > currentLevelStart ? nextLevel - currentLevelStart : 1n;
  const into = xpBig > currentLevelStart ? xpBig - currentLevelStart : 0n;
  const remaining = isMaxLevel ? 0n : (nextLevel > xpBig ? nextLevel - xpBig : 0n);
  const percent = isMaxLevel ? 100 : Math.max(0, Math.min(100, Number((into * 10000n) / span) / 100));
  return {
    level,
    xp: toSafeNumber(xpBig),
    xpExact: xpBig.toString(),
    currentLevelStartXp: toSafeNumber(currentLevelStart),
    currentLevelStartXpExact: currentLevelStart.toString(),
    nextLevelXp: toSafeNumber(nextLevel),
    nextLevelXpExact: nextLevel.toString(),
    xpIntoLevel: toSafeNumber(into),
    xpIntoLevelExact: into.toString(),
    xpToNextLevel: toSafeNumber(remaining),
    xpToNextLevelExact: remaining.toString(),
    progressPercent: Math.round(percent * 100) / 100,
    isMaxLevel,
    accountLevel: level,
    currentXp: toSafeNumber(xpBig),
    currentXpExact: xpBig.toString(),
    currentLevelXp: toSafeNumber(currentLevelStart),
    currentLevelXpExact: currentLevelStart.toString(),
    accountLevelProgressPct: Math.round(percent * 100) / 100,
    accountProgressionVersion: ACCOUNT_PROGRESSION_VERSION,
    accountLevelCurveMode: ACCOUNT_LEVEL_CURVE_MODE,
    version: 'v5.1'
  };
}

module.exports = {
  ACCOUNT_LEVEL_CAP,
  ACCOUNT_BASE_XP,
  ACCOUNT_PROGRESSION_VERSION,
  ACCOUNT_LEVEL_CURVE_MODE,
  LEVEL_STEPS,
  LEVEL_THRESHOLDS,
  buildLevelSteps,
  buildLevelThresholds,
  getLevelFromXp,
  getProgression,
  normalizeXp
};

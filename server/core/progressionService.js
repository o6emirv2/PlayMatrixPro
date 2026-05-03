const MAX_LEVEL = 100;
const BASE_LEVEL_STEP_XP = 250n;
const MULTIPLIERS = Object.freeze([
  { from: 1, to: 10, num: 135n, den: 100n },
  { from: 10, to: 30, num: 145n, den: 100n },
  { from: 30, to: 60, num: 155n, den: 100n },
  { from: 60, to: 80, num: 170n, den: 100n },
  { from: 80, to: 95, num: 190n, den: 100n },
  { from: 95, to: 100, num: 225n, den: 100n }
]);

function ceilDiv(a, b) { return (a + b - 1n) / b; }
function multiplierForTransition(level) {
  return MULTIPLIERS.find((range) => level >= range.from && level < range.to) || MULTIPLIERS[MULTIPLIERS.length - 1];
}
function normalizeXpBigInt(value = 0) {
  if (typeof value === 'bigint') return value > 0n ? value : 0n;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? BigInt(Math.floor(value)) : 0n;
  const raw = String(value ?? '0').replace(/[^0-9]/g, '');
  return raw ? BigInt(raw) : 0n;
}
function formatBigInt(value) {
  return normalizeXpBigInt(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function buildCurve() {
  const requiredStepByLevel = Array(MAX_LEVEL + 1).fill(0n);
  const totalXpByLevel = Array(MAX_LEVEL + 1).fill(0n);
  requiredStepByLevel[1] = BASE_LEVEL_STEP_XP;
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    const step = level === 1 ? BASE_LEVEL_STEP_XP : requiredStepByLevel[level];
    totalXpByLevel[level + 1] = totalXpByLevel[level] + step;
    const m = multiplierForTransition(level);
    requiredStepByLevel[level + 1] = ceilDiv(step * m.num, m.den);
    if (requiredStepByLevel[level + 1] < step) requiredStepByLevel[level + 1] = step;
  }
  return { requiredStepByLevel, totalXpByLevel };
}
const CURVE = buildCurve();
const THRESHOLDS = CURVE.totalXpByLevel.map((v) => Number(v <= BigInt(Number.MAX_SAFE_INTEGER) ? v : BigInt(Number.MAX_SAFE_INTEGER)));

function getProgression(xpValue = 0) {
  const xp = normalizeXpBigInt(xpValue);
  let level = 1;
  for (let candidate = 1; candidate <= MAX_LEVEL; candidate += 1) {
    if (xp >= CURVE.totalXpByLevel[candidate]) level = candidate;
    else break;
  }
  const isMaxLevel = level >= MAX_LEVEL;
  const currentLevelStartXp = CURVE.totalXpByLevel[level];
  const nextLevelXp = isMaxLevel ? currentLevelStartXp : CURVE.totalXpByLevel[level + 1];
  const xpIntoLevel = xp > currentLevelStartXp ? xp - currentLevelStartXp : 0n;
  const xpToNextLevel = isMaxLevel ? 0n : (nextLevelXp > xp ? nextLevelXp - xp : 0n);
  const span = nextLevelXp > currentLevelStartXp ? nextLevelXp - currentLevelStartXp : 1n;
  const progressPercent = isMaxLevel ? 100 : Number((xpIntoLevel * 10000n) / span) / 100;
  const safeNumber = (v) => v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : Number.MAX_SAFE_INTEGER;
  return {
    level,
    xp: xp.toString(),
    currentLevelStartXp: currentLevelStartXp.toString(),
    nextLevelXp: nextLevelXp.toString(),
    xpIntoLevel: xpIntoLevel.toString(),
    xpToNextLevel: xpToNextLevel.toString(),
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    isMaxLevel,
    formattedXp: formatBigInt(xp),
    formattedNextLevelXp: formatBigInt(nextLevelXp),
    formattedXpToNextLevel: formatBigInt(xpToNextLevel),
    accountLevel: level,
    currentXp: safeNumber(xp),
    accountLevelProgressPct: Math.max(0, Math.min(100, progressPercent)),
    version: 'playmatrix-progression-v1'
  };
}
module.exports = { MAX_LEVEL, BASE_LEVEL_STEP_XP, MULTIPLIERS, THRESHOLDS, normalizeXpBigInt, formatBigInt, getProgression };

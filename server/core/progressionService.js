'use strict';

const BASE_STEP_XP = 100n;
const MAX_LEVEL = 100;

function factorForTransition(currentLevel) {
  if (currentLevel >= 99) return 30n;
  if (currentLevel <= 30) return 2n;
  if (currentLevel <= 71) return 3n;
  if (currentLevel <= 86) return 5n;
  if (currentLevel <= 91) return 10n;
  return 15n;
}

function buildProgressionTable() {
  const table = [{ level: 1, totalXp: 0n, stepFromPrevious: 0n }];
  let step = BASE_STEP_XP;
  let total = 0n;
  for (let nextLevel = 2; nextLevel <= MAX_LEVEL; nextLevel += 1) {
    total += step;
    table.push({ level: nextLevel, totalXp: total, stepFromPrevious: step });
    if (nextLevel < MAX_LEVEL) {
      step *= factorForTransition(nextLevel);
    }
  }
  return Object.freeze(table);
}

const PROGRESSION_TABLE = buildProgressionTable();

function toBigIntXp(value) {
  if (typeof value === 'bigint') return value < 0n ? 0n : value;
  const text = String(value || '0').replace(/[^0-9]/g, '');
  if (!text) return 0n;
  return BigInt(text);
}

function asSafeNumber(big) {
  return big > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(big);
}

function ratioPercent(current, start, end) {
  if (end <= start) return 100;
  const done = current - start;
  const total = end - start;
  const scaled = Number((done * 10000n) / total) / 100;
  return Math.max(0, Math.min(100, scaled));
}

function getProgression(xpValue) {
  const xp = toBigIntXp(xpValue);
  let current = PROGRESSION_TABLE[0];
  for (const row of PROGRESSION_TABLE) {
    if (xp >= row.totalXp) current = row;
    else break;
  }
  const next = PROGRESSION_TABLE.find((row) => row.level === Math.min(MAX_LEVEL, current.level + 1)) || current;
  return {
    level: current.level,
    maxLevel: MAX_LEVEL,
    xp: xp.toString(),
    currentLevelXp: current.totalXp.toString(),
    nextLevelXp: next.totalXp.toString(),
    xpIntoLevel: (xp - current.totalXp).toString(),
    xpForNextLevel: next.level === current.level ? '0' : (next.totalXp - current.totalXp).toString(),
    progressPercent: next.level === current.level ? 100 : ratioPercent(xp, current.totalXp, next.totalXp),
    safeNumberView: {
      xp: asSafeNumber(xp),
      currentLevelXp: asSafeNumber(current.totalXp),
      nextLevelXp: asSafeNumber(next.totalXp)
    }
  };
}

function getTransitionTable() {
  return PROGRESSION_TABLE.map((row) => ({
    level: row.level,
    totalXp: row.totalXp.toString(),
    stepFromPrevious: row.stepFromPrevious.toString()
  }));
}

module.exports = { MAX_LEVEL, BASE_STEP_XP, getProgression, getTransitionTable, factorForTransition };

const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireAdmin } = require('../../core/security');
const { debitBalance, creditBalance, readBalance } = require('../../core/economyService');
const { getProgression, normalizeXpBigInt } = require('../../core/progressionService');
const { runtimeStore } = require('../../core/runtimeStore');
const { initFirebaseAdmin } = require('../../config/firebaseAdmin');

const router = express.Router();

const WAIT_MS = 5000;
const CRASHED_HOLD_MS = 2400;
const MAX_MULT = 10000;
const MIN_BET = 1;
const MAX_BET = 1_000_000;
const MIN_AUTO_CASHOUT = 2;
const MAX_AUTO_CASHOUT = 100;
const TICK_MS = 80;
const STATE_EMIT_MIN_MS = 120;
let lastStateEmitAt = 0;
const XP_UNIT_MC = 1000;
const XP_PER_UNIT = 10;
const MIN_MANUAL_XP_CASHOUT_MULT = 1.50;
const RISK_DOC_COLLECTION = 'gameConfig';
const RISK_DOC_ID = 'crash';

const now = () => Date.now();
const round = (value, digits = 2) => Number((Number(value) || 0).toFixed(digits));
const uidOf = (req) => String(req.user?.uid || '');
const hashPlayerKey = (uid, roundId = '') => crypto.createHash('sha256').update(`${roundId}:${uid || ''}`).digest('hex').slice(0, 12);

const DEFAULT_RISK = Object.freeze([
  { min: 1.01, max: 1.50, weight: 34 },
  { min: 1.51, max: 2.00, weight: 26 },
  { min: 2.01, max: 5.00, weight: 18 },
  { min: 5.01, max: 10.00, weight: 10 },
  { min: 10.01, max: 50.00, weight: 7 },
  { min: 50.01, max: 100.00, weight: 3 },
  { min: 100.01, max: 1000.00, weight: 1.5 },
  { min: 1000.01, max: 10000.00, weight: 0.5 }
]);

const state = {
  phase: 'COUNTDOWN',
  roundId: '',
  crashPoint: 1.01,
  startedAt: 0,
  countdownUntil: 0,
  multiplier: 1,
  bets: new Map(),
  history: [],
  risk: validateRiskTable(DEFAULT_RISK, { useDefaultOnInvalid: true }).rows,
  riskLoaded: false,
  riskLoadPromise: null,
  roundStartPromise: null,
  io: null,
  timer: null,
  autoTimers: new Map()
};

function makeHttpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function secureRandomFloat() {
  const bytes = crypto.randomBytes(6).readUIntBE(0, 6);
  return bytes / 0x1000000000000;
}

function safeDisplayName(user = {}) {
  const raw = String(user.name || user.displayName || user.username || user.email?.split('@')[0] || '').trim();
  if (raw) return raw.slice(0, 32);
  return 'Oyuncu';
}

function safeAvatarUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image/')) return raw.slice(0, 3000);
  if (raw.startsWith('/')) return raw.slice(0, 512);
  if (/^https:\/\//i.test(raw)) return raw.slice(0, 512);
  return '';
}

function parseBetAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw makeHttpError('INVALID_BET_AMOUNT', 400);
  if (!Number.isInteger(n)) throw makeHttpError('BET_AMOUNT_MUST_BE_INTEGER', 400);
  if (n < MIN_BET) throw makeHttpError('BET_AMOUNT_TOO_LOW', 400);
  if (n > MAX_BET) throw makeHttpError('BET_AMOUNT_TOO_HIGH', 400);
  return n;
}

function parseAutoCashout(value) {
  if (value === null || value === undefined || value === '' || Number(value) === 0) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) throw makeHttpError('INVALID_AUTO_CASHOUT', 400);
  if (n < MIN_AUTO_CASHOUT) throw makeHttpError('AUTO_CASHOUT_TOO_LOW', 400);
  if (n > MAX_AUTO_CASHOUT) throw makeHttpError('AUTO_CASHOUT_TOO_HIGH', 400);
  return round(n, 2);
}

function validateRiskTable(rows = [], { useDefaultOnInvalid = false } = {}) {
  const input = Array.isArray(rows) ? rows : [];
  const clean = input.map((row) => ({ min: round(row?.min, 2), max: round(row?.max, 2), weight: Number(row?.weight) }));
  const errors = [];
  if (!clean.length) errors.push('RISK_TABLE_EMPTY');
  clean.forEach((row, index) => {
    if (!Number.isFinite(row.min) || !Number.isFinite(row.max) || !Number.isFinite(row.weight)) errors.push(`ROW_${index + 1}_NOT_NUMERIC`);
    if (row.min < 1.01) errors.push(`ROW_${index + 1}_MIN_TOO_LOW`);
    if (row.max > MAX_MULT) errors.push(`ROW_${index + 1}_MAX_TOO_HIGH`);
    if (row.max < row.min) errors.push(`ROW_${index + 1}_MAX_LT_MIN`);
    if (row.weight <= 0) errors.push(`ROW_${index + 1}_WEIGHT_INVALID`);
  });
  const sorted = clean.slice().sort((a, b) => a.min - b.min || a.max - b.max);
  if (sorted.length) {
    if (round(sorted[0].min, 2) !== 1.01) errors.push('RISK_TABLE_MUST_START_AT_1_01');
    if (round(sorted[sorted.length - 1].max, 2) !== MAX_MULT) errors.push('RISK_TABLE_MUST_END_AT_10000');
  }
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].min <= sorted[i - 1].max) errors.push(`ROW_${i + 1}_OVERLAPS_PREVIOUS`);
    if (round(sorted[i].min, 2) !== round(sorted[i - 1].max + 0.01, 2)) errors.push(`ROW_${i + 1}_GAP_AFTER_PREVIOUS`);
  }
  const totalWeight = clean.reduce((sum, row) => sum + (Number.isFinite(row.weight) ? row.weight : 0), 0);
  if (totalWeight <= 0) errors.push('RISK_TABLE_WEIGHT_TOTAL_INVALID');
  if (errors.length) {
    if (useDefaultOnInvalid) return validateRiskTable(DEFAULT_RISK, { useDefaultOnInvalid: false });
    return { ok: false, rows: [], errors: [...new Set(errors)] };
  }
  return { ok: true, rows: sorted.map((row) => ({ ...row, probability: row.weight / totalWeight })), errors: [] };
}

async function loadRiskTable() {
  if (state.riskLoaded) return state.risk;
  if (state.riskLoadPromise) return state.riskLoadPromise;
  state.riskLoadPromise = (async () => {
    try {
      const { db } = initFirebaseAdmin();
      if (db) {
        const snap = await db.collection(RISK_DOC_COLLECTION).doc(RISK_DOC_ID).get();
        const parsed = validateRiskTable((snap.exists ? snap.data() : null)?.riskTable || [], { useDefaultOnInvalid: false });
        if (parsed.ok) state.risk = parsed.rows;
      }
    } catch (error) {
      console.error('[crash:risk-table:load:error]', JSON.stringify({ message: error.message }));
    } finally {
      state.riskLoaded = true;
      state.riskLoadPromise = null;
    }
    return state.risk;
  })();
  return state.riskLoadPromise;
}

async function persistRiskTable(rows, actorUid) {
  const { db } = initFirebaseAdmin();
  if (!db) return false;
  await db.collection(RISK_DOC_COLLECTION).doc(RISK_DOC_ID).set({
    riskTable: rows.map(({ min, max, weight }) => ({ min, max, weight })),
    updatedAt: now(),
    updatedBy: actorUid || 'unknown'
  }, { merge: true });
  return true;
}

function pickCrashPoint() {
  const rows = validateRiskTable(state.risk, { useDefaultOnInvalid: true }).rows;
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let roll = secureRandomFloat() * total;
  for (const row of rows) {
    roll -= row.weight;
    if (roll <= 0) return round(row.min + secureRandomFloat() * (row.max - row.min), 2);
  }
  return 1.25;
}

function multiplierAtElapsedMs(elapsedMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0) / 1000;
  return Math.min(MAX_MULT, Math.max(1, round(1 + elapsed * 0.10 + Math.pow(elapsed, 1.42) * 0.022, 2)));
}

function currentMultiplier() {
  if (state.phase !== 'FLYING') return round(state.multiplier, 2);
  return multiplierAtElapsedMs(now() - state.startedAt);
}

function estimateDelayForMultiplier(targetMultiplier) {
  const target = Math.max(1, Math.min(MAX_MULT, Number(targetMultiplier) || 1));
  const elapsedNow = Math.max(0, now() - state.startedAt);
  if (multiplierAtElapsedMs(elapsedNow) >= target) return 0;
  let low = elapsedNow;
  let high = Math.max(low + 250, 1000);
  while (high < 3600000 && multiplierAtElapsedMs(high) < target) high *= 1.45;
  for (let i = 0; i < 36; i += 1) {
    const mid = Math.floor((low + high) / 2);
    if (multiplierAtElapsedMs(mid) >= target) high = mid;
    else low = mid + 1;
  }
  return Math.max(0, Math.floor(high - elapsedNow));
}

function clearAutoTimer(bet) {
  if (!bet?.autoTimer) return;
  clearTimeout(bet.autoTimer);
  bet.autoTimer = null;
  state.autoTimers.delete(bet.betId);
}

function scheduleAutoCashout(bet) {
  if (!bet || !bet.autoCashout || bet.cashed || bet.lost || bet.refunded || state.phase !== 'FLYING') return;
  clearAutoTimer(bet);
  if (Number(bet.autoCashout) >= Number(state.crashPoint)) return;
  const delay = estimateDelayForMultiplier(bet.autoCashout);
  const timer = setTimeout(() => {
    cashoutBet(bet, { automatic: true, forcedMultiplier: bet.autoCashout }).catch((error) => {
      if (error?.message !== 'AUTO_CASHOUT_MISSED') console.error('[crash:auto-cashout:error]', JSON.stringify({ message: error.message }));
    });
  }, delay);
  timer.unref?.();
  bet.autoTimer = timer;
  state.autoTimers.set(bet.betId, timer);
}

function scheduleAutoCashouts() {
  for (const bet of state.bets.values()) scheduleAutoCashout(bet);
}

function clearAllAutoTimers() {
  for (const bet of state.bets.values()) clearAutoTimer(bet);
  for (const timer of state.autoTimers.values()) clearTimeout(timer);
  state.autoTimers.clear();
}

async function readCrashProfile(req) {
  const uid = uidOf(req);
  let profile = {};
  let hasFirestoreProfile = false;
  try {
    const { db } = initFirebaseAdmin();
    if (db && uid) {
      const snap = await db.collection('users').doc(uid).get();
      profile = snap.exists ? (snap.data() || {}) : {};
      hasFirestoreProfile = snap.exists;
    }
  } catch (error) {
    console.error('[crash:profile:read:error]', JSON.stringify({ message: error.message }));
  }
  const balance = Number.isFinite(Number(profile.balance)) ? Math.max(0, Number(profile.balance) || 0) : await readBalance(uid);
  const progression = getProgression(profile.accountXp ?? profile.xp ?? profile.accountLevelScore ?? 0);
  return {
    uid,
    username: safeDisplayName({ ...req.user, ...profile }),
    displayName: safeDisplayName({ ...req.user, ...profile }),
    avatar: safeAvatarUrl(profile.avatar || profile.photoURL || profile.avatarUrl || ''),
    photoURL: safeAvatarUrl(profile.photoURL || profile.avatar || profile.avatarUrl || ''),
    selectedFrame: Math.max(0, Math.min(100, Math.trunc(Number(profile.selectedFrame || profile.frame || 0) || 0))),
    accountLevel: progression.accountLevel,
    level: progression.accountLevel,
    accountXp: progression.currentXp,
    xp: progression.currentXp,
    accountLevelProgressPct: progression.accountLevelProgressPct,
    progression,
    balance,
    hasFirestoreProfile
  };
}

function crashXpForAmount(amount) {
  const units = Math.floor(Math.max(0, Number(amount) || 0) / XP_UNIT_MC);
  return units * XP_PER_UNIT;
}

function buildXpDecision(bet, { outcome = 'loss', cashoutMult = 0, automatic = false } = {}) {
  const amount = Number(bet?.amount || 0) || 0;
  const baseXp = crashXpForAmount(amount);
  let eligible = baseXp > 0;
  let reason = eligible ? 'CRASH_MC_USAGE_XP' : 'MINIMUM_1000_MC_REQUIRED';
  if (outcome === 'cashout' && !automatic && Number(cashoutMult || 0) < MIN_MANUAL_XP_CASHOUT_MULT) {
    eligible = false;
    reason = 'MANUAL_CASHOUT_BELOW_1_50_NO_XP';
  }
  return {
    eligible,
    xpAwarded: eligible ? baseXp : 0,
    reason,
    rule: `${XP_UNIT_MC} MC = ${XP_PER_UNIT} XP`,
    minimumManualCashoutForXp: MIN_MANUAL_XP_CASHOUT_MULT
  };
}

async function awardCrashXp(bet, options = {}) {
  if (!bet || !bet.uid) return { ok: false, xpAwarded: 0, reason: 'BET_OR_UID_MISSING', progression: getProgression(0) };
  if (bet.xpSettled) return bet.xpResult || { ok: true, duplicate: true, xpAwarded: 0, reason: 'ALREADY_SETTLED', progression: getProgression(0) };
  const decision = buildXpDecision(bet, options);
  const idempotencyKey = `crash:xp:${bet.roundId}:${bet.uid}:${bet.box}`;
  let output = {
    ok: true,
    idempotencyKey,
    outcome: options.outcome || 'loss',
    automatic: !!options.automatic,
    cashoutMult: round(options.cashoutMult || 0, 2),
    amount: bet.amount,
    ...decision,
    progression: null,
    levelUp: false
  };
  try {
    const { db } = initFirebaseAdmin();
    const outcomeKey = options.outcome === 'cashout' ? 'win' : 'loss';
    const xpToAdd = Math.max(0, Math.trunc(Number(output.xpAwarded || 0)));
    if (!db) {
      const key = `xp:${bet.uid}`;
      const current = normalizeXpBigInt(runtimeStore.temporary.get(key) || 0);
      const next = current + BigInt(xpToAdd);
      runtimeStore.temporary.set(key, next.toString(), 30 * 86400000);
      const statsKey = `gameStats:${bet.uid}`;
      const stats = runtimeStore.temporary.get(statsKey) || { total: {}, crash: {} };
      const crash = stats.crash || {};
      const total = stats.total || {};
      const patchCrash = {
        ...crash,
        rounds: Number(crash.rounds || 0) + 1,
        wins: Number(crash.wins || 0) + (outcomeKey === 'win' ? 1 : 0),
        losses: Number(crash.losses || 0) + (outcomeKey === 'loss' ? 1 : 0),
        totalBet: Number(crash.totalBet || 0) + Number(bet.amount || 0),
        totalCashout: Number(crash.totalCashout || 0) + Number(bet.payout || 0),
        bestMultiplier: Math.max(Number(crash.bestMultiplier || 0), Number(options.cashoutMult || 0))
      };
      patchCrash.winRatePct = patchCrash.rounds ? Math.round((patchCrash.wins / patchCrash.rounds) * 1000) / 10 : 0;
      const patchTotal = {
        ...total,
        rounds: Number(total.rounds || 0) + 1,
        wins: Number(total.wins || 0) + (outcomeKey === 'win' ? 1 : 0),
        losses: Number(total.losses || 0) + (outcomeKey === 'loss' ? 1 : 0)
      };
      patchTotal.winRatePct = patchTotal.rounds ? Math.round((patchTotal.wins / patchTotal.rounds) * 1000) / 10 : 0;
      runtimeStore.temporary.set(statsKey, { ...stats, crash: patchCrash, total: patchTotal }, 30 * 86400000);
      output.progression = getProgression(next);
    } else {
      const userRef = db.collection('users').doc(bet.uid);
      const idemRef = db.collection('idempotency').doc(idempotencyKey);
      await db.runTransaction(async (tx) => {
        const idem = await tx.get(idemRef);
        if (idem.exists) {
          output = { ...output, duplicate: true, ...(idem.data().result || {}) };
          return;
        }
        const snap = await tx.get(userRef);
        const data = snap.exists ? (snap.data() || {}) : {};
        const current = normalizeXpBigInt(data.accountXp ?? data.xp ?? 0);
        const before = getProgression(current);
        const next = current + BigInt(xpToAdd);
        const progression = getProgression(next);
        const gameStats = data.gameStats && typeof data.gameStats === 'object' ? data.gameStats : {};
        const crash = gameStats.crash && typeof gameStats.crash === 'object' ? gameStats.crash : {};
        const total = gameStats.total && typeof gameStats.total === 'object' ? gameStats.total : {};
        const patchCrash = {
          ...crash,
          rounds: Number(crash.rounds || 0) + 1,
          wins: Number(crash.wins || 0) + (outcomeKey === 'win' ? 1 : 0),
          losses: Number(crash.losses || 0) + (outcomeKey === 'loss' ? 1 : 0),
          totalBet: Number(crash.totalBet || 0) + Number(bet.amount || 0),
          totalCashout: Number(crash.totalCashout || 0) + Number(bet.payout || 0),
          bestMultiplier: Math.max(Number(crash.bestMultiplier || 0), Number(options.cashoutMult || 0))
        };
        patchCrash.winRatePct = patchCrash.rounds ? Math.round((patchCrash.wins / patchCrash.rounds) * 1000) / 10 : 0;
        const patchTotal = {
          ...total,
          rounds: Number(total.rounds || 0) + 1,
          wins: Number(total.wins || 0) + (outcomeKey === 'win' ? 1 : 0),
          losses: Number(total.losses || 0) + (outcomeKey === 'loss' ? 1 : 0)
        };
        patchTotal.winRatePct = patchTotal.rounds ? Math.round((patchTotal.wins / patchTotal.rounds) * 1000) / 10 : 0;
        output.progression = progression;
        output.levelBefore = before.accountLevel;
        output.levelAfter = progression.accountLevel;
        output.levelUp = progression.accountLevel > before.accountLevel;
        tx.set(userRef, {
          xp: progression.xp,
          accountXp: progression.currentXp,
          accountLevel: progression.accountLevel,
          level: progression.accountLevel,
          accountLevelProgressPct: progression.accountLevelProgressPct,
          progression,
          gameStats: { ...gameStats, crash: patchCrash, total: patchTotal },
          monthlyActiveScore: Number(data.monthlyActiveScore || 0) + 1,
          updatedAt: now()
        }, { merge: true });
        tx.set(idemRef, { key: idempotencyKey, type: 'crash-xp', uid: bet.uid, createdAt: now(), result: output }, { merge: false });
      });
    }
  } catch (error) {
    console.error('[crash:xp:error]', JSON.stringify({ message: error.message, uid: bet.uid, roundId: bet.roundId, box: bet.box }));
    output.ok = false;
    output.error = 'XP_SETTLEMENT_FAILED';
  }
  bet.xpSettled = true;
  bet.xpResult = output;
  return output;
}

function publicBet(bet, viewerUid = '') {
  const isMine = !!viewerUid && String(bet.uid) === String(viewerUid);
  return {
    playerKey: hashPlayerKey(bet.uid),
    isMine,
    username: isMine ? 'Sen' : (bet.username || 'Oyuncu'),
    avatar: bet.avatar || '',
    selectedFrame: Number(bet.selectedFrame || 0) || 0,
    betId: isMine ? bet.betId : '',
    box: bet.box,
    amount: bet.amount,
    bet: bet.amount,
    autoCashout: bet.autoCashout,
    autoCashoutEnabled: bet.autoCashout > 0,
    cashed: !!bet.cashed,
    lost: !!bet.lost,
    refunded: !!bet.refunded,
    cashingOut: isMine ? !!bet.cashingOut : false,
    refunding: isMine ? !!bet.refunding : false,
    cashoutMult: round(bet.cashoutMult || 0, 2),
    winAmount: bet.winAmount || 0,
    win: bet.winAmount || 0,
    settlementPending: !!bet.settlementPending,
    cashoutMode: bet.cashoutMode || '',
    xpAwarded: bet.xpResult?.xpAwarded || 0,
    xpResult: isMine ? (bet.xpResult || null) : (bet.xpResult ? { xpAwarded: bet.xpResult.xpAwarded || 0, reason: bet.xpResult.reason || '' } : null),
    roundId: bet.roundId
  };
}

function publicHistoryItem(item) {
  return { roundId: item.roundId, multiplier: round(item.multiplier, 2), currentMult: round(item.multiplier, 2), at: item.at };
}

function snapshot({ viewerUid = '' } = {}) {
  const multiplier = currentMultiplier();
  const activePlayers = [...state.bets.values()].map((bet) => publicBet(bet, viewerUid));
  const history = state.history.slice(-20).map(publicHistoryItem).reverse();
  return {
    ok: true,
    serverNow: now(),
    phase: state.phase,
    roundId: state.roundId,
    multiplier,
    currentMult: multiplier,
    crashPoint: state.phase === 'CRASHED' ? state.crashPoint : undefined,
    startedAt: state.startedAt,
    countdownUntil: state.countdownUntil,
    startTime: state.countdownUntil,
    waitMs: WAIT_MS,
    maxMultiplier: MAX_MULT,
    betLimits: { min: MIN_BET, max: MAX_BET },
    autoCashoutLimits: { min: MIN_AUTO_CASHOUT, max: MAX_AUTO_CASHOUT },
    history,
    activePlayers,
    activeBets: activePlayers
  };
}

function emitState(options = {}) {
  if (!state.io) return;
  const force = !!options.force;
  const ts = now();
  if (!force && state.phase === 'FLYING' && ts - lastStateEmitAt < STATE_EMIT_MIN_MS) return;
  lastStateEmitAt = ts;
  for (const socket of state.io.sockets.sockets.values()) {
    if (!socket.data?.crashSubscribed) continue;
    socket.emit('crash:update', snapshot({ viewerUid: socket.data?.crashUid || '' }));
  }
}

function clearTimer() {
  if (!state.timer) return;
  clearTimeout(state.timer);
  clearInterval(state.timer);
  state.timer = null;
}

function startCountdown() {
  clearAllAutoTimers();
  state.phase = 'COUNTDOWN';
  state.roundId = `cr_${now()}_${crypto.randomBytes(4).toString('hex')}`;
  state.crashPoint = pickCrashPoint();
  state.countdownUntil = now() + WAIT_MS;
  state.startedAt = 0;
  state.multiplier = 1;
  state.bets.clear();
  emitState({ force: true });
  clearTimer();
  state.timer = setTimeout(startFlying, WAIT_MS);
  state.timer.unref?.();
}

function startFlying() {
  state.phase = 'FLYING';
  state.startedAt = now();
  state.multiplier = 1;
  emitState({ force: true });
  scheduleAutoCashouts();
  clearTimer();
  state.timer = setInterval(tick, TICK_MS);
  state.timer.unref?.();
}

async function settleLosses() {
  for (const bet of state.bets.values()) {
    if (!bet.cashed && !bet.refunded && !bet.cashingOut && !bet.refunding) {
      clearAutoTimer(bet);
      bet.lost = true;
      bet.xpResult = await awardCrashXp(bet, { outcome: 'loss' });
    }
  }
}

async function endRound() {
  if (state.phase === 'CRASHED') return;
  state.multiplier = state.crashPoint;
  state.phase = 'CRASHED';
  await settleLosses();
  const item = { roundId: state.roundId, multiplier: state.crashPoint, at: now() };
  state.history.push(item);
  state.history = state.history.slice(-20);
  runtimeStore.crashRounds.set(item.roundId, item, 3600000);
  emitState({ force: true });
  clearTimer();
  state.timer = setTimeout(startCountdown, CRASHED_HOLD_MS);
  state.timer.unref?.();
}

async function cashoutBet(bet, { automatic = false, forcedMultiplier = null } = {}) {
  if (!bet) return { ok: false, error: 'BET_NOT_FOUND', statusCode: 404 };
  if (bet.refunded) return { ok: false, error: 'BET_REFUNDED', statusCode: 409 };
  if (bet.refunding) return { ok: false, error: 'REFUND_IN_PROGRESS', statusCode: 409 };
  if (bet.lost) return { ok: false, error: 'BET_ALREADY_LOST', statusCode: 409 };
  if (bet.cashed) return { ok: true, duplicate: true, bet, balance: bet.balance ?? await readBalance(bet.uid), xpResult: bet.xpResult || null };
  if (bet.cashingOut) return { ok: true, pending: true, bet, balance: bet.balance ?? await readBalance(bet.uid), xpResult: bet.xpResult || null };
  if (state.phase !== 'FLYING') return { ok: false, error: 'CASHOUT_NOT_AVAILABLE', statusCode: 409 };
  const liveMult = currentMultiplier();
  const requestedMult = forcedMultiplier !== null ? round(forcedMultiplier, 2) : liveMult;
  const mult = automatic ? round(bet.autoCashout || requestedMult, 2) : round(requestedMult, 2);
  if (automatic && (!bet.autoCashout || Number(bet.autoCashout) >= Number(state.crashPoint))) {
    bet.lost = true;
    return { ok: false, error: 'AUTO_CASHOUT_MISSED', statusCode: 409 };
  }
  if (!automatic && liveMult >= state.crashPoint) {
    bet.lost = true;
    return { ok: false, error: 'CASHOUT_TOO_LATE', statusCode: 409 };
  }
  clearAutoTimer(bet);
  bet.cashingOut = true;
  bet.cashed = true;
  bet.lost = false;
  bet.cashoutMult = mult;
  bet.winAmount = Math.floor(bet.amount * mult);
  bet.cashoutMode = automatic ? 'auto' : 'manual';
  bet.settlementPending = true;
  bet.cashoutAcceptedAt = now();
  emitState({ force: true });
  try {
    const result = await creditBalance({ uid: bet.uid, amount: bet.winAmount, reason: automatic ? 'crash-auto-cashout' : 'crash-cashout', idempotencyKey: `crash:cashout:${bet.roundId}:${bet.uid}:${bet.box}`, metadata: { roundId: bet.roundId, box: bet.box, multiplier: mult, automatic } });
    if (!result.ok) throw makeHttpError(result.error || 'CASHOUT_FAILED', 409);
    bet.balance = result.balance;
    bet.settlementPending = false;
    bet.cashingOut = false;
    bet.xpResult = await awardCrashXp(bet, { outcome: 'cashout', cashoutMult: mult, automatic });
    emitState({ force: true });
    return { ok: true, bet, balance: result.balance, xpResult: bet.xpResult };
  } catch (error) {
    bet.cashed = false;
    bet.settlementPending = false;
    bet.cashingOut = false;
    bet.winAmount = 0;
    bet.cashoutMult = 0;
    if (state.phase === 'CRASHED' && !bet.refunded) bet.lost = true;
    emitState({ force: true });
    throw error;
  }
}

function tick() {
  state.multiplier = currentMultiplier();
  // Auto cashout tek kaynaklıdır: scheduleAutoCashout() timer'ı tam hedef çarpana kurulur.
  // Tick içinde tekrar cashout denemesi yapılmaz; bu sayede 409 duplicate/pending kayıtları azalır.
  if (state.multiplier >= state.crashPoint) endRound().catch((error) => console.error('[crash:end:error]', JSON.stringify({ message: error.message })));
  else emitState();
}

async function ensureRoundStarted() {
  if (state.roundId) return;
  if (state.roundStartPromise) return state.roundStartPromise;
  state.roundStartPromise = (async () => { await loadRiskTable(); if (!state.roundId) startCountdown(); })().finally(() => { state.roundStartPromise = null; });
  return state.roundStartPromise;
}

router.get('/profile', requireAuth, async (req, res, next) => {
  try { const profile = await readCrashProfile(req); res.json({ ok: true, user: profile, profile, balance: profile.balance }); } catch (error) { next(error); }
});
router.get('/state', async (_req, res, next) => { try { await ensureRoundStarted(); res.json(snapshot()); } catch (error) { next(error); } });
router.get('/resume', requireAuth, async (req, res, next) => {
  try {
    await ensureRoundStarted();
    const viewerUid = uidOf(req);
    const myBets = [...state.bets.values()].filter((bet) => bet.uid === viewerUid).map((bet) => publicBet(bet, viewerUid));
    const balance = await readBalance(viewerUid);
    res.json({ ...snapshot({ viewerUid }), balance, myBets, bets: myBets });
  } catch (error) { next(error); }
});
router.get('/active-bets', requireAuth, async (req, res, next) => {
  try {
    await ensureRoundStarted();
    const viewerUid = uidOf(req);
    const bets = [...state.bets.values()].filter((bet) => bet.uid === viewerUid && !bet.cashed && !bet.lost && !bet.refunded).map((bet) => publicBet(bet, viewerUid));
    res.json({ ok: true, hasActiveBet: bets.length > 0, hasRiskyBet: bets.some((bet) => !bet.autoCashout), bets });
  } catch (error) { next(error); }
});
router.post('/bet', requireAuth, async (req, res, next) => {
  try {
    await ensureRoundStarted();
    if (state.phase !== 'COUNTDOWN') return res.status(409).json({ ok: false, error: 'BET_WINDOW_CLOSED' });
    const uid = uidOf(req);
    const box = Math.max(1, Math.min(2, Math.trunc(Number(req.body.box) || 1)));
    const amount = parseBetAmount(req.body.amount);
    const autoCashout = parseAutoCashout(req.body.autoCashout);
    const key = `${state.roundId}:${uid}:${box}`;
    const existing = state.bets.get(key);
    if (existing) return res.json({ ok: true, duplicate: true, bet: publicBet(existing, uid), balance: await readBalance(uid), roundId: state.roundId });
    const debit = await debitBalance({ uid, amount, reason: 'crash-bet', idempotencyKey: `crash:bet:${key}`, metadata: { roundId: state.roundId, box, autoCashout } });
    if (!debit.ok) return res.status(409).json(debit);
    const profile = await readCrashProfile(req).catch(() => ({ username: safeDisplayName(req.user), avatar: '', selectedFrame: 0 }));
    const bet = { betId: key, roundId: state.roundId, uid, username: profile.username || safeDisplayName(req.user), avatar: safeAvatarUrl(profile.avatar || profile.photoURL || ''), selectedFrame: Number(profile.selectedFrame || 0) || 0, box, amount, autoCashout, cashed: false, lost: false, refunded: false, refunding: false, cashingOut: false, settlementPending: false, xpSettled: false, xpResult: null, winAmount: 0, cashoutMult: 0, at: now() };
    state.bets.set(key, bet);
    emitState({ force: true });
    res.json({ ok: true, bet: publicBet(bet, uid), balance: debit.balance, roundId: state.roundId });
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message }); next(error); }
});
router.post('/cashout', requireAuth, async (req, res, next) => {
  try {
    await ensureRoundStarted();
    const uid = uidOf(req);
    const box = Math.max(1, Math.min(2, Math.trunc(Number(req.body.box) || 1)));
    const result = await cashoutBet(state.bets.get(`${state.roundId}:${uid}:${box}`));
    if (!result.ok) return res.status(result.statusCode || 409).json({ ok: false, error: result.error });
    const cashed = result.bet;
    const xp = result.xpResult || cashed.xpResult || null;
    const xpMessage = xp?.xpAwarded > 0
      ? ` +${xp.xpAwarded} XP işlendi.`
      : (xp?.reason === 'MANUAL_CASHOUT_BELOW_1_50_NO_XP' ? ' XP verilmedi: manuel çıkışta minimum 1.50x gerekir.' : '');
    res.json({ ok: true, bet: publicBet(cashed, uid), winAmount: cashed.winAmount, cashoutMult: cashed.cashoutMult, balance: result.balance, xpAwarded: xp?.xpAwarded || 0, xpResult: xp, progression: xp?.progression || null, resultSummary: { type: 'cashout', message: `${cashed.cashoutMult.toFixed(2)}x çıkış alındı.${xpMessage}`, xpResult: xp } });
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message }); next(error); }
});
router.post('/refund-active', requireAuth, async (req, res, next) => {
  try {
    await ensureRoundStarted();
    const uid = uidOf(req);
    let refunded = 0;
    const refundedBets = [];
    for (const [key, bet] of state.bets) {
      if (bet.uid !== uid || bet.cashed || bet.lost || bet.refunded || bet.cashingOut || bet.refunding || state.phase === 'CRASHED') continue;
      bet.refunding = true;
      try {
        const result = await creditBalance({ uid, amount: bet.amount, reason: 'crash-invite-refund', idempotencyKey: `crash:refund:${key}`, metadata: { roundId: bet.roundId, box: bet.box } });
        if (result.ok) { clearAutoTimer(bet); bet.refunded = true; refunded += bet.amount; refundedBets.push(publicBet(bet, uid)); state.bets.delete(key); }
      } finally { bet.refunding = false; }
    }
    emitState({ force: true });
    res.json({ ok: true, refunded, refundedBets, balance: await readBalance(uid), hasActiveBet: false });
  } catch (error) { next(error); }
});
router.get('/admin/risk-table', requireAuth, requireAdmin, async (_req, res, next) => { try { await loadRiskTable(); res.json({ ok: true, riskTable: state.risk }); } catch (error) { next(error); } });
router.post('/admin/risk-table', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const parsed = validateRiskTable(req.body.rows || req.body.riskTable || [], { useDefaultOnInvalid: false });
    if (!parsed.ok) return res.status(400).json({ ok: false, error: 'INVALID_RISK_TABLE', details: parsed.errors });
    state.risk = parsed.rows;
    const persisted = await persistRiskTable(state.risk, req.user?.uid);
    console.info('[admin:crash-risk-table]', JSON.stringify({ uid: req.user.uid, ranges: state.risk.length, persisted }));
    res.json({ ok: true, persisted, riskTable: state.risk });
  } catch (error) { console.error('[crash:risk-table:persist:error]', JSON.stringify({ message: error.message })); next(error); }
});

async function authenticateCrashSocket(socket) {
  try {
    const token = String(socket.handshake?.auth?.token || '').trim();
    if (!token) return false;
    const { auth } = initFirebaseAdmin();
    if (!auth) return false;
    const decoded = await auth.verifyIdToken(token);
    socket.data.crashUid = String(decoded.uid || '');
    return !!socket.data.crashUid;
  } catch (_) {
    socket.data.crashUid = '';
    socket.emit('crash:auth_error', { ok: false, error: 'INVALID_AUTH_TOKEN' });
    return false;
  }
}

function installSocket(io) {
  state.io = io;
  ensureRoundStarted().catch((error) => console.error('[crash:boot:error]', JSON.stringify({ message: error.message })));
  io.on('connection', (socket) => {
    socket.on('crash:subscribe', async () => {
      await ensureRoundStarted().catch(() => null);
      const authenticated = await authenticateCrashSocket(socket);
      if (!authenticated) {
        socket.data.crashSubscribed = false;
        socket.emit('crash:auth_error', { ok:false, error:'AUTH_REQUIRED' });
        return;
      }
      socket.data.crashSubscribed = true;
      socket.join?.('crash');
      socket.emit('crash:update', snapshot({ viewerUid: socket.data?.crashUid || '' }));
    });
    socket.on('crash:unsubscribe', () => { socket.data.crashSubscribed = false; socket.leave?.('crash'); });
  });
}

ensureRoundStarted().catch((error) => console.error('[crash:boot:error]', JSON.stringify({ message: error.message })));
module.exports = { router, installSocket, _state: state, _validateRiskTable: validateRiskTable };

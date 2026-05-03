const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireAdmin } = require('../../core/security');
const { debitBalance, creditBalance, readBalance } = require('../../core/economyService');
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
const TICK_MS = 120;
const RISK_DOC_COLLECTION = 'gameConfig';
const RISK_DOC_ID = 'crash';

const now = () => Date.now();
const round = (value, digits = 2) => Number((Number(value) || 0).toFixed(digits));
const uidOf = (req) => String(req.user?.uid || '');
const hashPlayerKey = (uid) => crypto.createHash('sha256').update(String(uid || '')).digest('hex').slice(0, 12);

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
  io: null,
  timer: null
};

function makeHttpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function safeDisplayName(user = {}) {
  const raw = String(user.name || user.displayName || user.username || '').trim();
  if (raw) return raw.slice(0, 32);
  return 'Oyuncu';
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
  const clean = input.map((row) => ({
    min: round(row?.min, 2),
    max: round(row?.max, 2),
    weight: Number(row?.weight)
  }));

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
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].min <= sorted[i - 1].max) errors.push(`ROW_${i + 1}_OVERLAPS_PREVIOUS`);
  }

  const totalWeight = clean.reduce((sum, row) => sum + (Number.isFinite(row.weight) ? row.weight : 0), 0);
  if (totalWeight <= 0) errors.push('RISK_TABLE_WEIGHT_TOTAL_INVALID');

  if (errors.length) {
    if (useDefaultOnInvalid) return validateRiskTable(DEFAULT_RISK, { useDefaultOnInvalid: false });
    return { ok: false, rows: [], errors: [...new Set(errors)] };
  }

  return {
    ok: true,
    rows: sorted.map((row) => ({ ...row, probability: row.weight / totalWeight })),
    errors: []
  };
}

async function loadRiskTable() {
  if (state.riskLoaded) return state.risk;
  if (state.riskLoadPromise) return state.riskLoadPromise;
  state.riskLoadPromise = (async () => {
    try {
      const { db } = initFirebaseAdmin();
      if (db) {
        const snap = await db.collection(RISK_DOC_COLLECTION).doc(RISK_DOC_ID).get();
        const data = snap.exists ? snap.data() : null;
        const parsed = validateRiskTable(data?.riskTable || [], { useDefaultOnInvalid: false });
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
  let roll = Math.random() * total;
  for (const row of rows) {
    roll -= row.weight;
    if (roll <= 0) return round(row.min + Math.random() * (row.max - row.min), 2);
  }
  return 1.25;
}

function currentMultiplier() {
  if (state.phase !== 'FLYING') return round(state.multiplier, 2);
  const elapsed = Math.max(0, now() - state.startedAt) / 1000;
  return Math.min(MAX_MULT, Math.max(1, round(1 + elapsed * 0.10 + Math.pow(elapsed, 1.42) * 0.022, 2)));
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
    cashoutMult: round(bet.cashoutMult || 0, 2),
    winAmount: bet.winAmount || 0,
    win: bet.winAmount || 0,
    roundId: bet.roundId
  };
}

function publicHistoryItem(item) {
  return {
    roundId: item.roundId,
    multiplier: round(item.multiplier, 2),
    currentMult: round(item.multiplier, 2),
    at: item.at
  };
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

function emitState() {
  if (!state.io) return;
  for (const socket of state.io.sockets.sockets.values()) {
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
  state.phase = 'COUNTDOWN';
  state.roundId = `cr_${now()}_${crypto.randomBytes(4).toString('hex')}`;
  state.crashPoint = pickCrashPoint();
  state.countdownUntil = now() + WAIT_MS;
  state.startedAt = 0;
  state.multiplier = 1;
  state.bets.clear();
  emitState();
  clearTimer();
  state.timer = setTimeout(startFlying, WAIT_MS);
  state.timer.unref?.();
}

function startFlying() {
  state.phase = 'FLYING';
  state.startedAt = now();
  state.multiplier = 1;
  emitState();
  clearTimer();
  state.timer = setInterval(tick, TICK_MS);
  state.timer.unref?.();
}

async function settleLosses() {
  for (const bet of state.bets.values()) {
    if (!bet.cashed && !bet.refunded) bet.lost = true;
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
  emitState();
  clearTimer();
  state.timer = setTimeout(startCountdown, CRASHED_HOLD_MS);
  state.timer.unref?.();
}

async function cashoutBet(bet, { automatic = false } = {}) {
  if (!bet) return { ok: false, error: 'BET_NOT_FOUND', statusCode: 404 };
  if (bet.refunded) return { ok: false, error: 'BET_REFUNDED', statusCode: 409 };
  if (bet.lost) return { ok: false, error: 'BET_ALREADY_LOST', statusCode: 409 };
  if (bet.cashed) return { ok: true, duplicate: true, bet };
  if (bet.cashingOut) return { ok: false, error: 'CASHOUT_IN_PROGRESS', statusCode: 409 };
  if (state.phase !== 'FLYING') return { ok: false, error: 'CASHOUT_NOT_AVAILABLE', statusCode: 409 };

  const mult = currentMultiplier();
  if (mult >= state.crashPoint) {
    bet.lost = true;
    return { ok: false, error: automatic ? 'AUTO_CASHOUT_MISSED' : 'CASHOUT_TOO_LATE', statusCode: 409 };
  }

  bet.cashingOut = true;
  try {
    const winAmount = Math.floor(bet.amount * mult);
    const result = await creditBalance({
      uid: bet.uid,
      amount: winAmount,
      reason: automatic ? 'crash-auto-cashout' : 'crash-cashout',
      idempotencyKey: `crash:cashout:${bet.roundId}:${bet.uid}:${bet.box}`,
      metadata: { roundId: bet.roundId, box: bet.box, multiplier: mult }
    });
    if (!result.ok) throw makeHttpError(result.error || 'CASHOUT_FAILED', 409);
    bet.cashed = true;
    bet.cashoutMult = mult;
    bet.winAmount = winAmount;
    bet.balance = result.balance;
    emitState();
    return { ok: true, bet, balance: result.balance };
  } finally {
    bet.cashingOut = false;
  }
}

function tick() {
  state.multiplier = currentMultiplier();
  for (const bet of state.bets.values()) {
    if (!bet.cashed && !bet.lost && !bet.refunded && bet.autoCashout && state.multiplier >= bet.autoCashout && state.multiplier < state.crashPoint) {
      cashoutBet(bet, { automatic: true }).catch((error) => console.error('[crash:auto-cashout:error]', JSON.stringify({ message: error.message })));
    }
  }
  if (state.multiplier >= state.crashPoint) endRound().catch((error) => console.error('[crash:end:error]', JSON.stringify({ message: error.message })));
  else emitState();
}

function ensureRoundStarted() {
  if (!state.roundId) startCountdown();
}

router.get('/state', (_req, res) => {
  ensureRoundStarted();
  res.json(snapshot());
});

router.get('/resume', requireAuth, async (req, res) => {
  ensureRoundStarted();
  const viewerUid = uidOf(req);
  const myBets = [...state.bets.values()].filter((bet) => bet.uid === viewerUid).map((bet) => publicBet(bet, viewerUid));
  const balance = await readBalance(viewerUid);
  res.json({ ...snapshot({ viewerUid }), balance, myBets, bets: myBets });
});

router.get('/active-bets', requireAuth, (req, res) => {
  ensureRoundStarted();
  const viewerUid = uidOf(req);
  const bets = [...state.bets.values()].filter((bet) => bet.uid === viewerUid && !bet.cashed && !bet.lost && !bet.refunded).map((bet) => publicBet(bet, viewerUid));
  res.json({ ok: true, hasActiveBet: bets.length > 0, hasRiskyBet: bets.some((bet) => !bet.autoCashout), bets });
});

router.post('/bet', requireAuth, async (req, res, next) => {
  try {
    ensureRoundStarted();
    if (state.phase !== 'COUNTDOWN') return res.status(409).json({ ok: false, error: 'BET_WINDOW_CLOSED' });
    const uid = uidOf(req);
    const box = Math.max(1, Math.min(2, Math.trunc(Number(req.body.box) || 1)));
    const amount = parseBetAmount(req.body.amount);
    const autoCashout = parseAutoCashout(req.body.autoCashout);
    const key = `${state.roundId}:${uid}:${box}`;
    if (state.bets.has(key)) return res.status(409).json({ ok: false, error: 'BET_ALREADY_PLACED' });
    const debit = await debitBalance({
      uid,
      amount,
      reason: 'crash-bet',
      idempotencyKey: `crash:bet:${key}`,
      metadata: { roundId: state.roundId, box, autoCashout }
    });
    if (!debit.ok) return res.status(409).json(debit);
    const bet = {
      betId: key,
      roundId: state.roundId,
      uid,
      username: safeDisplayName(req.user),
      avatar: '',
      selectedFrame: 0,
      box,
      amount,
      autoCashout,
      cashed: false,
      lost: false,
      refunded: false,
      winAmount: 0,
      cashoutMult: 0,
      at: now()
    };
    state.bets.set(key, bet);
    emitState();
    res.json({ ok: true, bet: publicBet(bet, uid), balance: debit.balance, roundId: state.roundId });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.post('/cashout', requireAuth, async (req, res, next) => {
  try {
    ensureRoundStarted();
    const uid = uidOf(req);
    const box = Math.max(1, Math.min(2, Math.trunc(Number(req.body.box) || 1)));
    const bet = state.bets.get(`${state.roundId}:${uid}:${box}`);
    const result = await cashoutBet(bet);
    if (!result.ok) return res.status(result.statusCode || 409).json({ ok: false, error: result.error });
    const cashed = result.bet;
    res.json({
      ok: true,
      bet: publicBet(cashed, uid),
      winAmount: cashed.winAmount,
      cashoutMult: cashed.cashoutMult,
      balance: result.balance,
      resultSummary: { message: `${cashed.cashoutMult.toFixed(2)}x çıkış alındı.` }
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.post('/refund-active', requireAuth, async (req, res) => {
  ensureRoundStarted();
  const uid = uidOf(req);
  let refunded = 0;
  const refundedBets = [];
  for (const [key, bet] of state.bets) {
    if (bet.uid !== uid || bet.cashed || bet.lost || bet.refunded || state.phase === 'CRASHED') continue;
    const result = await creditBalance({
      uid,
      amount: bet.amount,
      reason: 'crash-invite-refund',
      idempotencyKey: `crash:refund:${key}`,
      metadata: { roundId: bet.roundId, box: bet.box }
    });
    if (result.ok) {
      bet.refunded = true;
      refunded += bet.amount;
      refundedBets.push(publicBet(bet, uid));
      state.bets.delete(key);
    }
  }
  emitState();
  res.json({ ok: true, refunded, refundedBets, balance: await readBalance(uid), hasActiveBet: false });
});

router.get('/admin/risk-table', requireAuth, requireAdmin, async (_req, res) => {
  await loadRiskTable();
  res.json({ ok: true, riskTable: state.risk });
});

router.post('/admin/risk-table', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const parsed = validateRiskTable(req.body.rows || req.body.riskTable || [], { useDefaultOnInvalid: false });
    if (!parsed.ok) return res.status(400).json({ ok: false, error: 'INVALID_RISK_TABLE', details: parsed.errors });
    state.risk = parsed.rows;
    await persistRiskTable(state.risk, req.user?.uid).catch((error) => console.error('[crash:risk-table:persist:error]', JSON.stringify({ message: error.message })));
    console.info('[admin:crash-risk-table]', JSON.stringify({ uid: req.user.uid, ranges: state.risk.length }));
    res.json({ ok: true, riskTable: state.risk });
  } catch (error) {
    next(error);
  }
});

async function authenticateCrashSocket(socket) {
  try {
    const token = String(socket.handshake?.auth?.token || '').trim();
    if (!token) return;
    const { auth } = initFirebaseAdmin();
    if (!auth) return;
    const decoded = await auth.verifyIdToken(token);
    socket.data.crashUid = String(decoded.uid || '');
  } catch (_) {
    socket.data.crashUid = '';
  }
}

function installSocket(io) {
  state.io = io;
  loadRiskTable().catch(() => null);
  ensureRoundStarted();
  io.on('connection', (socket) => {
    authenticateCrashSocket(socket).finally(() => {
      socket.emit('crash:update', snapshot({ viewerUid: socket.data?.crashUid || '' }));
    });
  });
}

ensureRoundStarted();

module.exports = { router, installSocket, _state: state, _validateRiskTable: validateRiskTable };

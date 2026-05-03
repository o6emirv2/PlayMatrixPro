const express = require('express');
const crypto = require('crypto');
const { runtimeStore } = require('../../core/runtimeStore');

const router = express.Router();
const ROUND_COUNTDOWN_MS = 8000;
const ROUND_FLYING_MAX_MS = 28000;
const ROUND_AFTER_CRASH_MS = 4500;
const HISTORY_MAX = 25;
const MIN_BET = 1;
const MAX_BET = 1000000;

let activeRound = null;
let history = [];

function now() { return Date.now(); }
function safeUid(value = '') { return String(value || '').trim().slice(0, 160) || 'guest'; }
function safeNumber(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, safeNumber(value, min))); }
function round2(value) { return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100; }
function publicPlayer(profile = {}) {
  return {
    uid: safeUid(profile.uid),
    username: String(profile.username || profile.displayName || 'Oyuncu').slice(0, 48),
    avatar: String(profile.avatar || '').slice(0, 1000),
    selectedFrame: Math.max(0, Math.min(18, Math.floor(safeNumber(profile.selectedFrame, 0)))),
  };
}
function multiplierFromSeed(seed) {
  const h = crypto.createHash('sha256').update(String(seed)).digest('hex');
  const n = parseInt(h.slice(0, 13), 16);
  const e = 2 ** 52;
  if (n % 33 === 0) return 1;
  return Math.max(1, Math.floor((100 * e - n) / (e - n)) / 100);
}
function createRound() {
  const seed = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const createdAt = now();
  activeRound = {
    id: `cr_${createdAt}_${crypto.randomBytes(5).toString('hex')}`,
    roundId: '',
    seed,
    hash,
    crashAt: multiplierFromSeed(seed),
    phase: 'COUNTDOWN',
    createdAt,
    startTime: createdAt + ROUND_COUNTDOWN_MS,
    crashTime: 0,
    endedAt: 0,
    bets: {},
    stateVersion: 1
  };
  activeRound.roundId = activeRound.id;
  runtimeStore.rooms.set(`crash:${activeRound.id}`, activeRound, 45 * 60 * 1000);
  return activeRound;
}
function ensureRound() {
  if (!activeRound) return createRound();
  updateRoundPhase(activeRound);
  return activeRound;
}
function rotateRoundIfNeeded() {
  const round = ensureRound();
  updateRoundPhase(round);
  if (round.phase === 'CRASHED' && now() - round.endedAt >= ROUND_AFTER_CRASH_MS) return createRound();
  return round;
}
function currentMultiplier(round = ensureRound(), at = now()) {
  updateRoundPhase(round, at);
  if (round.phase === 'COUNTDOWN') return 1;
  if (round.phase === 'CRASHED') return round2(round.crashAt);
  const elapsed = Math.max(0, at - round.startTime);
  const mult = 1 + Math.pow(elapsed / 980, 1.18) / 3.15;
  return round2(Math.min(mult, round.crashAt));
}
function updateRoundPhase(round = ensureRound(), at = now()) {
  if (!round) return null;
  if (round.phase === 'CRASHED') return round;
  if (at < round.startTime) { round.phase = 'COUNTDOWN'; return round; }
  const mult = currentMultiplierNoUpdate(round, at);
  const hardTime = at - round.startTime > ROUND_FLYING_MAX_MS;
  if (mult >= round.crashAt || hardTime) {
    round.phase = 'CRASHED';
    round.endedAt = at;
    round.crashTime = at;
    for (const bet of Object.values(round.bets || {})) {
      if (!bet.cashed) bet.lost = true;
    }
    const item = { roundId: round.id, multiplier: round2(round.crashAt), hash: round.hash, seed: round.seed, endedAt: at };
    history = [item, ...history].slice(0, HISTORY_MAX);
    runtimeStore.temporary.set('crash:history', history, 24 * 60 * 60 * 1000);
  } else {
    round.phase = 'FLYING';
  }
  return round;
}
function currentMultiplierNoUpdate(round, at) {
  if (at < round.startTime) return 1;
  const elapsed = Math.max(0, at - round.startTime);
  return round2(1 + Math.pow(elapsed / 980, 1.18) / 3.15);
}
function activePlayers(round = ensureRound()) {
  return Object.values(round.bets || {}).map((b) => ({
    uid: b.uid,
    username: b.username,
    avatar: b.avatar,
    selectedFrame: b.selectedFrame,
    box: b.box,
    betId: b.betId,
    roundId: round.id,
    amount: b.amount,
    bet: b.amount,
    autoCashout: b.autoCashout,
    autoCashoutEnabled: !!b.autoCashoutEnabled,
    cashed: !!b.cashed,
    cashoutMult: b.cashoutMult || 0,
    win: b.win || 0,
    isBot: false
  }));
}
function publicSnapshot(round = rotateRoundIfNeeded()) {
  updateRoundPhase(round);
  const currentMult = currentMultiplier(round);
  return {
    ok: true,
    serverNow: now(),
    roundId: round.id,
    phase: round.phase,
    currentMult,
    startTime: round.startTime,
    hash: round.hash,
    crashAt: round.phase === 'CRASHED' ? round2(round.crashAt) : null,
    activePlayers: activePlayers(round),
    bets: [],
    history
  };
}
function placeBet({ uid, profile = {}, box = 1, amount = 1, autoCashout = 0 }) {
  const round = rotateRoundIfNeeded();
  updateRoundPhase(round);
  if (round.phase !== 'COUNTDOWN') { const err = new Error('Katılım penceresi kapalı.'); err.statusCode = 409; throw err; }
  const safeBox = Number(box) === 2 ? 2 : 1;
  const safeAmount = Math.floor(clamp(amount, MIN_BET, MAX_BET));
  const safeAuto = round2(clamp(autoCashout, 0, 100));
  const id = `${round.id}:${safeUid(uid)}:${safeBox}`;
  if (round.bets[id]) { const err = new Error('Bu tur ve kutu için katılım zaten alınmış.'); err.statusCode = 409; throw err; }
  const p = publicPlayer({ ...profile, uid });
  const bet = { ...p, box: safeBox, betId: id, roundId: round.id, amount: safeAmount, autoCashout: safeAuto, autoCashoutEnabled: safeAuto > 0, cashed: false, win: 0, at: now() };
  round.bets[id] = bet;
  round.stateVersion += 1;
  runtimeStore.rooms.set(`crash:${round.id}`, round, 45 * 60 * 1000);
  return { ...publicSnapshot(round), bet, balanceDelta: -safeAmount };
}
function cashout({ uid, box = 1 }) {
  const round = rotateRoundIfNeeded();
  updateRoundPhase(round);
  if (round.phase !== 'FLYING') { const err = new Error('Çıkış için tur uçuşta olmalı.'); err.statusCode = 409; throw err; }
  const safeBox = Number(box) === 2 ? 2 : 1;
  const id = `${round.id}:${safeUid(uid)}:${safeBox}`;
  const bet = round.bets[id];
  if (!bet) { const err = new Error('Aktif katılım bulunamadı.'); err.statusCode = 404; throw err; }
  if (bet.cashed) { const err = new Error('Bu katılım için çıkış zaten işlendi.'); err.statusCode = 409; throw err; }
  const mult = currentMultiplier(round);
  if (mult >= round.crashAt) { updateRoundPhase(round, now() + ROUND_FLYING_MAX_MS + 1); const err = new Error('Tur patladı.'); err.statusCode = 409; throw err; }
  const win = Math.floor(bet.amount * mult);
  bet.cashed = true;
  bet.cashoutMult = mult;
  bet.win = win;
  round.stateVersion += 1;
  runtimeStore.rooms.set(`crash:${round.id}`, round, 45 * 60 * 1000);
  return { ...publicSnapshot(round), bet, winAmount: win, win, amount: win, cashoutMult: mult, balanceDelta: win, resultSummary: { gameType: 'crash', outcome: 'win', message: `${mult.toFixed(2)}x çıkış alındı.`, winAmount: win } };
}
function revealHistory() { rotateRoundIfNeeded(); return history; }
router.get('/state', (_req, res) => res.json(publicSnapshot()));
router.post('/rounds', (_req, res) => res.json(publicSnapshot(createRound())));
router.post('/bet', (req, res) => { try { res.json({ ok: true, ...placeBet({ uid: req.body.uid || req.headers['x-playmatrix-user'], profile: req.body.profile || {}, box: req.body.box, amount: req.body.amount || req.body.bet, autoCashout: req.body.autoCashout }) }); } catch (error) { res.status(error.statusCode || 400).json({ ok: false, error: error.message }); } });
router.post('/cashout', (req, res) => { try { res.json({ ok: true, ...cashout({ uid: req.body.uid || req.headers['x-playmatrix-user'], box: req.body.box }) }); } catch (error) { res.status(error.statusCode || 400).json({ ok: false, error: error.message }); } });

module.exports = { router, multiplierFromSeed, ensureRound, publicSnapshot, placeBet, cashout, revealHistory, activePlayers };

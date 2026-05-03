const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireAdmin } = require('../../core/security');
const { debitBalance, creditBalance, readBalance } = require('../../core/economyService');
const { runtimeStore } = require('../../core/runtimeStore');

const router = express.Router();
const WAIT_MS = 5000;
const MAX_MULT = 10000;
const TICK_MS = 120;
const DEFAULT_RISK = Object.freeze([
  { min: 1.01, max: 1.50, weight: 34 }, { min: 1.51, max: 2.00, weight: 26 }, { min: 2.01, max: 5.00, weight: 18 },
  { min: 5.01, max: 10.00, weight: 10 }, { min: 10.01, max: 50.00, weight: 7 }, { min: 50.01, max: 100.00, weight: 3 },
  { min: 100.01, max: 1000.00, weight: 1.5 }, { min: 1000.01, max: 10000.00, weight: 0.5 }
]);
const state = { phase: 'COUNTDOWN', roundId: '', crashPoint: 1.01, startedAt: 0, countdownUntil: 0, multiplier: 1, bets: new Map(), history: [], risk: [...DEFAULT_RISK], io: null, timer: null };
const now = () => Date.now();
function uidOf(req) { return String(req.user?.uid || ''); }
function clampBet(v) { return Math.max(1, Math.min(1_000_000, Math.trunc(Number(v) || 0))); }
function clampAuto(v) { const n = Number(v) || 0; return n > 0 ? Math.max(2, Math.min(100, n)) : 0; }
function currentMultiplier() { if (state.phase !== 'FLYING') return state.multiplier; const elapsed = Math.max(0, now() - state.startedAt) / 1000; return Math.min(MAX_MULT, Math.max(1, Number((1 + elapsed * 0.10 + Math.pow(elapsed, 1.42) * 0.022).toFixed(2)))); }
function normalizeRisk(rows = []) { const clean = rows.map(r => ({ min: Number(r.min), max: Number(r.max), weight: Number(r.weight) })).filter(r => Number.isFinite(r.min) && Number.isFinite(r.max) && Number.isFinite(r.weight) && r.min >= 1.01 && r.max <= MAX_MULT && r.max >= r.min && r.weight > 0); const total = clean.reduce((s,r)=>s+r.weight,0); if (!clean.length || total <= 0) return [...DEFAULT_RISK]; return clean.map(r => ({ ...r, probability: r.weight / total })); }
function pickCrashPoint() { const rows = normalizeRisk(state.risk); const total = rows.reduce((s,r)=>s+r.weight,0); let roll = Math.random() * total; for (const r of rows) { roll -= r.weight; if (roll <= 0) return Number((r.min + Math.random() * (r.max - r.min)).toFixed(2)); } return 1.25; }
function publicBet(b) { return { uid:b.uid, username:b.username || 'Oyuncu', avatar:b.avatar || '', box:b.box, amount:b.amount, autoCashout:b.autoCashout, cashed:b.cashed, cashoutMult:b.cashoutMult, winAmount:b.winAmount, roundId:b.roundId }; }
function snapshot() { return { ok:true, phase:state.phase, roundId:state.roundId, multiplier:currentMultiplier(), countdownUntil:state.countdownUntil, waitMs:WAIT_MS, history:state.history.slice(-20), activeBets:[...state.bets.values()].map(publicBet) }; }
function emit() { state.io?.emit('crash:update', snapshot()); }
function startCountdown() { state.phase = 'COUNTDOWN'; state.roundId = `cr_${now()}_${crypto.randomBytes(3).toString('hex')}`; state.crashPoint = pickCrashPoint(); state.countdownUntil = now() + WAIT_MS; state.startedAt = 0; state.multiplier = 1; state.bets.clear(); emit(); clearTimeout(state.timer); state.timer = setTimeout(startFlying, WAIT_MS); state.timer.unref?.(); }
function startFlying() { state.phase = 'FLYING'; state.startedAt = now(); state.multiplier = 1; emit(); clearTimeout(state.timer); state.timer = setInterval(tick, TICK_MS); state.timer.unref?.(); }
async function settleLosses() { for (const bet of state.bets.values()) if (!bet.cashed) bet.lost = true; }
async function endRound() { state.multiplier = state.crashPoint; state.phase = 'CRASHED'; await settleLosses(); const item = { roundId:state.roundId, multiplier:state.crashPoint, at:now() }; state.history.push(item); state.history = state.history.slice(-20); runtimeStore.crashRounds.set(item.roundId, item, 3600000); emit(); clearInterval(state.timer); state.timer = setTimeout(startCountdown, 2400); state.timer.unref?.(); }
function tick() { state.multiplier = currentMultiplier(); for (const bet of state.bets.values()) { if (!bet.cashed && bet.autoCashout && state.multiplier >= bet.autoCashout && state.multiplier < state.crashPoint) cashoutBet(bet).catch(err => console.error('[crash:auto-cashout:error]', { message: err.message })); } if (state.multiplier >= state.crashPoint) endRound().catch(err => console.error('[crash:end:error]', { message: err.message })); else emit(); }
async function cashoutBet(bet) { if (!bet || bet.cashed || state.phase !== 'FLYING') return bet; const mult = Math.min(currentMultiplier(), state.crashPoint); if (mult >= state.crashPoint) return bet; const winAmount = Math.floor(bet.amount * mult); const result = await creditBalance({ uid:bet.uid, amount:winAmount, reason:'crash-cashout', idempotencyKey:`crash:cashout:${bet.roundId}:${bet.uid}:${bet.box}` }); if (!result.ok) throw new Error(result.error || 'CASHOUT_FAILED'); bet.cashed = true; bet.cashoutMult = mult; bet.winAmount = winAmount; bet.balance = result.balance; emit(); return bet; }

router.get('/state', (_req, res) => res.json(snapshot()));
router.get('/resume', requireAuth, async (req, res) => res.json({ ...snapshot(), balance: await readBalance(uidOf(req)), myBets:[...state.bets.values()].filter(b=>b.uid===uidOf(req)).map(publicBet) }));
router.get('/active-bets', requireAuth, (req, res) => res.json({ ok:true, bets:[...state.bets.values()].filter(b=>b.uid===uidOf(req)).map(publicBet) }));
router.post('/bet', requireAuth, async (req, res) => {
  if (state.phase !== 'COUNTDOWN') return res.status(409).json({ ok:false, error:'BET_WINDOW_CLOSED' });
  const uid = uidOf(req); const box = Math.max(1, Math.min(2, Math.trunc(Number(req.body.box) || 1))); const amount = clampBet(req.body.amount); const autoCashout = clampAuto(req.body.autoCashout);
  const key = `${state.roundId}:${uid}:${box}`; if (state.bets.has(key)) return res.status(409).json({ ok:false, error:'BET_ALREADY_PLACED' });
  const debit = await debitBalance({ uid, amount, reason:'crash-bet', idempotencyKey:`crash:bet:${key}` }); if (!debit.ok) return res.status(409).json(debit);
  const bet = { betId:key, roundId:state.roundId, uid, username:req.user.email || 'Oyuncu', avatar:'', box, amount, autoCashout, cashed:false, winAmount:0, cashoutMult:0, at:now() };
  state.bets.set(key, bet); emit(); res.json({ ok:true, bet:publicBet(bet), balance:debit.balance, roundId:state.roundId });
});
router.post('/cashout', requireAuth, async (req, res) => {
  const uid = uidOf(req); const box = Math.max(1, Math.min(2, Math.trunc(Number(req.body.box) || 1))); const bet = state.bets.get(`${state.roundId}:${uid}:${box}`);
  if (!bet) return res.status(404).json({ ok:false, error:'BET_NOT_FOUND' }); if (state.phase !== 'FLYING') return res.status(409).json({ ok:false, error:'CASHOUT_NOT_AVAILABLE' });
  const cashed = await cashoutBet(bet); res.json({ ok:true, winAmount:cashed.winAmount, cashoutMult:cashed.cashoutMult, balance:cashed.balance, resultSummary:{ message:`${cashed.cashoutMult.toFixed(2)}x çıkış alındı.` } });
});
router.post('/refund-active', requireAuth, async (req, res) => { const uid = uidOf(req); let refunded = 0; for (const [key, bet] of state.bets) { if (bet.uid === uid && !bet.cashed && !bet.refunded) { const r = await creditBalance({ uid, amount:bet.amount, reason:'crash-invite-refund', idempotencyKey:`crash:refund:${key}` }); if (r.ok) { bet.refunded = true; refunded += bet.amount; state.bets.delete(key); } } } emit(); res.json({ ok:true, refunded }); });
router.get('/admin/risk-table', requireAuth, requireAdmin, (_req, res) => res.json({ ok:true, riskTable:normalizeRisk(state.risk) }));
router.post('/admin/risk-table', requireAuth, requireAdmin, (req, res) => { state.risk = normalizeRisk(req.body.rows || req.body.riskTable || []); console.info('[admin:crash-risk-table]', JSON.stringify({ uid:req.user.uid, ranges:state.risk.length })); res.json({ ok:true, riskTable:state.risk }); });
function installSocket(io) { state.io = io; if (!state.roundId) startCountdown(); io.on('connection', socket => { socket.emit('crash:update', snapshot()); }); }
if (!state.roundId) startCountdown();
module.exports = { router, installSocket, _state:state };

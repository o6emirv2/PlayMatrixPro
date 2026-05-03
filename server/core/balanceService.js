const crypto = require('crypto');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runOnce } = require('./idempotencyService');

const DEFAULT_LOCAL_BALANCE = 50000;
const MAX_ABS_DELTA = 1000000000;
const now = () => Date.now();

function normalizeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_ABS_DELTA, Math.min(MAX_ABS_DELTA, Math.trunc(n)));
}
function normalizeBalance(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}
function cleanText(value, max = 120) {
  return String(value || '').trim().slice(0, max).replace(/[<>]/g, '');
}
function localAdjust({ uid, amount, reason, runtimeStore }) {
  const current = normalizeBalance(runtimeStore?.temporary?.get(`balance:${uid}`) ?? DEFAULT_LOCAL_BALANCE);
  const next = current + amount;
  if (next < 0) {
    const error = new Error('INSUFFICIENT_BALANCE');
    error.code = 'INSUFFICIENT_BALANCE';
    error.statusCode = 409;
    throw error;
  }
  runtimeStore?.temporary?.set(`balance:${uid}`, next, 30 * 86400000);
  return { ok: true, uid, amount, reason, balance: next, previousBalance: current, firestore: false };
}
async function firestoreAdjust({ uid, amount, reason, idempotencyKey, actor = null }) {
  const { db } = initFirebaseAdmin();
  if (!db) return null;
  return runOnce({
    key: idempotencyKey,
    db,
    execute: async () => {
      const auditId = `economy_${crypto.randomUUID()}`;
      let result = null;
      await db.runTransaction(async (tx) => {
        const userRef = db.collection('users').doc(uid);
        const snap = await tx.get(userRef);
        const current = normalizeBalance(snap.exists ? (snap.data() || {}).balance : DEFAULT_LOCAL_BALANCE);
        const next = current + amount;
        if (next < 0) {
          const error = new Error('INSUFFICIENT_BALANCE');
          error.code = 'INSUFFICIENT_BALANCE';
          error.statusCode = 409;
          throw error;
        }
        tx.set(userRef, { balance: next, updatedAt: now() }, { merge: true });
        tx.set(db.collection('audit').doc(auditId), { uid, amount, reason, previousBalance: current, nextBalance: next, actor, type: 'balance-adjustment', at: now() }, { merge: true });
        result = { ok: true, uid, amount, reason, balance: next, previousBalance: current, firestore: true, auditId };
      });
      return result;
    }
  });
}
async function adjustBalance({ uid, amount, reason = 'balance-adjustment', idempotencyKey = '', runtimeStore = null, actor = null } = {}) {
  const safeUid = cleanText(uid, 180);
  const safeAmount = normalizeAmount(amount);
  const safeReason = cleanText(reason, 160) || 'balance-adjustment';
  if (!safeUid) return { ok: false, error: 'UID_REQUIRED' };
  if (!safeAmount) return { ok: true, uid: safeUid, amount: 0, reason: safeReason, skipped: true };
  const key = cleanText(idempotencyKey, 240) || `${safeUid}:${safeReason}:${safeAmount}:${now()}`;
  const firestoreResult = await firestoreAdjust({ uid: safeUid, amount: safeAmount, reason: safeReason, idempotencyKey: key, actor });
  if (firestoreResult) return firestoreResult;
  return localAdjust({ uid: safeUid, amount: safeAmount, reason: safeReason, runtimeStore });
}
module.exports = { adjustBalance, normalizeAmount, normalizeBalance };

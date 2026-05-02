const { getDb } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');
const { smartDataRouter } = require('./smartDataRouter');

function roundMoney(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100) / 100);
}

async function getBalance(uid) {
  const db = getDb();
  if (!db) return runtimeStore.memoryBalances.get(uid) || 1000;
  const snap = await db.collection('users').doc(uid).get();
  return Number(snap.get('balance') || 0);
}

async function adjustBalance({ uid, amount, reason, idempotencyKey }) {
  const value = roundMoney(amount);
  if (!uid || !Number.isFinite(value)) throw new Error('INVALID_BALANCE_ADJUSTMENT');
  const db = getDb();
  if (!db) {
    const current = runtimeStore.memoryBalances.get(uid) || 1000;
    const next = roundMoney(current + value);
    if (next < 0) throw new Error('INSUFFICIENT_BALANCE');
    runtimeStore.memoryBalances.set(uid, next);
    return { balance: next, demo: true };
  }
  const userRef = db.collection('users').doc(uid);
  const ledgerRef = db.collection('financial_ledger').doc(idempotencyKey);
  const result = await db.runTransaction(async (tx) => {
    const ledgerSnap = await tx.get(ledgerRef);
    if (ledgerSnap.exists) return { duplicate: true, balance: Number(ledgerSnap.get('balanceAfter') || 0) };
    const userSnap = await tx.get(userRef);
    const current = Number(userSnap.get('balance') || 0);
    const next = roundMoney(current + value);
    if (next < 0) throw new Error('INSUFFICIENT_BALANCE');
    tx.set(userRef, { balance: next, updatedAt: new Date().toISOString() }, { merge: true });
    tx.set(ledgerRef, { uid, amount: value, reason, balanceBefore: current, balanceAfter: next, createdAt: new Date().toISOString() });
    return { duplicate: false, balance: next };
  });
  await smartDataRouter({ priority: 'CRITICAL', type: 'BALANCE_ADJUSTED', userId: uid, payload: { amount: value, reason, idempotencyKey } });
  return result;
}

module.exports = { getBalance, adjustBalance, roundMoney };

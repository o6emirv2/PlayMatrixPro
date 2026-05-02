'use strict';

const { getDb, getServerTimestamp } = require('../config/firebaseAdmin');
const { getProgression } = require('./progressionService');
const { runtimeStore } = require('./runtimeStore');
const { normalizeEmail, publicUser, makeHttpError, safeString, safeNumber } = require('./security');

const DEMO_USER_ID = 'demo-user';

function defaultUser(uid, email = '') {
  const progression = getProgression(0);
  return {
    uid,
    email: normalizeEmail(email),
    displayName: email ? email.split('@')[0] : 'PlayMatrix Oyuncu',
    avatarUrl: '/public/assets/avatars/fallback.svg',
    selectedFrame: 1,
    unlockedFrames: [1, 2, 3],
    balance: 1000,
    xp: '0',
    level: progression.level,
    role: 'user',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

async function ensureUserProfile(uid, seed = {}) {
  const db = getDb();
  if (!db) {
    const key = `user:${uid || DEMO_USER_ID}`;
    const existing = runtimeStore.sessions.get(key);
    if (existing) return existing;
    const user = { ...defaultUser(uid || DEMO_USER_ID, seed.email), ...seed, uid: uid || DEMO_USER_ID };
    runtimeStore.sessions.set(key, user);
    return user;
  }

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data();
    const progression = getProgression(data.xp || 0);
    const normalized = { ...defaultUser(uid, data.email), ...data, uid, level: progression.level };
    if (normalized.level !== data.level) await ref.set({ level: normalized.level }, { merge: true });
    return normalized;
  }

  const user = { ...defaultUser(uid, seed.email), ...seed, uid, createdAt: getServerTimestamp(), updatedAt: getServerTimestamp() };
  await ref.set(user, { merge: true });
  return { ...user, createdAt: Date.now(), updatedAt: Date.now() };
}

async function getUserProfile(uid) {
  return ensureUserProfile(uid);
}

async function updateUserProfile(uid, updates) {
  const current = await ensureUserProfile(uid);
  const allowed = {};
  if (updates.displayName !== undefined) allowed.displayName = safeString(updates.displayName, 60) || current.displayName;
  if (updates.avatarUrl !== undefined) allowed.avatarUrl = safeString(updates.avatarUrl, 300) || current.avatarUrl;
  if (updates.email !== undefined) allowed.email = normalizeEmail(updates.email);
  if (updates.selectedFrame !== undefined) {
    const frame = safeNumber(updates.selectedFrame, 1, 1, 99);
    if (!Array.isArray(current.unlockedFrames) || !current.unlockedFrames.includes(frame)) {
      throw makeHttpError(403, 'Bu çerçeve kullanıcının hesabında açık değil.', 'FRAME_LOCKED');
    }
    allowed.selectedFrame = frame;
  }
  allowed.updatedAt = getServerTimestamp();

  const db = getDb();
  if (!db) {
    const next = { ...current, ...allowed, updatedAt: Date.now() };
    runtimeStore.sessions.set(`user:${uid}`, next);
    return next;
  }

  await db.collection('users').doc(uid).set(allowed, { merge: true });
  return { ...current, ...allowed };
}

async function applyBalanceDelta(uid, delta, reason, idempotencyKey) {
  const amount = safeNumber(delta, 0, -100000000, 100000000);
  if (!amount) throw makeHttpError(400, 'Geçersiz bakiye hareketi.', 'INVALID_BALANCE_DELTA');
  const lockKey = `${uid}:${idempotencyKey || reason}`;
  if (runtimeStore.rewardLocks.has(lockKey)) return { applied: false, duplicate: true, profile: publicUser(await getUserProfile(uid)) };
  runtimeStore.rewardLocks.set(lockKey, true);

  const db = getDb();
  if (!db) {
    const current = await ensureUserProfile(uid);
    const next = { ...current, balance: Math.max(0, Number(current.balance || 0) + amount), updatedAt: Date.now() };
    runtimeStore.sessions.set(`user:${uid}`, next);
    return { applied: true, duplicate: false, profile: publicUser(next) };
  }

  const ref = db.collection('users').doc(uid);
  let finalProfile = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() : defaultUser(uid);
    const balance = Math.max(0, Number(current.balance || 0) + amount);
    tx.set(ref, { balance, updatedAt: getServerTimestamp() }, { merge: true });
    tx.set(db.collection('ledger').doc(idempotencyKey || `${uid}_${Date.now()}`), {
      uid,
      delta: amount,
      reason: safeString(reason, 120),
      idempotencyKey: safeString(idempotencyKey || '', 160),
      createdAt: getServerTimestamp()
    }, { merge: true });
    finalProfile = { ...current, uid, balance };
  });
  return { applied: true, duplicate: false, profile: publicUser(finalProfile) };
}

module.exports = { DEMO_USER_ID, defaultUser, ensureUserProfile, getUserProfile, updateUserProfile, applyBalanceDelta };

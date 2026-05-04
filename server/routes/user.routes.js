const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { migrateUserProfile } = require('../core/legacyMigrationService');
const { asNumber } = require('../core/validation');
const { getProgression } = require('../core/progressionService');
const { runtimeStore } = require('../core/runtimeStore');

const router = express.Router();
const SIGNUP_REWARD = 50000;
const PROFILE_TTL = 30 * 24 * 60 * 60 * 1000;
const NOTIFICATION_TTL = 30 * 24 * 60 * 60 * 1000;

function now() { return Date.now(); }
function cleanString(value = '', max = 160) { return String(value || '').trim().replace(/[<>]/g, '').slice(0, max); }
function cleanUsername(value = '') { return cleanString(value, 40).replace(/\s+/g, ' '); }
function usernameLower(value = '') { return cleanUsername(value).toLocaleLowerCase('tr-TR'); }
function safeAvatar(value = '') {
  const raw = cleanString(value, 1000);
  if (!raw) return '';
  if (raw.startsWith('/public/assets/avatars/') || raw.startsWith('https://')) return raw;
  return '';
}
function frameNumber(value) { return Math.max(0, Math.min(100, Math.floor(asNumber(value, { min: 0, max: 100 })))); }
function runtimeProfileKey(uid) { return `profile:${uid}`; }
function publicRuntimeProfile(uid, email = '') {
  const stored = runtimeStore.userProfiles.get(runtimeProfileKey(uid)) || {};
  return { uid, email: stored.email || email || '', balance: 0, xp: 0, selectedFrame: 0, ...stored };
}
function attachProgression(profile = {}) {
  const progression = getProgression(profile.accountXp ?? profile.xp ?? 0);
  return {
    ...profile,
    xp: progression.xp,
    accountXp: progression.xp,
    accountLevel: progression.level,
    level: progression.level,
    progressPercent: progression.progressPercent,
    accountLevelProgressPct: progression.progressPercent,
    progression
  };
}
function runtimeNotify(uid, notification) {
  if (!uid) return;
  const row = {
    id: notification.id || `ntf_${Date.now()}_${crypto.randomUUID()}`,
    uid,
    read: false,
    at: Date.now(),
    icon: 'fa-bell',
    ...notification
  };
  runtimeStore.notifications.set(row.id, row, NOTIFICATION_TTL);
}
async function readDbProfile(uid, email = '') {
  const { db } = initFirebaseAdmin();
  if (!db) return publicRuntimeProfile(uid, email);
  const snap = await db.collection('users').doc(uid).get();
  const base = { uid, email, balance: 0, xp: 0, selectedFrame: 0 };
  return snap.exists ? { ...base, ...snap.data(), uid } : base;
}
async function ensureUniqueUsername(db, uid, lower) {
  if (!lower || !db) return true;
  const snap = await db.collection('users').where('usernameLower', '==', lower).limit(1).get();
  if (snap.empty) return true;
  return snap.docs[0].id === uid;
}

router.get('/user/me', requireAuth, async (req, res) => {
  const { db } = initFirebaseAdmin();
  let profile = await readDbProfile(req.user.uid, req.user.email || '');
  if (db) profile = await migrateUserProfile(req.user.uid, profile, db);
  profile.emailVerified = Boolean(req.user.email_verified || profile.emailVerified);
  profile.phoneVerified = Boolean(req.user.phone_number || profile.phoneVerified || profile.gsmVerified);
  profile.phoneNumber = profile.phoneNumber || req.user.phone_number || '';
  const sessionKey = `sessionLog:${req.user.uid}:${Math.floor(Date.now() / (30 * 60 * 1000))}`;
  if (!runtimeStore.temporary.get(sessionKey)) {
    runtimeStore.temporary.set(sessionKey, true, 30 * 60 * 1000);
    runtimeStore.sessionHistory.set(`session:${req.user.uid}:${Date.now()}`, { uid: req.user.uid, title: 'Oturum doğrulandı', message: 'AnaSayfa güvenli oturum kontrolü yapıldı.', type: 'login-session', at: Date.now() }, 24 * 60 * 60 * 1000);
  }
  res.json({ ok: true, profile: attachProgression(profile) });
});

router.post('/user/register-profile', requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const username = cleanUsername(req.body?.username);
  const lower = usernameLower(username);
  const email = cleanString(req.body?.email || req.user.email || '', 180).toLowerCase();
  const promoCode = cleanString(req.body?.promoCode || req.body?.referralCode || '', 60).toUpperCase();
  if (!username || username.length < 3) return res.status(400).json({ ok: false, error: 'USERNAME_REQUIRED' });
  if (!email.includes('@')) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED' });

  const { db } = initFirebaseAdmin();
  const at = now();
  if (db) {
    const unique = await ensureUniqueUsername(db, uid, lower);
    if (!unique) return res.status(409).json({ ok: false, error: 'USERNAME_ALREADY_USED' });
    const ref = db.collection('users').doc(uid);
    let profile = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const before = snap.exists ? snap.data() || {} : {};
      const rewardAlreadyGranted = before.signupRewardGranted === true;
      const currentBalance = Math.max(0, Number(before.balance || 0) || 0);
      const next = {
        ...before,
        uid,
        username,
        usernameLower: lower,
        displayName: username,
        email,
        promoCode: promoCode || before.promoCode || '',
        referralCode: promoCode || before.referralCode || '',
        balance: rewardAlreadyGranted ? currentBalance : currentBalance + SIGNUP_REWARD,
        signupRewardGranted: true,
        signupRewardAmount: SIGNUP_REWARD,
        onboardingComplete: before.onboardingComplete === true && !!before.avatar && Number(before.selectedFrame || 0) > 0,
        updatedAt: at,
        createdAt: before.createdAt || at
      };
      tx.set(ref, next, { merge: true });
      profile = next;
    });
    runtimeNotify(uid, { type: 'signup-reward', title: 'Kayıt Ödülü', message: `${SIGNUP_REWARD.toLocaleString('tr-TR')} MC kayıt ödülü hesabına tanımlandı.`, icon: 'fa-gift' });
    return res.json({ ok: true, profile: attachProgression(profile), signupReward: SIGNUP_REWARD });
  }

  const before = runtimeStore.userProfiles.get(runtimeProfileKey(uid)) || {};
  const profile = {
    ...before,
    uid,
    username,
    usernameLower: lower,
    displayName: username,
    email,
    promoCode: promoCode || before.promoCode || '',
    referralCode: promoCode || before.referralCode || '',
    balance: before.signupRewardGranted ? Math.max(0, Number(before.balance || 0)) : Math.max(0, Number(before.balance || 0)) + SIGNUP_REWARD,
    signupRewardGranted: true,
    signupRewardAmount: SIGNUP_REWARD,
    onboardingComplete: before.onboardingComplete === true && !!before.avatar && Number(before.selectedFrame || 0) > 0,
    updatedAt: at,
    createdAt: before.createdAt || at
  };
  runtimeStore.userProfiles.set(runtimeProfileKey(uid), profile, PROFILE_TTL);
  runtimeNotify(uid, { type: 'signup-reward', title: 'Kayıt Ödülü', message: `${SIGNUP_REWARD.toLocaleString('tr-TR')} MC kayıt ödülü hesabına tanımlandı.`, icon: 'fa-gift' });
  res.json({ ok: true, profile: attachProgression(profile), signupReward: SIGNUP_REWARD, runtime: true });
});

router.post('/user/frame', requireAuth, async (req, res) => {
  const frame = frameNumber(req.body.frame);
  const { db } = initFirebaseAdmin();
  const profile = await readDbProfile(req.user.uid, req.user.email || '');
  const level = getProgression(profile.accountXp ?? profile.xp ?? 0).level;
  if (frame > level) return res.status(403).json({ ok: false, error: 'FRAME_LOCKED', requiredLevel: frame, level });
  if (db) await db.collection('users').doc(req.user.uid).set({ selectedFrame: frame, updatedAt: now() }, { merge: true });
  else runtimeStore.userProfiles.set(runtimeProfileKey(req.user.uid), { ...profile, selectedFrame: frame, updatedAt: now() }, PROFILE_TTL);
  res.json({ ok: true, selectedFrame: frame });
});

router.post('/user/avatar', requireAuth, async (req, res) => {
  const avatar = safeAvatar(req.body.avatar);
  if (!avatar) return res.status(400).json({ ok: false, error: 'INVALID_AVATAR' });
  const { db } = initFirebaseAdmin();
  if (db) await db.collection('users').doc(req.user.uid).set({ avatar, updatedAt: now() }, { merge: true });
  else {
    const profile = publicRuntimeProfile(req.user.uid, req.user.email || '');
    runtimeStore.userProfiles.set(runtimeProfileKey(req.user.uid), { ...profile, avatar, updatedAt: now() }, PROFILE_TTL);
  }
  res.json({ ok: true, avatar });
});

router.post('/user/onboarding-complete', requireAuth, async (req, res) => {
  const selectedFrame = frameNumber(req.body?.selectedFrame);
  const avatar = safeAvatar(req.body?.avatar);
  if (!avatar || selectedFrame <= 0) return res.status(400).json({ ok: false, error: 'AVATAR_AND_FRAME_REQUIRED' });
  const profile = await readDbProfile(req.user.uid, req.user.email || '');
  const level = getProgression(profile.accountXp ?? profile.xp ?? 0).level;
  if (selectedFrame > level) return res.status(403).json({ ok: false, error: 'FRAME_LOCKED', requiredLevel: selectedFrame, level });
  const patch = { avatar, selectedFrame, onboardingComplete: true, onboardingCompletedAt: now(), updatedAt: now() };
  const { db } = initFirebaseAdmin();
  if (db) await db.collection('users').doc(req.user.uid).set(patch, { merge: true });
  else runtimeStore.userProfiles.set(runtimeProfileKey(req.user.uid), { ...profile, ...patch }, PROFILE_TTL);
  res.json({ ok: true, profile: attachProgression({ ...profile, ...patch }) });
});

router.get('/history/bets', requireAuth, (req, res) => {
  const items = runtimeStore.betHistory.values().filter((x) => String(x?.uid || x?.userId || '') === req.user.uid).sort((a, b) => Number(b.at || b.createdAt || 0) - Number(a.at || a.createdAt || 0)).slice(0, 100);
  res.json({ ok: true, volatile: true, resetOnRestart: true, items });
});

router.get('/history/sessions', requireAuth, (req, res) => {
  const items = runtimeStore.sessionHistory.values().filter((x) => String(x?.uid || x?.userId || '') === req.user.uid).sort((a, b) => Number(b.at || b.createdAt || 0) - Number(a.at || a.createdAt || 0)).slice(0, 100);
  res.json({ ok: true, volatile: true, resetOnRestart: true, items });
});

router.get('/account/stats', requireAuth, async (req, res) => {
  const profile = attachProgression(await readDbProfile(req.user.uid, req.user.email || ''));
  res.json({ ok: true, profile, persistent: true, source: initFirebaseAdmin().db ? 'firebase' : 'runtime' });
});

module.exports = router;

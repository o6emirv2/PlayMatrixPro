const express = require('express');
const crypto = require('crypto');
const env = require('../config/env');
const { requireAuth, strictLimiter } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('../core/runtimeStore');
const { getProgression } = require('../core/progressionService');
const { runOnce } = require('../core/idempotencyService');
const pistiGame = require('../games/pisti');
const chessGame = require('../games/chess');
const crashGame = require('../games/crash');
const router = express.Router();

const DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27%23111827%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%2F%3E%3Ctext%20x%3D%2764%27%20y%3D%27118%27%20text-anchor%3D%27middle%27%20font-family%3D%27Arial%27%20font-size%3D%2716%27%20font-weight%3D%27700%27%20fill%3D%27%23fff%27%3EPM%3C%2Ftext%3E%3C%2Fsvg%3E';
const now = () => Date.now();
const s = (v, max = 200) => String(v || '').trim().slice(0, max);
const sanitizeText = (v, max = 500) => s(v, max).replace(/[<>]/g, '');
const uidOf = (req) => s(req.user?.uid || req.headers['x-playmatrix-user'] || req.body?.uid || req.query?.uid || '', 160);
const fb = () => initFirebaseAdmin();
function emailVerified(req) { return !!(req.user?.email_verified || req.user?.emailVerified || req.user?.firebase?.sign_in_provider); }
function addProgression(profile) {
  const xp = Number(profile.accountXp ?? profile.xp ?? profile.accountLevelScore ?? 0) || 0;
  const progression = getProgression(xp);
  return { ...profile, xp: progression.currentXp, accountXp: progression.currentXp, accountLevel: progression.accountLevel, level: progression.accountLevel, accountLevelProgressPct: progression.accountLevelProgressPct, progression };
}
function defaultProfile(req, uid, seed = {}) {
  const email = s(req.user?.email || req.user?.firebase?.identities?.email?.[0] || seed.email || '', 160);
  const username = s(seed.username || req.user?.name || (email ? email.split('@')[0] : `Oyuncu-${String(uid).slice(0,5)}`), 32);
  return addProgression({ uid, email, username, fullName: seed.fullName || username, displayName: username, avatar: seed.avatar || DEFAULT_AVATAR, selectedFrame: Number(seed.selectedFrame || 0) || 0, balance: Number(seed.balance ?? 50000) || 0, signupBonusClaimed: true, xp: 0, accountXp: 0, monthlyActiveScore: 0, totalRounds: 0, createdAt: now(), lastLogin: now(), lastSeen: now(), gameStats: { total: { rounds: 0, wins: 0, losses: 0, winRatePct: 0 }, chess: {}, pisti: {}, crash: {}, classic: {} } });
}
async function grantEmailVerifyRewardIfNeeded(req, uid, profile = {}) {
  if (!uid || !emailVerified(req) || profile.emailVerifyRewardClaimed) return profile;
  const { db, admin } = fb();
  if (!db || !admin) return { ...profile, emailVerified: true, emailVerifyRewardClaimed: true, balance: Number(profile.balance || 0) + 100000 };
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() : {};
    if (current.emailVerifyRewardClaimed) return;
    tx.set(ref, { emailVerified: true, emailVerifyRewardClaimed: true, emailVerifyRewardAt: now(), balance: admin.firestore.FieldValue.increment(100000), updatedAt: now() }, { merge: true });
    tx.set(db.collection('audit').doc(`email_verify_${uid}`), { uid, amount: 100000, reason: 'email-verified-reward', at: now() }, { merge: true });
  });
  const fresh = await ref.get().catch(() => null);
  return fresh?.exists ? { ...profile, ...fresh.data(), uid } : { ...profile, emailVerified: true, emailVerifyRewardClaimed: true };
}
async function readProfile(req, uid = uidOf(req), seed = {}) {
  const safeUid = uid || 'guest';
  let profile = defaultProfile(req, safeUid, seed);
  const { db } = fb();
  if (db && uid) {
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (snap.exists) profile = { ...profile, ...snap.data(), uid };
    else await ref.set(profile, { merge: true }).catch(() => null);
  }
  const memoryBalance = runtimeStore.temporary.get(`balance:${safeUid}`);
  if (typeof memoryBalance === 'number') profile.balance = memoryBalance;
  profile = await grantEmailVerifyRewardIfNeeded(req, uid, profile);
  return addProgression(profile);
}
async function writeProfile(uid, patch) { const { db } = fb(); if (db && uid) await db.collection('users').doc(uid).set({ ...patch, updatedAt: now() }, { merge: true }); }
async function addBalance(uid, amount, reason, key) {
  const { db, admin } = fb();
  const safeAmount = Math.floor(Number(amount) || 0);
  if (!uid || !safeAmount) return { ok: true, amount: safeAmount, reason, firestore: false };
  if (!db || !admin) {
    const current = Number(runtimeStore.temporary.get(`balance:${uid}`) ?? 50000) || 0;
    runtimeStore.temporary.set(`balance:${uid}`, current + safeAmount, 30 * 86400000);
    return { ok: true, amount: safeAmount, reason, firestore: false, balance: current + safeAmount };
  }
  return runOnce({ key, db, execute: async () => {
    await db.collection('users').doc(uid).set({ balance: admin.firestore.FieldValue.increment(safeAmount), updatedAt: now() }, { merge: true });
    await db.collection('audit').doc(`economy_${crypto.randomUUID()}`).set({ uid, amount: safeAmount, reason, at: now() }, { merge: true });
    return { ok: true, amount: safeAmount, reason };
  }});
}
function runtimePayload() { return { ok: true, runtime: { version: 8, environment: env.nodeEnv, publicBaseUrl: env.publicBaseUrl, canonicalOrigin: env.canonicalOrigin, apiBase: env.publicApiBase || env.publicBackendOrigin, expectedFirebaseProjectId: env.firebase.publicConfig.projectId, firebase: env.firebase.publicConfig, firebaseReady: true, source: 'render-env-contract' }, apiBase: env.publicApiBase || env.publicBackendOrigin, canonicalOrigin: env.canonicalOrigin, firebase: env.firebase.publicConfig }; }
async function leaderboardProfiles() { const { db } = fb(); if (!db) return []; try { const snap = await db.collection('users').orderBy('accountXp', 'desc').limit(25).get(); return snap.docs.map(d => ({ uid: d.id, ...d.data() })); } catch (_) { try { const snap = await db.collection('users').limit(25).get(); return snap.docs.map(d => ({ uid: d.id, ...d.data() })); } catch { return []; } } }
function lbItems(list, metric) { return list.map((raw, i) => { const p = addProgression(raw); return { uid: p.uid || `guest_${i}`, username: p.username || p.displayName || 'Oyuncu', avatar: p.avatar || DEFAULT_AVATAR, selectedFrame: Number(p.selectedFrame || 0) || 0, accountXp: Number(p.accountXp || 0), accountLevel: Number(p.accountLevel || 1), monthlyActiveScore: Number(p.monthlyActiveScore || 0), leaderboard: { rank: i + 1, metricKey: metric === 'activity' ? 'monthlyActiveScore' : 'accountXp', metricLabel: metric === 'activity' ? 'Aylık Aktiflik' : 'Hesap XP', metricValue: metric === 'activity' ? Number(p.monthlyActiveScore || 0) : Number(p.accountXp || 0) } }; }); }
function gameProfileFromReq(req, fallbackName = 'Oyuncu') { const u = req.__pmProfile || {}; return { uid: uidOf(req), username: u.username || u.displayName || fallbackName, avatar: u.avatar || DEFAULT_AVATAR, selectedFrame: Number(u.selectedFrame || 0) || 0 }; }
async function attachProfile(req, _res, next) { try { req.__pmProfile = await readProfile(req, uidOf(req)); } catch (_) { req.__pmProfile = defaultProfile(req, uidOf(req) || 'guest'); } next(); }

router.get('/public/runtime-config', (_req, res) => res.json(runtimePayload()));
router.get('/healthz', (_req, res) => res.json({ ok: true, service: 'playmatrix-api', at: now() }));
router.post('/auth/resolve-login', strictLimiter, async (req, res) => { const id = s(req.body?.identifier || req.body?.email || req.body?.username, 160); if (!id) return res.status(400).json({ ok: false, error: 'IDENTIFIER_REQUIRED' }); if (id.includes('@')) return res.json({ ok: true, email: id.toLowerCase() }); const { db } = fb(); if (!db) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' }); const q = await db.collection('users').where('usernameLower', '==', id.toLowerCase()).limit(1).get(); if (q.empty || !q.docs[0].data().email) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' }); res.json({ ok: true, email: q.docs[0].data().email }); });
router.post('/auth/session/create', requireAuth, async (req, res) => { const token = crypto.randomBytes(32).toString('hex'); const uid = uidOf(req); runtimeStore.temporary.set(`session:${token}`, { uid, at: now() }, 30 * 86400000); const user = await readProfile(req, uid, { email: req.user?.email || '' }); res.json({ ok: true, sessionToken: token, session: { token, expiresAt: now() + 30 * 86400000 }, user }); });
router.post('/auth/session/logout', (req, res) => { const token = s(req.headers['x-session-token'] || req.body?.sessionToken, 100); if (token) runtimeStore.temporary.delete(`session:${token}`); res.json({ ok: true }); });
router.get('/auth/session/status', (req, res) => { const token = s(req.headers['x-session-token'] || req.query?.sessionToken, 100); res.json({ ok: true, active: !!(token && runtimeStore.temporary.get(`session:${token}`)) }); });
router.get('/me', requireAuth, async (req, res) => res.json({ ok: true, user: await readProfile(req) }));
router.post('/me/activity/heartbeat', requireAuth, async (req, res) => { const uid = uidOf(req); runtimeStore.presence.set(uid, { uid, status: 'online', activity: s(req.body?.activity, 40), at: now() }, 180000); res.json({ ok: true, at: now() }); });
router.post('/me/showcase', requireAuth, async (req, res) => { const uid = uidOf(req); const showcase = { title: s(req.body?.title, 60), bio: sanitizeText(req.body?.bio || '', 180), updatedAt: now() }; await writeProfile(uid, { showcase }); res.json({ ok: true, showcase }); });
router.get('/user-stats/:uid', requireAuth, async (req, res) => res.json({ ok: true, data: await readProfile(req, s(req.params.uid, 128)) }));
router.get('/leaderboard', async (_req, res) => { const profiles = await leaderboardProfiles(); const fallback = profiles.length ? profiles : [addProgression({ uid: 'playmatrix', username: 'PlayMatrix', accountXp: 0, avatar: DEFAULT_AVATAR })]; const byLevel = [...fallback].sort((a,b)=>Number(b.accountXp||b.xp||0)-Number(a.accountXp||a.xp||0)); const byActivity = [...fallback].sort((a,b)=>Number(b.monthlyActiveScore||0)-Number(a.monthlyActiveScore||0)); res.json({ ok: true, generatedAt: now(), tabs: { level: { label: 'En Yüksek Hesap Seviyesi', metricKey: 'accountXp', items: lbItems(byLevel, 'level') }, activity: { label: 'En Çok Aktif Oyuncular', metricKey: 'monthlyActiveScore', items: lbItems(byActivity, 'activity') } } }); });
router.get('/check-username', requireAuth, async (req, res) => { const username = s(req.query.username, 32); if (username.length < 3) return res.json({ ok: true, available: false }); const { db } = fb(); if (!db) return res.json({ ok: true, available: true }); const snap = await db.collection('users').where('usernameLower', '==', username.toLowerCase()).limit(1).get(); res.json({ ok: true, available: snap.empty }); });
router.post('/profile/update', requireAuth, async (req, res) => { const uid = uidOf(req); const patch = { fullName: s(req.body?.fullName, 80), username: s(req.body?.username, 32), avatar: s(req.body?.avatar, 1000), selectedFrame: Math.max(0, Math.min(18, Math.floor(Number(req.body?.selectedFrame) || 0))) }; if (patch.username) patch.usernameLower = patch.username.toLowerCase(); Object.keys(patch).forEach(k => { if (patch[k] === '' && k !== 'selectedFrame') delete patch[k]; }); await writeProfile(uid, patch); res.json({ ok: true, user: await readProfile(req, uid) }); });

router.get('/notifications', requireAuth, (_req, res) => res.json({ ok: true, items: [], unread: 0, summary: { total: 0, unread: 0 } }));
router.post('/notifications/read', requireAuth, (_req, res) => res.json({ ok: true }));
router.post('/notifications/read-all', requireAuth, (_req, res) => res.json({ ok: true }));
router.post('/wheel/spin', requireAuth, strictLimiter, async (req, res) => { const uid = uidOf(req); const { db } = fb(); const today = new Date().toISOString().slice(0,10); const key = `wheel:${uid}:${today}`; if (db) { const snap = await db.collection('idempotency').doc(key).get(); if (snap.exists) return res.status(429).json({ ok:false, error:'DAILY_WHEEL_LOCKED', nextSpinAt: Date.now() + 24*3600000 }); } else if (runtimeStore.temporary.get(key)) return res.status(429).json({ ok:false, error:'DAILY_WHEEL_LOCKED', nextSpinAt: Date.now() + 24*3600000 }); const prizes = [2500,5000,7500,12500,20000,25000,30000,50000]; const index = crypto.randomInt(0, prizes.length); const prize = prizes[index]; const balanceResult = await addBalance(uid, prize, 'daily-wheel', key); await writeProfile(uid, { lastSpin: now(), lastSpinAt: now() }); if (!db) runtimeStore.temporary.set(key, true, 24*3600000); const user = await readProfile(req, uid); res.json({ ok: true, prize, amount: prize, index, lastSpin: now(), nextSpinAt: now()+24*3600000, balance: user.balance ?? balanceResult.balance, user }); });
router.post('/bonus/claim', requireAuth, strictLimiter, async (req, res) => { const code = s(req.body?.code, 64).toUpperCase(); if (!code) return res.status(400).json({ ok: false, error: 'PROMO_CODE_REQUIRED' }); const uid = uidOf(req); const amount = /^PLAY|PM|PROMO/.test(code) ? 10000 : 2500; const balanceResult = await addBalance(uid, amount, `promo:${code}`, `promo:${uid}:${code}`); const user = await readProfile(req, uid); res.json({ ok: true, code, amount, balance: user.balance ?? balanceResult.balance, user }); });
router.get('/referral/link', requireAuth, (req, res) => { const uid = uidOf(req); const code = `PM-${uid.slice(0, 6).toUpperCase() || crypto.randomBytes(3).toString('hex').toUpperCase()}`; res.json({ ok: true, code, link: `${env.publicBaseUrl}/?ref=${encodeURIComponent(code)}` }); });
router.post('/referral/claim', requireAuth, (_req, res) => res.json({ ok: true, amount: 0 }));

router.post('/support/receipt', requireAuth, (req, res) => { const id = `sup_${crypto.randomUUID()}`; runtimeStore.temporary.set(id, { id, uid: uidOf(req), subject: sanitizeText(req.body?.subject || '', 100), note: sanitizeText(req.body?.note || req.body?.message || '', 800), at: now() }, 14 * 86400000); console.info('[support:ticket]', JSON.stringify({ id, uid: uidOf(req), source: 'receipt' })); res.json({ ok: true, id, status: 'open' }); });
router.post('/support/callback', requireAuth, (_req, res) => res.json({ ok: true }));
router.get('/friends/list', requireAuth, (_req, res) => res.json({ ok: true, lists: { accepted: [], incoming: [], outgoing: [] }, counts: { accepted: 0, incoming: 0, outgoing: 0, online: 0 } }));
router.post('/friends/request', requireAuth, (req, res) => res.json({ ok: true, message: 'Arkadaşlık isteği işlendi.', request: { targetUid: s(req.body?.targetUid || req.body?.target, 128), at: now() } }));
router.post('/friends/respond', requireAuth, (_req, res) => res.json({ ok: true }));
router.post('/friends/remove', requireAuth, (_req, res) => res.json({ ok: true }));
router.get('/social-center/summary', requireAuth, async (req, res) => res.json({ ok: true, me: await readProfile(req), chatPolicy: { memoryOnly: true }, counts: { friends: 0, incoming: 0, notifications: 0 }, features: { globalChat: true, localChat: true, dm: true, presence: 'memory' } }));
router.get('/activity-pass', requireAuth, (_req, res) => res.json({ ok: true, active: true, claimable: false }));
router.post('/activity-pass/claim', requireAuth, (_req, res) => res.json({ ok: true, claimed: false }));
router.get('/chat/settings', requireAuth, (req, res) => res.json({ ok: true, mine: {}, theirs: {}, targetUid: s(req.query.targetUid, 128) }));
router.get('/chat/direct/list', requireAuth, (_req, res) => res.json({ ok: true, items: [] }));
router.get('/chat/direct/search', requireAuth, (_req, res) => res.json({ ok: true, items: [], nextCursor: '' }));
router.get('/chat/direct/history', requireAuth, (req, res) => { const key = [uidOf(req), s(req.query.targetUid || req.query.peerUid, 128)].sort().join('_'); res.json({ ok: true, items: runtimeStore.temporary.get(`dm:${key}`) || [], nextCursor: '' }); });
router.get('/chat/direct/unread-summary', requireAuth, (_req, res) => res.json({ ok: true, byPeer: {}, total: 0 }));
['edit','delete','archive','unarchive'].forEach(a => router.post(`/chat/direct/${a}`, requireAuth, (_req, res) => res.json({ ok: true })));
['block','unblock','mute','unmute','report'].forEach(a => router.post(`/chat/${a}`, requireAuth, (_req, res) => res.json({ ok: true })));

router.get('/pisti-online/lobby', requireAuth, attachProfile, (req, res) => { const rooms = runtimeStore.rooms.values().filter(r => r && r.id && String(r.id).startsWith('pisti_')).map(pistiGame.lobbyRoom); res.json({ ok: true, rooms }); });
router.get('/pisti-online/resume', requireAuth, attachProfile, (req, res) => { const uid = uidOf(req); const room = runtimeStore.rooms.values().find(r => r && r.id && String(r.id).startsWith('pisti_') && r.players?.some(p => p.uid === uid)); res.json({ ok: true, room: pistiGame.publicRoom(room, uid) }); });
router.post('/pisti-online/play-open', requireAuth, attachProfile, (req, res) => { const room = pistiGame.createRoom({ hostProfile: gameProfileFromReq(req), mode: req.body?.mode, bet: req.body?.bet, roomName: req.body?.roomName || `${req.__pmProfile.username} Masası` }); res.json({ ok: true, roomId: room.id, room: pistiGame.publicRoom(room, uidOf(req)) }); });
router.post('/pisti-online/create-private', requireAuth, attachProfile, (req, res) => { const room = pistiGame.createRoom({ hostProfile: gameProfileFromReq(req), mode: req.body?.mode, bet: req.body?.bet, isPrivate: true, roomName: req.body?.roomName || `${req.__pmProfile.username} Özel Masa`, password: req.body?.password }); room.status = 'waiting'; room.currentPlayers = 1; pistiGame.saveRoom(room); res.json({ ok: true, roomId: room.id, code: room.id.slice(-6).toUpperCase(), room: pistiGame.publicRoom(room, uidOf(req)) }); });
router.post('/pisti-online/join', requireAuth, attachProfile, (req, res) => { try { const roomId = s(req.body?.roomId || req.body?.code, 100); let room = pistiGame.getRoom(roomId); if (!room) room = pistiGame.createRoom({ hostProfile: gameProfileFromReq(req), mode: req.body?.mode, bet: req.body?.bet }); else if (!room.players.some(p => p.uid === uidOf(req))) room = pistiGame.joinRoom(room, gameProfileFromReq(req)); res.json({ ok: true, roomId: room.id, room: pistiGame.publicRoom(room, uidOf(req)) }); } catch(e){ res.status(400).json({ ok:false, error:e.message }); } });
router.post('/pisti-online/ping', requireAuth, (req, res) => res.json({ ok: true, room: pistiGame.publicRoom(pistiGame.getRoom(s(req.body?.roomId, 100)), uidOf(req)) }));
router.get('/pisti-online/state/:id', requireAuth, (req, res) => res.json({ ok: true, room: pistiGame.publicRoom(pistiGame.getRoom(s(req.params.id, 100)), uidOf(req)) }));
router.post('/pisti-online/play', requireAuth, (req, res) => { try { const room = pistiGame.getRoom(s(req.body?.roomId, 100)); if (!room) return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' }); const out = pistiGame.play(room, uidOf(req), s(req.body?.cardToken || req.body?.cardId || req.body?.card, 40)); res.json({ ok: true, captured: out.captured, pisti: out.pisti, room: pistiGame.publicRoom(out.room, uidOf(req)) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } });
router.post('/pisti-online/leave', requireAuth, (req, res) => { const room = pistiGame.getRoom(s(req.body?.roomId, 100)); if (room) { room.status = 'abandoned'; pistiGame.saveRoom(room); } res.json({ ok: true }); });

router.get('/chess/lobby', requireAuth, (_req, res) => { const rooms = runtimeStore.rooms.values().filter(r => r && r.id && String(r.id).startsWith('chess_')).map(chessGame.lobbyRoom); res.json({ ok: true, rooms }); });
router.get('/chess/resume', requireAuth, (req, res) => { const uid = uidOf(req); const room = runtimeStore.rooms.values().find(r => r && r.id && String(r.id).startsWith('chess_') && (r.host?.uid === uid || r.guest?.uid === uid)); res.json({ ok: true, room: chessGame.publicRoom(room) }); });
router.post('/chess/create', requireAuth, attachProfile, (req, res) => { const room = chessGame.createRoom({ hostProfile: gameProfileFromReq(req) }); res.json({ ok: true, roomId: room.id, room }); });
router.post('/chess/join', requireAuth, attachProfile, (req, res) => { try { let room = chessGame.getRoom(s(req.body?.roomId, 100)); if (!room) room = chessGame.createRoom({ hostProfile: gameProfileFromReq(req), guestProfile: { uid:'bot', username:'PlayMatrix Bot' } }); else if (!room.guest && room.host.uid !== uidOf(req)) room = chessGame.joinRoom(room, gameProfileFromReq(req)); res.json({ ok: true, roomId: room.id, room }); } catch(e){ res.status(400).json({ ok:false, error:e.message }); } });
router.get('/chess/state/:id', requireAuth, (req, res) => res.json({ ok: true, room: chessGame.publicRoom(chessGame.getRoom(req.params.id)) }));
router.post('/chess/ping', requireAuth, (req, res) => res.json({ ok: true, room: chessGame.publicRoom(chessGame.getRoom(s(req.body?.roomId, 100))) }));
router.post('/chess/move', requireAuth, (req, res) => { try { const room = chessGame.applyMove(chessGame.getRoom(s(req.body?.roomId, 100)), { uid: uidOf(req), from:req.body.from, to:req.body.to, promotion:req.body.promotion || 'q', move:req.body.move }); res.json({ ok:true, move: req.body.move || {from:req.body.from,to:req.body.to}, room }); } catch(e){ res.status(400).json({ ok:false, error:e.message }); } });
router.post('/chess/resign', requireAuth, (req, res) => { const room = chessGame.getRoom(s(req.body?.roomId, 100)); if (room) { room.status = 'finished'; room.winner = room.host.uid === uidOf(req) ? 'black' : 'white'; chessGame.saveRoom(room); } res.json({ ok: true, room }); });
router.post('/chess/leave', requireAuth, (_req, res) => res.json({ ok: true }));

router.get('/crash/resume', requireAuth, attachProfile, (req, res) => { const snap = crashGame.publicSnapshot(); const uid = uidOf(req); snap.bets = snap.activePlayers.filter(p => p.uid === uid); res.json(snap); });
router.get('/crash/active-bets', requireAuth, (req, res) => { const snap = crashGame.publicSnapshot(); const uid = uidOf(req); res.json({ ok: true, bets: snap.activePlayers.filter(p => p.uid === uid), round: snap, ...snap }); });
router.get('/crash/history', (_req, res) => res.json({ ok: true, items: crashGame.revealHistory() }));
router.post('/crash/bet', requireAuth, attachProfile, async (req, res) => { try { const result = crashGame.placeBet({ uid: uidOf(req), profile: gameProfileFromReq(req), box: req.body?.box, amount: req.body?.amount || req.body?.bet, autoCashout: req.body?.autoCashout }); const balanceResult = await addBalance(uidOf(req), -Math.abs(result.bet.amount), 'crash-bet', `crashbet:${result.roundId}:${uidOf(req)}:${result.bet.box}`); const user = await readProfile(req, uidOf(req)); res.json({ ok: true, ...result, balance: user.balance ?? balanceResult.balance, user }); } catch(e){ res.status(e.statusCode || 400).json({ ok:false, error:e.message }); } });
router.post('/crash/cashout', requireAuth, async (req, res) => { try { const result = crashGame.cashout({ uid: uidOf(req), box: req.body?.box }); const balanceResult = await addBalance(uidOf(req), result.winAmount, 'crash-cashout', `crashcash:${result.roundId}:${uidOf(req)}:${req.body?.box || 1}`); const user = await readProfile(req, uidOf(req)); res.json({ ok: true, ...result, balance: user.balance ?? balanceResult.balance, user }); } catch(e){ res.status(e.statusCode || 400).json({ ok:false, error:e.message }); } });

router.get('/chat/policy', requireAuth, (_req, res) => res.json({ ok: true, policy: { storage: 'memory', lobbyRetentionDays: 7, directRetentionDays: 14, presence: 'memory-only' } }));
router.get('/support/meta', requireAuth, (_req, res) => res.json({ ok: true, categories: ['Hesap', 'Oyun', 'Ödeme', 'Teknik'], channels: ['ticket', 'callback'], memoryOnlyLogs: true }));
router.post('/support/tickets', requireAuth, (req, res) => { const id = `ticket_${crypto.randomUUID()}`; const ticket = { id, uid: uidOf(req), subject: sanitizeText(req.body?.subject || 'Destek', 120), message: sanitizeText(req.body?.message || req.body?.note || '', 1000), status: 'open', at: now() }; runtimeStore.temporary.set(id, ticket, 14 * 86400000); console.info('[support:ticket]', JSON.stringify({ id, uid: ticket.uid, subject: ticket.subject })); res.status(201).json({ ok: true, ticket }); });
router.get('/support/tickets', requireAuth, (req, res) => { const uid = uidOf(req); const tickets = runtimeStore.temporary.values().filter(x => x && x.id && String(x.id).startsWith('ticket_') && x.uid === uid); res.json({ ok: true, items: tickets }); });
router.get('/rewards/center', requireAuth, (req, res) => res.json({ ok: true, dailyWheel: true, promo: true, emailVerifyReward: 100000, signupReward: 50000, notifications: { receiptDays: 30 }, claimable: [] }));
router.get('/rewards/catalog', requireAuth, (_req, res) => res.json({ ok: true, items: [{ id: 'signup', title: 'Kayıt Ödülü', amount: 50000 }, { id: 'email-verify', title: 'E-posta Onay Ödülü', amount: 100000 }, { id: 'daily-wheel', title: 'Günlük Çark' }, { id: 'promo', title: 'Promo Kod' }] }));
router.get('/matches/history', requireAuth, (_req, res) => res.json({ ok: true, items: [], nextCursor: '' }));
router.get('/achievements', requireAuth, (_req, res) => res.json({ ok: true, items: [] }));
router.get('/missions', requireAuth, (_req, res) => res.json({ ok: true, items: [] }));
router.get('/platform/control', requireAuth, (_req, res) => res.json({ ok: true, maintenance: false, gamesEnabled: true }));
router.get('/me/live-session', requireAuth, (req, res) => res.json({ ok: true, session: runtimeStore.presence.get(uidOf(req)) || null }));
router.get('/me/match-history', requireAuth, (_req, res) => res.json({ ok: true, items: [] }));
router.post('/classic/submit', requireAuth, async (req, res) => { const game = s(req.body?.game || req.body?.gameType || 'classic', 40); const score = Math.max(0, Math.floor(Number(req.body?.score) || 0)); const uid = uidOf(req); const runId = s(req.body?.runId || `${game}_${now()}`, 120); const { db } = fb(); const result = await runOnce({ key: `classic:${game}:${uid}:${runId}`, db, execute: async () => ({ game, score, reward: 0 }) }); res.json({ ok: true, game, score, ...result }); });
router.post('/update', requireAuth, async (req, res) => { const uid = uidOf(req); const patch = { fullName: s(req.body?.fullName, 80), username: s(req.body?.username, 32), avatar: s(req.body?.avatar, 1000), selectedFrame: Math.max(0, Math.min(18, Math.floor(Number(req.body?.selectedFrame) || 0))) }; if (patch.username) patch.usernameLower = patch.username.toLowerCase(); Object.keys(patch).forEach(k => { if (patch[k] === '' && k !== 'selectedFrame') delete patch[k]; }); await writeProfile(uid, patch); res.json({ ok: true, user: await readProfile(req, uid) }); });
router.post('/email/update/request-code', requireAuth, (req, res) => { const uid = uidOf(req); const id = `email_code_${uid}_${crypto.randomUUID()}`; runtimeStore.temporary.set(id, { uid, email: s(req.body?.email || req.body?.newEmail, 160), at: now(), used: false }, 15 * 60 * 1000); console.info('[email:update:code]', JSON.stringify({ uid, emailMasked: String(req.body?.email || req.body?.newEmail || '').replace(/(^.).*(@.*$)/, '$1***$2') })); res.json({ ok: true, codeSent: true, expiresInSec: 900, token: id }); });
router.post('/email/update/verify-code', requireAuth, async (req, res) => { const uid = uidOf(req); const token = s(req.body?.token, 160); const item = runtimeStore.temporary.get(token); if (!item || item.uid !== uid || item.used) return res.status(400).json({ ok: false, error: 'INVALID_OR_EXPIRED_CODE' }); item.used = true; const { auth } = fb(); if (auth) await auth.updateUser(uid, { email: item.email }).catch(() => null); await writeProfile(uid, { email: item.email, emailVerified: true }); res.json({ ok: true, email: item.email }); });

module.exports = router;

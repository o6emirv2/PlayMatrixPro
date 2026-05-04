const path = require('path');
const express = require('express');
const http = require('http');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const env = require('./server/config/env');
const { corsOptions } = require('./server/config/cors');
const firebase = require('./server/config/firebaseAdmin');
const { apiLimiter } = require('./server/core/security');
const { routeData } = require('./server/core/smartDataRouter');
const { runtimeStore } = require('./server/core/runtimeStore');
const { globalChat, localChat, dm, presence } = require('./server/social/socialRuntimeStore');
const { runSafeFirestoreCleanup } = require('./server/core/firestoreCleanupService');

process.on('unhandledRejection', (reason) => console.error('[process:unhandledRejection]', reason && reason.stack || reason));
process.on('uncaughtException', (error) => console.error('[process:uncaughtException]', error && error.stack || error));

const fb = firebase.initFirebaseAdmin();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: env.allowedOrigins, credentials: true } });

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
function resolveGameScopeFromPath(value = '') {
  const pathValue = String(value || '').toLowerCase();
  if (pathValue.includes('/chess') || pathValue.includes('/satranc') || pathValue.includes('/satranç')) return 'chess';
  if (pathValue.includes('/crash')) return 'crash';
  if (pathValue.includes('/social') || pathValue.includes('/chat') || pathValue.includes('/friends') || pathValue.includes('/wheel') || pathValue.includes('/promo') || pathValue.includes('/bonus') || pathValue.includes('/support') || pathValue.includes('/profile') || pathValue.includes('/leaderboard') || pathValue.includes('/user-stats') || pathValue === '/' || pathValue.includes('/index.html')) return 'home';
  return 'system';
}
function isExpectedClientOrApiStatus(statusCode = 0) {
  const status = Number(statusCode || 0);
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 409 || status === 422 || status === 429;
}
function shouldRecordApiIssue(req, statusCode) {
  const status = Number(statusCode || 0);
  if (status >= 500) return true;
  const scope = resolveGameScopeFromPath(req.originalUrl || req.url || '');
  if (scope !== 'home') return false;
  const pathValue = String(req.originalUrl || req.url || '').toLowerCase();
  if (isExpectedClientOrApiStatus(status)) return false;
  return pathValue.includes('/api/social') || pathValue.includes('/api/chat') || pathValue.includes('/api/wheel') || pathValue.includes('/api/promo') || pathValue.includes('/api/support') || pathValue.includes('/api/leaderboard') || pathValue.includes('/api/user-stats');
}
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400 && shouldRecordApiIssue(req, res.statusCode)) {
      const game = resolveGameScopeFromPath(req.originalUrl || req.url);
      const status = Number(res.statusCode || 0);
      const row = {
        id:`api_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        scope: status >= 500 ? 'api.error' : 'api.warning',
        area: game === 'system' ? 'Sunucu' : game === 'home' ? 'AnaSayfa Backend' : `${game === 'chess' ? 'Satranç' : 'Crash'} Backend`,
        game,
        method: req.method,
        path: req.originalUrl || req.url,
        status,
        ms: Date.now() - startedAt,
        requestId: req.headers['x-request-id'] || null,
        message:`${req.method} ${req.originalUrl || req.url} ${status}`,
        error:`${req.method} ${req.originalUrl || req.url} ${status}`,
        reason: status >= 500 ? 'Sunucu tarafında beklenmeyen hata oluştu.' : 'Oyun API isteği backend tarafından reddedildi.',
        solution: status >= 500 ? 'Render logu ve ilgili oyun backend route kontrol edilmeli.' : 'İstek parametreleri, auth durumu ve oyun stateVersion uyumu kontrol edilmeli.',
        createdAt:Date.now(),
        severity:status >= 500 ? 'error' : 'warning'
      };
      runtimeStore.errors.set(row.id, row, 24*3600000);
      const tag = status >= 500 ? '[api:error]' : '[api:warning]';
      const log = status >= 500 ? console.error : console.warn;
      log(tag, JSON.stringify({ method: row.method, path: row.path, status: row.status, ms: row.ms, requestId: row.requestId, game: row.game }));
    }
  });
  next();
});
app.use(apiLimiter);
app.use(express.static(__dirname, { extensions: ['html'], maxAge: env.nodeEnv === 'production' ? '1h' : 0, redirect: false }));

function healthPayload() { return { ok:true, service:'playmatrix', env:env.nodeEnv, firebaseEnabled: !!fb.enabled, time:Date.now() }; }
app.get('/healthz', (_req,res)=>res.json(healthPayload()));
app.get('/api/healthz', (_req,res)=>res.json(healthPayload()));

app.use('/api', require('./server/routes/auth.routes'));
app.use('/api', require('./server/routes/user.routes'));
app.use('/api', require('./server/routes/admin.routes'));
app.use('/api', require('./server/routes/economy.routes'));
app.use('/api', require('./server/routes/notification.routes'));
app.use('/api', require('./server/routes/social.routes'));
app.use('/api', require('./server/routes/email.routes'));
app.use('/api', require('./server/routes/market.routes'));
app.use('/api', require('./server/routes/wheel.routes'));
app.use('/api', require('./server/routes/promo.routes'));
app.use('/api', require('./server/routes/support.routes'));
app.use('/api', require('./server/routes/compat.routes'));

const crashGame = require('./server/games/crash');
const chessGame = require('./server/games/chess');
const pistiGame = require('./server/games/pisti');
app.use(['/api/games/crash','/api/crash'], crashGame.router);
app.use(['/api/games/chess','/api/chess'], chessGame.router);
app.use(['/api/games/pisti','/api/pisti-online'], pistiGame.router);
app.use(['/api/games/snake-pro','/api/games/snake'], require('./server/games/snake-pro').router);
app.use(['/api/games/space-pro','/api/games/space'], require('./server/games/space-pro').router);
app.use('/api/games/pattern-master', require('./server/games/pattern-master').router);

async function captureClientError(req, res) {
  const payload = { ...(req.body || {}), path: req.body?.path || req.headers.referer || '', userAgent: req.headers['user-agent'] || '', at: Date.now() };
  const game = String(payload.game || resolveGameScopeFromPath(`${payload.path || ''} ${payload.source || ''} ${payload.scope || ''} ${payload.endpoint || ''}`)).toLowerCase();
  const sourceText = `${payload.path || ''} ${payload.source || ''} ${payload.scope || ''} ${payload.endpoint || ''}`.toLowerCase();
  const isSupportedScope = game === 'chess' || game === 'crash' || game === 'home' || sourceText.includes('/games/chess') || sourceText.includes('/api/chess') || sourceText.includes('/games/crash') || sourceText.includes('/api/crash') || sourceText.includes('crash-app') || sourceText.includes('satranc') || sourceText.includes('/api/social') || sourceText.includes('/api/chat') || sourceText.includes('/api/wheel') || sourceText.includes('/api/promo') || sourceText.includes('/api/support') || sourceText.includes('legacy-home') || sourceText.includes('script.js') || sourceText.includes('/index.html') || sourceText.includes('anasayfa');
  if (!isSupportedScope) return res.status(202).json({ ok:true, discarded:'unsupported-scope' });
  const normalizedGame = game === 'crash' || sourceText.includes('crash') ? 'crash' : (game === 'chess' || sourceText.includes('chess') || sourceText.includes('satranc')) ? 'chess' : 'home';
  const message = String(payload.message || payload.error || '').trim();
  const code = message.toUpperCase();
  const scope = String(payload.scope || payload.type || 'client.error');
  const status = Number(payload.status || 0) || 0;
  const expectedCodes = new Set(['LOAD FAILED','FAILED TO FETCH','NETWORKERROR','ABORTERROR','SOCKET_TIMEOUT','SOCKET_OFFLINE','STATE_VERSION_MISMATCH','ROOM_NOT_FOUND','ROOM_CLOSED','CASHOUT_NOT_AVAILABLE','CASHOUT_TOO_LATE','BET_ALREADY_LOST','BET_REFUNDED','REFUND_IN_PROGRESS','AUTO_CASHOUT_MISSED','AUTH_REQUIRED','UNAUTHENTICATED','USER_CANCELLED']);
  const isHomeDataContractIssue = normalizedGame === 'home' && /undefined|schema|contract|policy|chat|socket|route|wheel|promo|support|frame|avatar/i.test(`${message} ${scope} ${sourceText}`);
  if (!isHomeDataContractIssue && (expectedCodes.has(code) || (status >= 400 && status < 500) || /load failed|failed to fetch|networkerror|abort/i.test(message))) {
    return res.status(202).json({ ok:true, discarded:'expected-flow' });
  }
  const dedupeKey = `clientIssue:${normalizedGame}:${scope}:${message.slice(0,120)}:${String(payload.source || payload.endpoint || '').slice(-80)}:${payload.line || ''}`;
  if (runtimeStore.temporary.get(dedupeKey)) return res.status(202).json({ ok:true, deduped:true });
  runtimeStore.temporary.set(dedupeKey, true, 10 * 60 * 1000);
  const row = {
    ...payload,
    id:`client_${normalizedGame}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    game: normalizedGame,
    scope,
    area: normalizedGame === 'chess' ? 'Satranç Frontend' : normalizedGame === 'crash' ? 'Crash Frontend' : 'AnaSayfa Frontend',
    error: String(payload.message || payload.error || 'Frontend hata kaydı').slice(0, 400),
    reason: String(payload.reason || `Kaynak: ${String(payload.source || payload.endpoint || 'bilinmiyor').slice(0, 180)}${payload.line ? `:${payload.line}` : ''}`).slice(0, 400),
    solution: String(payload.solution || 'İlgili oyun script dosyası, socket ACK akışı ve backend API cevabı gerçek hata detayıyla kontrol edilmeli.').slice(0, 400),
    createdAt: Date.now(),
    severity: payload.severity || 'error'
  };
  runtimeStore.errors.set(row.id, row, 24*3600000);
  console.error('[client:runtime:error]', JSON.stringify({ game: row.game, scope: row.scope, message: row.error, path: String(row.path || '').slice(0, 180), source: String(row.source || '').slice(0, 180), line: row.line || null }));
  res.status(202).json({ ok:true, stored:'runtime' });
}
app.post('/api/client/error', captureClientError);
app.post('/api/client-errors', captureClientError);

const gamePages = Object.freeze({
  'crash': 'crash', 'chess': 'chess', 'satranc': 'chess', 'satranç': 'chess',
  'pisti': 'pisti', 'pişti': 'pisti', 'snake': 'snake-pro', 'snakepro': 'snake-pro', 'snake-pro': 'snake-pro',
  'space': 'space-pro', 'spacepro': 'space-pro', 'space-pro': 'space-pro', 'pattern-master': 'pattern-master',
  'patternmaster': 'pattern-master'
});
function sendGamePage(slug, res, next) {
  const safeSlug = gamePages[String(slug || '').toLowerCase()] || '';
  if (!safeSlug) return next();
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.sendFile(path.join(__dirname, 'games', safeSlug, 'index.html'));
}
app.get('/games/:slug', (req, res, next) => sendGamePage(req.params.slug, res, next));
app.get('/games/:slug/', (req, res, next) => sendGamePage(req.params.slug, res, next));
const legacyGameAliases = Object.freeze({
  '/Online Oyunlar/Crash.html': '/games/crash', '/Online Oyunlar/Crash': '/games/crash', '/Online%20Oyunlar/Crash.html': '/games/crash', '/Crash.html': '/games/crash', '/crash': '/games/crash',
  '/Online Oyunlar/Pisti.html': '/games/pisti', '/Online Oyunlar/Pisti': '/games/pisti', '/Online%20Oyunlar/Pisti.html': '/games/pisti', '/Pisti.html': '/games/pisti', '/pisti': '/games/pisti',
  '/Online Oyunlar/Satranc.html': '/games/chess', '/Online Oyunlar/Satranc': '/games/chess', '/Online%20Oyunlar/Satranc.html': '/games/chess', '/Satranc.html': '/games/chess', '/satranc': '/games/chess',
  '/Klasik Oyunlar/SnakePro.html': '/games/snake-pro', '/Klasik Oyunlar/SnakePro': '/games/snake-pro', '/Klasik%20Oyunlar/SnakePro.html': '/games/snake-pro', '/games/snake': '/games/snake-pro',
  '/Klasik Oyunlar/SpacePro.html': '/games/space-pro', '/Klasik Oyunlar/SpacePro': '/games/space-pro', '/Klasik%20Oyunlar/SpacePro.html': '/games/space-pro', '/games/space': '/games/space-pro',
  '/Klasik Oyunlar/PatternMaster.html': '/games/pattern-master', '/Klasik Oyunlar/PatternMaster': '/games/pattern-master', '/Klasik%20Oyunlar/PatternMaster.html': '/games/pattern-master'
});
for (const [from, to] of Object.entries(legacyGameAliases)) app.get(from, (_req, res) => res.redirect(302, to));

const CHAT_POLICY = Object.freeze({
  memoryOnly: true,
  lobbyDays: 7,
  directDays: 14,
  lobbyLabel: 'Global 7 Gün',
  directLabel: 'DM 14 Gün',
  summaryLabel: 'Global 7 Gün · DM 14 Gün',
  manualDeleteLabel: 'Kullanıcı tarafından silindi',
  cleanupLabel: 'Saklama süresi dolduğu için temizlendi',
  lobbyDisclosure: 'Yerel sohbet mesajları Render in-memory içinde tutulur; restart olursa silinir, en fazla 7 gün görünür.',
  directDisclosure: 'DM mesajları Render in-memory içinde tutulur; restart olursa silinir, en fazla 14 gün görünür.',
  tombstoneDisclosure: 'Silinen mesaj içerikleri boş gösterilir; manuel silme ve süre temizliği ayrı etiketlenir.',
  searchDisclosure: 'Mesaj arama yalnızca aktif in-memory mesajlarda çalışır.',
  transparencyNote: 'Bu alan Firebase maliyeti oluşturmadan geçici çalışır.'
});
function sanitizeSocketText(value = '', max = 500) { return String(value || '').trim().replace(/[<>]/g, '').slice(0, max); }
async function authenticateSocket(socket) {
  if (socket.data?.pmUid) return socket.data;
  const token = String(socket.handshake?.auth?.token || socket.handshake?.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return socket.data || {};
  try {
    const latest = firebase.initFirebaseAdmin();
    if (!latest.auth) return socket.data || {};
    const decoded = await latest.auth.verifyIdToken(token);
    socket.data.pmUid = String(decoded.uid || '');
    socket.data.pmEmail = String(decoded.email || '');
    if (socket.data.pmUid) socket.join(`user:${socket.data.pmUid}`);
  } catch (error) {
    socket.emit('pm:auth_error', { ok:false, error:'BAD_TOKEN' });
  }
  return socket.data || {};
}
function publicLobbyMessages() {
  return localChat.values().sort((a,b)=>Number(a.at||0)-Number(b.at||0)).slice(-100);
}
function directKey(a, b) { return [String(a || ''), String(b || '')].filter(Boolean).sort().join('_'); }
function emitCallback(done, payload) { if (typeof done === 'function') { try { done(payload); } catch (_) {} } }
io.on('connection', socket => {
  runtimeStore.presence.set(socket.id, { socketId: socket.id, at: Date.now() });
  authenticateSocket(socket).catch(() => null);
  socket.on('presence:update', async data => { const ctx = await authenticateSocket(socket); const uid = ctx.pmUid || data?.uid || socket.id; const row = { socketId: socket.id, uid, ...data, at: Date.now() }; runtimeStore.presence.set(socket.id, row); if (uid) presence.set(uid, row); io.emit('social:presence_update', row); });
  socket.on('social:set_presence', async data => { const ctx = await authenticateSocket(socket); const uid = ctx.pmUid || data?.uid || socket.id; const row = { socketId: socket.id, uid, ...data, at: Date.now() }; runtimeStore.presence.set(socket.id, row); if (uid) presence.set(uid, row); io.emit('social:presence_update', row); });
  socket.on('chat:lobby_load_history', async (_data, done) => { await authenticateSocket(socket); const payload = { ok:true, policy: CHAT_POLICY, messages: publicLobbyMessages() }; socket.emit('chat:lobby_history', payload); emitCallback(done, payload); });
  socket.on('chat:lobby_send', async (data = {}, done) => {
    const ctx = await authenticateSocket(socket);
    const uid = ctx.pmUid || '';
    if (!uid) { const out = { ok:false, error:'AUTH_REQUIRED', message:'Mesaj için oturum gerekli.' }; socket.emit('chat:lobby_error', out); return emitCallback(done, out); }
    const message = sanitizeSocketText(data.message || data.text || '', 280);
    if (!message) { const out = { ok:false, error:'EMPTY_MESSAGE', message:'Mesaj boş bırakılamaz.' }; socket.emit('chat:lobby_error', out); return emitCallback(done, out); }
    const msg = { id:`lobby_${Date.now()}_${Math.random().toString(36).slice(2)}`, uid, username:sanitizeSocketText(data.username || ctx.pmEmail || 'Oyuncu', 80), avatar:sanitizeSocketText(data.avatar || '', 500), text:message, message, at:Date.now(), scope:'tr' };
    localChat.set(msg.id, msg, 7 * 86400000);
    io.emit('chat:lobby_new', msg);
    emitCallback(done, { ok:true, message:msg, policy:CHAT_POLICY });
  });
  socket.on('chat:dm_load_history', async (data = {}, done) => { const ctx = await authenticateSocket(socket); const uid = ctx.pmUid || ''; const targetUid = sanitizeSocketText(data.targetUid || data.peerUid || '', 160); const key = directKey(uid, targetUid); const messages = key ? (dm.get(key) || []) : []; const payload = { ok:true, targetUid, peerUid:targetUid, messages, policy:CHAT_POLICY }; socket.emit('chat:dm_history', payload); emitCallback(done, payload); });
  socket.on('chat:dm_send', async (data = {}, done) => { const ctx = await authenticateSocket(socket); const fromUid = ctx.pmUid || ''; const toUid = sanitizeSocketText(data.toUid || data.targetUid || '', 160); const message = sanitizeSocketText(data.message || data.text || '', 500); if (!fromUid || !toUid || !message) { const out = { ok:false, error:'DM_INVALID_PAYLOAD', message:'DM için kullanıcı ve mesaj gerekli.' }; socket.emit('chat:dm_error', out); return emitCallback(done, out); } const key = directKey(fromUid, toUid); const list = dm.get(key) || []; const msg = { id:`dm_${Date.now()}_${Math.random().toString(36).slice(2)}`, clientTempId:data.clientTempId || '', fromUid, byUid:fromUid, toUid, targetUid:toUid, text:message, message, at:Date.now() }; const next = [...list, msg].slice(-200); dm.set(key, next, 14 * 86400000); socket.emit('chat:dm_success', { ok:true, targetUid:toUid, clientTempId:data.clientTempId, message:msg }); socket.emit('chat:dm_new', msg); io.to(`user:${toUid}`).emit('chat:dm_new', msg); emitCallback(done, { ok:true, message:msg }); });
  socket.on('chat:typing', async (data = {}) => { const ctx = await authenticateSocket(socket); const fromUid = ctx.pmUid || ''; const toUid = sanitizeSocketText(data.toUid || data.targetUid || '', 160); if (fromUid && toUid) io.to(`user:${toUid}`).emit('chat:typing_status', { fromUid, isTyping: !!data.isTyping, at:Date.now() }); });
  socket.on('game:invite_send', async (data = {}, done) => { const ctx = await authenticateSocket(socket); const hostUid = ctx.pmUid || ''; const targetUid = sanitizeSocketText(data.targetUid || '', 160); if (!hostUid || !targetUid) { const out = { ok:false, error:'INVITE_INVALID_PAYLOAD', message:'Davet için hedef kullanıcı gerekli.' }; socket.emit('game:invite_error', out); return emitCallback(done, out); } const invite = { id:`invite_${Date.now()}_${Math.random().toString(36).slice(2)}`, inviteId:`invite_${Date.now()}_${Math.random().toString(36).slice(2)}`, hostUid, targetUid, roomId:sanitizeSocketText(data.roomId || '', 160), gameKey:sanitizeSocketText(data.gameKey || data.gameCode || 'chess', 40), gameName:sanitizeSocketText(data.gameName || 'Oyun Daveti', 80), at:Date.now() }; runtimeStore.gameInvites.set(invite.id, invite, 90 * 1000); io.to(`user:${targetUid}`).emit('game:invite_receive', invite); socket.emit('game:invite_success', invite); emitCallback(done, { ok:true, ...invite }); });
  socket.on('game:invite_response', data => socket.broadcast.emit('game:invite_response', { ...(data || {}), at: Date.now() }));
  socket.on('game:matchmake_join', data => socket.emit('game:matchmake_joined', { ok:true, queued:false, gameType:data?.gameType || data?.game || 'unknown', message:'HTTP lobby active' }));
  socket.on('game:matchmake_leave', () => socket.emit('game:matchmake_left', { ok:true }));
  socket.on('client:error', data => { console.error('[socket:client:error]', JSON.stringify({ socketId: socket.id, data })); runtimeStore.errors.set(`socket_${Date.now()}_${socket.id}`, data || {}, 24*3600000); });
  socket.on('matchmaking:join', data => socket.emit('matchmaking:status', { ok:true, queued:false, game:data?.game || 'unknown', message:'HTTP lobby active' }));
  socket.on('matchmaking:leave', () => socket.emit('matchmaking:left', { ok:true }));
  socket.on('disconnect', () => { const uid = socket.data?.pmUid; runtimeStore.presence.delete(socket.id); if (uid) presence.delete(uid); });
});
crashGame.installSocketcrashGame.installSocket?.(io);
chessGame.installSocket?.(io);
pistiGame.installSocket?.(io);

setInterval(()=>{ Object.values(runtimeStore).forEach(store => store.prune && store.prune()); }, 60_000).unref();

(async () => {
  try {
    const latest = firebase.initFirebaseAdmin();
    const dryRun = process.env.FIRESTORE_CLEANUP_DRY_RUN !== '0' || process.env.FIRESTORE_CLEANUP_ENABLED !== '1';
    const report = await runSafeFirestoreCleanup({ db: latest.db, dryRun, limit: 100 });
    console.info('[firebase:cleanup]', JSON.stringify({ ...report, legacyFields: Array.isArray(report.legacyFields) ? report.legacyFields.length : 0 }));
  } catch (error) {
    console.error('[firebase:cleanup:error]', { message: error.message });
  }
})();

app.use((req,res)=>res.status(404).json({ ok:false, error:'NOT_FOUND' }));
app.use((err,req,res,next)=>{ const status = Number(err?.statusCode || 500) || 500; const game = String(req.originalUrl || req.url).includes('/chess') ? 'chess' : String(req.originalUrl || req.url).includes('/crash') ? 'crash' : 'system'; if (status >= 500) { const row = { id:`server_${Date.now()}_${Math.random().toString(36).slice(2)}`, scope:'server.error', game, area: game === 'chess' ? 'Satranç Backend' : game === 'crash' ? 'Crash Backend' : 'Sunucu', error:err?.message || String(err), message:err?.message || String(err), reason:'Backend exception oluştu.', solution:'Render logundaki stack trace ile ilgili route/modül kontrol edilmeli.', stack:String(err?.stack || '').slice(0,2000), path:req.originalUrl || req.url, method:req.method, status, createdAt:Date.now(), severity:'error' }; runtimeStore.errors.set(row.id, row, 24*3600000); console.error('[server:error]', JSON.stringify({ message: row.message, stack: row.stack, path: row.path, method: row.method, game: row.game })); } res.status(status).json({ ok:false, error: status >= 500 ? (err.message === 'INSUFFICIENT_BALANCE' ? 'INSUFFICIENT_BALANCE' : 'INTERNAL_ERROR') : (err?.message || 'REQUEST_REJECTED') }); });
const port = Number(process.env.PORT || 3000);
if (require.main === module) server.listen(port, () => console.log(`[playmatrix] listening on ${port}`));
module.exports = { app, server, io };

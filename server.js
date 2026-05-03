const path = require('path');
const express = require('express');
const http = require('http');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const env = require('./server/config/env');
const { corsOptions } = require('./server/config/cors');
const { initFirebaseAdmin } = require('./server/config/firebaseAdmin');
const { apiLimiter } = require('./server/core/security');
const { routeData } = require('./server/core/smartDataRouter');
const { runtimeStore } = require('./server/core/runtimeStore');
initFirebaseAdmin();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: env.allowedOrigins, credentials: true } });
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      console.error('[api:error]', JSON.stringify({ method: req.method, path: req.originalUrl || req.url, status: res.statusCode, ms: Date.now() - startedAt, requestId: req.headers['x-request-id'] || null }));
    }
  });
  next();
});
app.use(apiLimiter);
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), { maxAge: env.nodeEnv === 'production' ? '7d' : 0 }));
app.use(express.static(__dirname, { extensions: ['html'], maxAge: env.nodeEnv === 'production' ? '1h' : 0 }));
app.get('/healthz', (req,res)=>res.json({ ok:true, service:'playmatrix', env:env.nodeEnv, time:Date.now() }));
app.use('/api', require('./server/routes/compat.routes'));
app.use('/api', require('./server/routes/auth.routes'));
app.use('/api', require('./server/routes/user.routes'));
app.use('/api', require('./server/routes/admin.routes'));
app.use('/api', require('./server/routes/economy.routes'));
app.use('/api', require('./server/routes/notification.routes'));
app.use('/api', require('./server/routes/social.routes'));
app.use('/api', require('./server/routes/email.routes'));
app.use('/api/games/pisti', require('./server/games/pisti').router);
app.use('/api/games/chess', require('./server/games/chess').router);
app.use('/api/games/crash', require('./server/games/crash').router);
app.use('/api/games/snake', require('./server/games/snake').router);
app.use('/api/games/space', require('./server/games/space').router);
app.use('/api/games/pattern-master', require('./server/games/pattern-master').router);
async function captureClientError(req, res) {
  const payload = { ...(req.body || {}), path: req.body?.path || req.headers.referer || '', userAgent: req.headers['user-agent'] || '', at: Date.now() };
  runtimeStore.errors.set(`${Date.now()}_${Math.random()}`, payload, 24*3600000);
  console.error('[client:error]', JSON.stringify({ type: payload.type || 'client', message: String(payload.message || '').slice(0, 400), path: String(payload.path || '').slice(0, 240), source: String(payload.source || '').slice(0, 240), line: payload.line || null }));
  await routeData({ classification:'IMPORTANT', collection:'clientErrors', payload });
  res.status(202).json({ ok:true });
}
app.post('/api/client/error', captureClientError);
app.post('/api/client-errors', captureClientError);
const gamePages = Object.freeze({
  'crash': 'crash', 'chess': 'chess', 'satranc': 'chess', 'satranç': 'chess',
  'pisti': 'pisti', 'pişti': 'pisti', 'snake': 'snake', 'snakepro': 'snake',
  'space': 'space', 'spacepro': 'space', 'pattern-master': 'pattern-master',
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
  '/Klasik Oyunlar/SnakePro.html': '/games/snake', '/Klasik Oyunlar/SnakePro': '/games/snake', '/Klasik%20Oyunlar/SnakePro.html': '/games/snake',
  '/Klasik Oyunlar/SpacePro.html': '/games/space', '/Klasik Oyunlar/SpacePro': '/games/space', '/Klasik%20Oyunlar/SpacePro.html': '/games/space',
  '/Klasik Oyunlar/PatternMaster.html': '/games/pattern-master', '/Klasik Oyunlar/PatternMaster': '/games/pattern-master', '/Klasik%20Oyunlar/PatternMaster.html': '/games/pattern-master'
});
for (const [from, to] of Object.entries(legacyGameAliases)) app.get(from, (_req, res) => res.redirect(302, to));
io.on('connection', socket => { runtimeStore.presence.set(socket.id, { socketId: socket.id, at: Date.now() }); socket.on('presence:update', data => runtimeStore.presence.set(socket.id, { socketId: socket.id, ...data, at: Date.now() })); socket.on('client:error', data => { console.error('[socket:client:error]', JSON.stringify({ socketId: socket.id, data })); runtimeStore.errors.set(`socket_${Date.now()}_${socket.id}`, data || {}, 24*3600000); }); socket.on('matchmaking:join', data => socket.emit('matchmaking:status', { ok:true, queued:true, game:data?.game || 'unknown' })); socket.on('matchmaking:leave', data => socket.emit('matchmaking:left', { ok:true })); socket.on('disconnect', () => runtimeStore.presence.delete(socket.id)); });
setInterval(()=>{ Object.values(runtimeStore).forEach(store => store.prune && store.prune()); }, 60_000).unref();
app.use((req,res)=>res.status(404).json({ ok:false, error:'NOT_FOUND' }));
app.use((err,req,res,next)=>{ console.error('[server:error]', JSON.stringify({ message: err?.message || String(err), stack: err?.stack || '', path: req.originalUrl || req.url, method: req.method })); res.status(500).json({ ok:false, error:'INTERNAL_ERROR' }); });
const port = Number(process.env.PORT || 3000);
if (require.main === module) server.listen(port, () => console.log(`[playmatrix] listening on ${port}`));
module.exports = { app, server, io };

'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const config = require('./server/config/env');
const { socketCors } = require('./server/config/cors');
const { initFirebaseAdmin, getInitError } = require('./server/config/firebaseAdmin');
const { sweepRuntimeStore, pushRuntimeLog } = require('./server/core/runtimeStore');
const createAuthRouter = require('./server/routes/auth.routes');
const createUserRouter = require('./server/routes/user.routes');
const createAdminRouter = require('./server/routes/admin.routes');
const createEconomyRouter = require('./server/routes/economy.routes');
const createNotificationRouter = require('./server/routes/notification.routes');
const { mountChessModule } = require('./server/games/chess/chess.module');
const { mountPistiModule } = require('./server/games/pisti/pisti.module');
const { mountCrashModule } = require('./server/games/crash/crash.module');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: socketCors(),
  pingInterval: config.timers.socketPingIntervalMs,
  pingTimeout: config.timers.socketStaleTimeoutMs
});

function setCorsHeaders(req, res, next) {
  const origin = req.headers.origin;
  if (!origin || config.allowedOrigins.includes(origin)) {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
}

app.disable('x-powered-by');
app.use(setCorsHeaders);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json({ limit: config.security.requestJsonLimit }));
app.use(express.urlencoded({ extended: false, limit: config.security.requestJsonLimit }));
app.use(rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: true, legacyHeaders: false }));

app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: config.isProduction ? '7d' : 0 }));
app.use('/games', express.static(path.join(__dirname, 'games'), { maxAge: config.isProduction ? '1h' : 0 }));
app.use(express.static(__dirname, {
  extensions: ['html'],
  index: false,
  maxAge: config.isProduction ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/healthz', (_req, res) => {
  const firebaseError = getInitError();
  res.json({ ok: true, service: 'playmatrix-clean', uptimeSec: Math.round(process.uptime()), firebaseError: firebaseError ? firebaseError.message : null });
});

app.use('/api/auth', createAuthRouter());
app.use('/api/user', createUserRouter());
app.use('/api/admin', createAdminRouter());
app.use('/api/economy', createEconomyRouter());
app.use('/api/notifications', createNotificationRouter());

mountChessModule(app, io);
mountPistiModule(app, io);
mountCrashModule(app, io);

app.use((req, res) => {
  res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Kaynak bulunamadı.' });
});

app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const safe = statusCode < 500;
  pushRuntimeLog({
    level: safe ? 'warn' : 'error',
    type: 'http_error',
    message: err.message || 'Beklenmeyen hata',
    payload: { path: req.path, method: req.method, code: err.code || 'ERROR' }
  });
  res.status(statusCode).json({
    ok: false,
    code: err.code || 'ERROR',
    message: safe ? err.message : 'Sunucu hatası.'
  });
});

process.on('unhandledRejection', (reason) => {
  pushRuntimeLog({ level: 'error', type: 'unhandled_rejection', message: reason && reason.message ? reason.message : String(reason) });
});

process.on('uncaughtException', (err) => {
  pushRuntimeLog({ level: 'error', type: 'uncaught_exception', message: err.message, payload: { stack: err.stack } });
});

setInterval(sweepRuntimeStore, config.timers.socketMemorySweepIntervalMs).unref();

initFirebaseAdmin();
server.listen(config.port, () => {
  pushRuntimeLog({
    type: 'server_started',
    message: `PlayMatrix clean server listening on ${config.port}`,
    payload: { env: config.nodeEnv, origins: config.allowedOrigins }
  });
});

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const { Server } = require('socket.io');
const { env, publicRuntimeConfig, validateEnv } = require('./server/config/env');
const { createCorsMiddleware } = require('./server/config/cors');
const { initializeFirebaseAdmin, getAuth, firebaseStatus } = require('./server/config/firebaseAdmin');
const { startRuntimeSweep, runtimeStore, pushRuntimeError } = require('./server/core/runtimeStore');
const { ensureUserProfile } = require('./server/core/security');
const { registerMatchmaking } = require('./server/matchmaking/matchmakingService');

const authRoutes = require('./server/routes/auth.routes');
const userRoutes = require('./server/routes/user.routes');
const economyRoutes = require('./server/routes/economy.routes');
const notificationRoutes = require('./server/routes/notification.routes');
const adminRoutes = require('./server/routes/admin.routes');
const errorRoutes = require('./server/routes/error.routes');

const chessModule = require('./server/games/chess/chess.module');
const pistiModule = require('./server/games/pisti/pisti.module');
const crashModule = require('./server/games/crash/crash.module');
const { registerChessSocket } = require('./server/games/chess/chess.socket');
const { registerPistiSocket } = require('./server/games/pisti/pisti.socket');
const { registerCrashSocket } = require('./server/games/crash/crash.socket');

const app = express();
const server = http.createServer(app);
const missingEnv = validateEnv();
initializeFirebaseAdmin();
startRuntimeSweep();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(createCorsMiddleware());
app.use(express.json({ limit: '128kb' }));
app.use(express.urlencoded({ extended: false, limit: '128kb' }));
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use('/games', express.static(path.join(__dirname, 'games'), { extensions: ['html'], maxAge: '1h' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/script.js', (req, res) => res.sendFile(path.join(__dirname, 'script.js')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, env: env.nodeEnv, missingEnv, firebase: firebaseStatus(), runtime: { rooms: runtimeStore.rooms.values().length } });
});
app.get('/api/runtime-config', (req, res) => res.json({ ok: true, config: publicRuntimeConfig() }));

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/economy', economyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/report', errorRoutes);
app.use('/api/games/chess', chessModule.createRouter());
app.use('/api/games/pisti', pistiModule.createRouter());
app.use('/api/games/crash', crashModule.createRouter());

app.use(['/server', '/package.json', '/package-lock.json', '/.env.example', '/README.md', '/DELIVERY_REPORT.md', '/PROJECT_TREE.txt'], (req, res) => {
  res.status(404).json({ ok: false, error: 'NOT_FOUND' });
});

app.get('/games/:game', (req, res) => {
  res.sendFile(path.join(__dirname, 'games', req.params.game, 'index.html'));
});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const io = new Server(server, {
  cors: { origin: env.allowedOrigins, credentials: true },
  pingInterval: env.ttl.socketPingIntervalMs,
  pingTimeout: env.ttl.socketStaleTimeoutMs
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || '';
  if (!token) return next(new Error('AUTH_REQUIRED'));
  const auth = getAuth();
  if (!auth) return next(new Error('FIREBASE_ADMIN_UNAVAILABLE'));
  try {
    const decoded = await auth.verifyIdToken(token, true);
    socket.user = { uid: decoded.uid, email: decoded.email || '', name: decoded.name || decoded.email || decoded.uid };
    socket.data.user = socket.user;
    await ensureUserProfile(socket.user);
    runtimeStore.presence.set(socket.user.uid, { uid: socket.user.uid, socketId: socket.id, status: 'online', updatedAt: Date.now() });
    return next();
  } catch (error) {
    return next(new Error('INVALID_TOKEN'));
  }
});

const gameModules = { chess: chessModule, pisti: pistiModule, crash: crashModule };
registerMatchmaking(io, gameModules);
registerChessSocket(io);
registerPistiSocket(io);
registerCrashSocket(io);

io.on('connection', (socket) => {
  socket.emit('socket:ready', { uid: socket.user.uid });
  socket.on('disconnect', () => runtimeStore.presence.delete(socket.user.uid));
});

process.on('unhandledRejection', (error) => {
  const record = pushRuntimeError({ source: 'unhandledRejection', message: error?.message || String(error), stack: error?.stack || '' });
  console.error('[UNHANDLED_REJECTION]', record);
});
process.on('uncaughtException', (error) => {
  const record = pushRuntimeError({ source: 'uncaughtException', message: error?.message || String(error), stack: error?.stack || '' });
  console.error('[UNCAUGHT_EXCEPTION]', record);
});

server.listen(env.port, () => {
  console.log('[PLAYMATRIX_READY]', { port: env.port, env: env.nodeEnv, missingEnv, firebase: firebaseStatus() });
});

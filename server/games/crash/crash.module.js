'use strict';

const express = require('express');
const { registerCrashSocket } = require('./crash.socket');

function mountCrashModule(app, io) {
  const router = express.Router();
  router.get('/status', (_req, res) => res.json({ ok: true, game: 'crash', state: 'runtime', verifiedPayout: true }));
  app.use('/api/games/crash', router);
  registerCrashSocket(io);
}

module.exports = { mountCrashModule };

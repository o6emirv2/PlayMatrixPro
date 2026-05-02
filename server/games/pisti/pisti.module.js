'use strict';

const express = require('express');
const { registerPistiSocket } = require('./pisti.socket');

function mountPistiModule(app, io) {
  const router = express.Router();
  router.get('/status', (_req, res) => res.json({ ok: true, game: 'pisti', matchmaking: 'in-memory', state: 'runtime' }));
  app.use('/api/games/pisti', router);
  registerPistiSocket(io);
}

module.exports = { mountPistiModule };

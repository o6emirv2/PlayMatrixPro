'use strict';

const express = require('express');
const { registerChessSocket } = require('./chess.socket');

function mountChessModule(app, io) {
  const router = express.Router();
  router.get('/status', (_req, res) => res.json({ ok: true, game: 'chess', matchmaking: 'in-memory', state: 'runtime' }));
  app.use('/api/games/chess', router);
  registerChessSocket(io);
}

module.exports = { mountChessModule };

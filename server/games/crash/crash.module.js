const express = require('express');
const { runtimeStore } = require('../../core/runtimeStore');

function createRouter() {
  const router = express.Router();
  router.get('/rounds/:roundId', (req, res) => {
    const round = runtimeStore.rooms.get(`crash:${req.params.roundId}`);
    if (!round) return res.status(404).json({ ok: false, error: 'ROUND_NOT_FOUND' });
    return res.json({ ok: true, round });
  });
  return router;
}

module.exports = { game: 'crash', createRouter };

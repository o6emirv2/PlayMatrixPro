const express = require('express');
const { requireAuth } = require('../core/security');
const { runtimeStore } = require('../core/runtimeStore');
const { adjustBalance } = require('../core/balanceService');

const router = express.Router();

router.post('/economy/reward', requireAuth, async (req, res) => {
  try {
    const amount = Math.max(0, Math.min(1000000, Math.floor(Number(req.body.amount) || 0)));
    const reason = String(req.body.reason || 'reward').slice(0, 80).replace(/[<>]/g, '');
    const rewardId = String(req.body.rewardId || Date.now()).slice(0, 160);
    const key = `${req.user.uid}:${reason}:${rewardId}`;
    const result = await adjustBalance({ uid: req.user.uid, amount, reason, idempotencyKey: key, runtimeStore });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 400).json({ ok: false, error: error.code || error.message || 'ECONOMY_ERROR' });
  }
});

router.post('/economy/spend', requireAuth, async (req, res) => {
  try {
    const amount = Math.max(0, Math.min(1000000, Math.floor(Number(req.body.amount) || 0)));
    const reason = String(req.body.reason || 'spend').slice(0, 80).replace(/[<>]/g, '');
    const spendId = String(req.body.spendId || req.body.operationId || Date.now()).slice(0, 160);
    const result = await adjustBalance({ uid: req.user.uid, amount: -amount, reason, idempotencyKey: `${req.user.uid}:${reason}:${spendId}`, runtimeStore });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 409).json({ ok: false, error: error.code || error.message || 'ECONOMY_ERROR' });
  }
});

module.exports = router;

'use strict';

const express = require('express');
const { requireAuth } = require('../core/authMiddleware');
const { asyncRoute } = require('../core/security');
const { requireNumber, requireString } = require('../core/validation');
const { applyBalanceDelta } = require('../core/userService');
const { smartDataRouter } = require('../core/smartDataRouter');

function createEconomyRouter() {
  const router = express.Router();

  router.post('/apply-result', requireAuth, asyncRoute(async (req, res) => {
    const delta = requireNumber(req.body, 'delta', -100000, 100000);
    const reason = requireString(req.body, 'reason', 120);
    const idempotencyKey = requireString(req.body, 'idempotencyKey', 160);
    const result = await applyBalanceDelta(req.user.uid, delta, reason, idempotencyKey);
    await smartDataRouter({
      priority: 'CRITICAL',
      type: 'balance_delta',
      userId: req.user.uid,
      collection: 'auditEvents',
      id: `balance_${idempotencyKey}`,
      payload: { delta, reason, duplicate: result.duplicate }
    });
    res.json({ ok: true, ...result });
  }));

  return router;
}

module.exports = createEconomyRouter;

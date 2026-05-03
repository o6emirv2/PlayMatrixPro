const express = require('express');
const { requireAuth, requireAdmin } = require('../core/security');
const { listMarketItems, upsertMarketItem, purchaseItem, refundItem } = require('../core/marketService');
const router = express.Router();

router.get('/market/items', async (_req, res) => res.json({ ok: true, items: await listMarketItems() }));
router.post('/market/purchase', requireAuth, async (req, res) => {
  const result = await purchaseItem({ uid: req.user.uid, itemId: req.body.itemId, idempotencyKey: req.headers['idempotency-key'] || req.body.idempotencyKey });
  res.status(result.ok ? 200 : 400).json(result);
});
router.post('/admin/market/item', requireAuth, requireAdmin, async (req, res) => res.json(await upsertMarketItem(req.body || {})));
router.post('/admin/market/refund', requireAuth, requireAdmin, async (req, res) => {
  const result = await refundItem({ adminUid: req.user.uid, uid: req.body.uid, itemId: req.body.itemId, idempotencyKey: req.headers['idempotency-key'] || req.body.idempotencyKey });
  res.status(result.ok ? 200 : 400).json(result);
});
module.exports = router;

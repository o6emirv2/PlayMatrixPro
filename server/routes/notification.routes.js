const express = require('express');
const { verifyBearerToken } = require('../core/security');
const { createNotification, listRuntimeNotifications, ackNotifications } = require('../core/notificationService');

const router = express.Router();

router.get('/', verifyBearerToken, async (req, res) => {
  const list = listRuntimeNotifications(req.user.uid);
  return res.json({ ok: true, notifications: list });
});

router.post('/ack', verifyBearerToken, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const acknowledged = await ackNotifications(req.user.uid, ids);
  return res.json({ ok: true, acknowledged });
});

router.post('/demo', verifyBearerToken, async (req, res) => {
  const notification = createNotification({
    type: 'reward',
    userId: req.user.uid,
    source: 'demo',
    rewardId: 'manual-demo',
    title: 'Ödül hazır',
    message: 'Bu bildirim aynı kullanıcıda yalnızca bir kez gösterilir.',
    critical: true
  });
  return res.json({ ok: true, notification });
});

module.exports = router;

'use strict';

const express = require('express');
const { requireAuth } = require('../core/authMiddleware');
const { asyncRoute } = require('../core/security');
const { requireString } = require('../core/validation');
const { issueOnce, markShown } = require('../core/notificationService');

function createNotificationRouter() {
  const router = express.Router();

  router.get('/', requireAuth, asyncRoute(async (req, res) => {
    const welcome = await issueOnce({
      userId: req.user.uid,
      type: 'daily-login',
      source: 'home',
      rewardId: new Date().toISOString().slice(0, 10),
      title: 'PlayMatrix hesabın hazır',
      message: 'Günlük oturum bildirimi yalnızca bir kez gösterilir.',
      severity: 'info',
      persistent: false
    });
    res.json({ ok: true, notifications: welcome.delivered ? [welcome.notification] : [] });
  }));

  router.post('/mark-shown', requireAuth, asyncRoute(async (req, res) => {
    const notificationId = requireString(req.body, 'notificationId', 160);
    await markShown(req.user.uid, notificationId, {
      persistent: Boolean(req.body.persistent),
      type: req.body.type,
      source: req.body.source,
      rewardId: req.body.rewardId
    });
    res.json({ ok: true });
  }));

  return router;
}

module.exports = createNotificationRouter;

'use strict';

const express = require('express');
const { requireAdmin } = require('../core/authMiddleware');
const { asyncRoute } = require('../core/security');
const { runtimeStore } = require('../core/runtimeStore');
const { isFirebaseReady, getInitError } = require('../config/firebaseAdmin');

function createAdminRouter() {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    const initError = getInitError();
    res.json({
      ok: true,
      firebaseReady: isFirebaseReady(),
      firebaseInitError: initError ? initError.message : null,
      memory: {
        rooms: runtimeStore.rooms.size(),
        queues: runtimeStore.matchmakingQueues.size(),
        presence: runtimeStore.presence.size(),
        notifications: runtimeStore.notifications.size(),
        logs: runtimeStore.adminLogs.length
      },
      uptimeSec: Math.round(process.uptime())
    });
  });

  router.get('/runtime-logs', requireAdmin, asyncRoute(async (_req, res) => {
    res.json({ ok: true, logs: runtimeStore.adminLogs.slice(-200).reverse() });
  }));

  return router;
}

module.exports = createAdminRouter;

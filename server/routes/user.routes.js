'use strict';

const express = require('express');
const { requireAuth } = require('../core/authMiddleware');
const { asyncRoute, publicUser } = require('../core/security');
const { updateUserProfile } = require('../core/userService');
const { requireNumber, optionalString } = require('../core/validation');

function createUserRouter() {
  const router = express.Router();

  router.get('/profile', requireAuth, asyncRoute(async (req, res) => {
    res.json({ ok: true, user: publicUser(req.user.profile) });
  }));

  router.patch('/profile', requireAuth, asyncRoute(async (req, res) => {
    const displayName = optionalString(req.body, 'displayName', 60);
    const avatarUrl = optionalString(req.body, 'avatarUrl', 300);
    const profile = await updateUserProfile(req.user.uid, { displayName, avatarUrl });
    res.json({ ok: true, user: publicUser(profile) });
  }));

  router.post('/profile/avatar-frame', requireAuth, asyncRoute(async (req, res) => {
    const selectedFrame = requireNumber(req.body, 'selectedFrame', 1, 99);
    const profile = await updateUserProfile(req.user.uid, { selectedFrame });
    res.json({ ok: true, user: publicUser(profile), message: 'Çerçeve güncellendi.' });
  }));

  return router;
}

module.exports = createUserRouter;

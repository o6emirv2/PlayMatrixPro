'use strict';

const config = require('../config/env');
const { decodeToken } = require('./authMiddleware');
const { ensureUserProfile, DEMO_USER_ID } = require('./userService');

function socketAuthMiddleware() {
  return async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      const decoded = await decodeToken(token || '');
      const profile = await ensureUserProfile(decoded.uid || DEMO_USER_ID, {
        email: decoded.email || 'demo@playmatrix.local',
        displayName: decoded.name || 'Oyuncu'
      });
      socket.user = { uid: profile.uid, email: profile.email, displayName: profile.displayName, profile };
      return next();
    } catch (err) {
      if (config.security.demoAuthEnabled) {
        const profile = await ensureUserProfile(DEMO_USER_ID, { email: 'demo@playmatrix.local', displayName: 'Demo Oyuncu' });
        socket.user = { uid: profile.uid, email: profile.email, displayName: profile.displayName, profile };
        return next();
      }
      return next(err);
    }
  };
}

module.exports = { socketAuthMiddleware };

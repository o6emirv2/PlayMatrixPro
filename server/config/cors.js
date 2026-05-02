'use strict';

const config = require('./env');

function corsDelegate(req, callback) {
  const origin = req.header('Origin');
  if (!origin) return callback(null, { origin: true });
  if (config.allowedOrigins.includes(origin)) return callback(null, { origin: true, credentials: true });
  return callback(null, { origin: false });
}

function socketCors() {
  return {
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('CORS origin blocked'));
    },
    credentials: true
  };
}

module.exports = { corsDelegate, socketCors };

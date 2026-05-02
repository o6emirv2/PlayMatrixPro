const cors = require('cors');
const { env } = require('./env');

function createCorsMiddleware() {
  const allowed = new Set(env.allowedOrigins);
  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowed.has(origin)) return callback(null, true);
      return callback(new Error(`CORS origin rejected: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  });
}

module.exports = { createCorsMiddleware };

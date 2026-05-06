const env = require('./env');
function corsOptions(req, callback) {
  const origin = req.header('Origin');
  if (!origin) return callback(null, { origin: true, credentials: true });
  const allowed = new Set(env.allowedOrigins.concat([env.publicBaseUrl, env.canonicalOrigin, env.publicBackendOrigin]).filter(Boolean));
  callback(null, { origin: allowed.has(origin), credentials: true });
}
module.exports = { corsOptions };

const admin = require('firebase-admin');
const env = require('./env');
function parseServiceAccount(raw) {
  if (!raw || raw.includes('<PLAYMATRIXPRO_SERVICE_ACCOUNT_JSON>')) return null;
  const normalized = raw.trim();
  try { return JSON.parse(normalized); } catch {}
  try { return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')); } catch {}
  return null;
}
let app = null, db = null, auth = null;
function initFirebaseAdmin() {
  if (app) return { admin, app, db, auth, enabled: true };
  const serviceAccount = parseServiceAccount(env.firebase.serviceAccount);
  if (!serviceAccount) {
    console.warn('[firebase] FIREBASE_KEY missing or placeholder; Firebase Admin disabled for local smoke test.');
    return { admin, app: null, db: null, auth: null, enabled: false };
  }
  app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: env.firebase.storageBucket, projectId: env.firebase.projectId });
  db = admin.firestore();
  auth = admin.auth();
  console.info('[firebase] Admin initialized for project', env.firebase.projectId);
  return { admin, app, db, auth, enabled: true };
}
module.exports = { initFirebaseAdmin, get db(){ return db; }, get auth(){ return auth; } };

const admin = require('firebase-admin');
const { env } = require('./env');

let initialized = false;
let initError = null;

function parseServiceAccount(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const json = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8');
  const account = JSON.parse(json);
  if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, '\n');
  return account;
}

function initializeFirebaseAdmin() {
  if (initialized || admin.apps.length) {
    initialized = true;
    return admin;
  }
  try {
    const credentialSource = parseServiceAccount(env.firebase.serviceAccountJson);
    const credential = credentialSource ? admin.credential.cert(credentialSource) : admin.credential.applicationDefault();
    admin.initializeApp({
      credential,
      projectId: env.firebase.projectId || undefined,
      storageBucket: env.firebase.storageBucket || undefined
    });
    initialized = true;
    return admin;
  } catch (error) {
    initError = error;
    console.error('[FIREBASE_ADMIN_INIT_FAILED]', { message: error.message });
    return null;
  }
}

function getFirebaseAdmin() {
  return initialized ? admin : initializeFirebaseAdmin();
}

function getAuth() {
  const instance = getFirebaseAdmin();
  return instance ? instance.auth() : null;
}

function getDb() {
  const instance = getFirebaseAdmin();
  return instance ? instance.firestore() : null;
}

function firebaseStatus() {
  return { initialized, error: initError ? initError.message : null, projectId: env.firebase.projectId };
}

module.exports = { initializeFirebaseAdmin, getFirebaseAdmin, getAuth, getDb, firebaseStatus };

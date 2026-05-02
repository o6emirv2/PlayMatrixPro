'use strict';

const config = require('./env');
let admin = null;
let app = null;
let initError = null;

function parseServiceAccount(raw) {
  if (!raw || raw.includes('<')) return null;
  const text = String(raw).trim();
  try {
    return JSON.parse(text);
  } catch (_) {
    try {
      return JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
    } catch (err) {
      initError = err;
      return null;
    }
  }
}

function initFirebaseAdmin() {
  if (app) return app;
  const serviceAccount = parseServiceAccount(config.firebase.serviceAccountJson);
  if (!serviceAccount) return null;
  if (serviceAccount.project_id && serviceAccount.project_id !== config.firebase.projectId) {
    initError = new Error(`Firebase project mismatch: ${serviceAccount.project_id} != ${config.firebase.projectId}`);
    return null;
  }

  try {
    admin = require('firebase-admin');
    if (admin.apps.length) {
      app = admin.app();
    } else {
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.firebase.projectId,
        storageBucket: config.firebase.storageBucket
      });
    }
    return app;
  } catch (err) {
    initError = err;
    return null;
  }
}

function isFirebaseReady() {
  return Boolean(initFirebaseAdmin());
}

function getAdmin() {
  initFirebaseAdmin();
  return admin;
}

function getAuth() {
  initFirebaseAdmin();
  return admin && app ? admin.auth(app) : null;
}

function getDb() {
  initFirebaseAdmin();
  return admin && app ? admin.firestore(app) : null;
}

function getServerTimestamp() {
  initFirebaseAdmin();
  return admin ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
}

function getInitError() {
  return initError;
}

module.exports = {
  initFirebaseAdmin,
  isFirebaseReady,
  getAdmin,
  getAuth,
  getDb,
  getServerTimestamp,
  getInitError
};

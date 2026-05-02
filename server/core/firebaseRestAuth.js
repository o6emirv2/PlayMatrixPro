'use strict';

const config = require('../config/env');
const { makeHttpError } = require('./security');

async function firebaseRest(endpoint, payload) {
  if (!config.firebase.webApiKey || config.firebase.webApiKey.includes('<')) {
    throw makeHttpError(503, 'Firebase Web API Key ENV üzerinde tanımlı değil.', 'FIREBASE_WEB_KEY_MISSING');
  }
  const url = `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(config.firebase.webApiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw makeHttpError(401, data.error && data.error.message ? data.error.message : 'Firebase auth isteği başarısız.', 'FIREBASE_AUTH_FAILED');
  }
  return data;
}

function signInWithPassword(email, password) {
  return firebaseRest('accounts:signInWithPassword', { email, password, returnSecureToken: true });
}

module.exports = { signInWithPassword };

const { env } = require('../config/env');

async function firebaseAuthRequest(method, payload) {
  if (!env.firebase.webApiKey) {
    const error = new Error('FIREBASE_WEB_API_KEY_MISSING');
    error.code = 'FIREBASE_WEB_API_KEY_MISSING';
    throw error;
  }
  const url = `https://identitytoolkit.googleapis.com/v1/${method}?key=${encodeURIComponent(env.firebase.webApiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'FIREBASE_AUTH_REQUEST_FAILED');
    error.code = data?.error?.message || 'FIREBASE_AUTH_REQUEST_FAILED';
    throw error;
  }
  return data;
}

function signInWithPassword(email, password) {
  return firebaseAuthRequest('accounts:signInWithPassword', { email, password, returnSecureToken: true });
}

function updateEmailWithIdToken(idToken, email) {
  return firebaseAuthRequest('accounts:update', { idToken, email, returnSecureToken: true });
}

module.exports = { signInWithPassword, updateEmailWithIdToken };

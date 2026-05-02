'use strict';

const { makeHttpError, safeString, safeNumber, isValidEmail } = require('./security');

function requireString(body, key, max = 500) {
  const value = safeString(body && body[key], max);
  if (!value) throw makeHttpError(400, `${key} alanı zorunludur.`, 'VALIDATION_REQUIRED');
  return value;
}

function optionalString(body, key, max = 500) {
  return safeString(body && body[key], max);
}

function requireEmail(body, key = 'email') {
  const value = safeString(body && body[key], 254).toLowerCase();
  if (!isValidEmail(value)) throw makeHttpError(400, 'Geçerli bir e-posta adresi girin.', 'VALIDATION_EMAIL');
  return value;
}

function requireNumber(body, key, min, max) {
  const value = safeNumber(body && body[key], NaN, min, max);
  if (!Number.isFinite(value)) throw makeHttpError(400, `${key} sayısal olmalıdır.`, 'VALIDATION_NUMBER');
  return value;
}

function validateGameId(gameId) {
  const clean = safeString(gameId, 32).toLowerCase();
  if (!['chess', 'pisti', 'crash'].includes(clean)) {
    throw makeHttpError(400, 'Geçersiz oyun.', 'INVALID_GAME');
  }
  return clean;
}

module.exports = { requireString, optionalString, requireEmail, requireNumber, validateGameId };

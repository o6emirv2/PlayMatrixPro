'use strict';

const crypto = require('crypto');
let xss;
try { xss = require('xss'); } catch (_) { xss = (value) => String(value || ''); }

function createId(prefix = '') {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function safeString(value, max = 500) {
  return xss(String(value || '').slice(0, max).trim());
}

function safeNumber(value, fallback = 0, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function publicUser(user) {
  if (!user) return null;
  const { getProgression } = require('./progressionService');
  const progression = getProgression(user.xp || 0);
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Oyuncu',
    avatarUrl: user.avatarUrl || '/public/assets/avatars/fallback.svg',
    selectedFrame: Number(user.selectedFrame || 1),
    unlockedFrames: Array.isArray(user.unlockedFrames) && user.unlockedFrames.length ? user.unlockedFrames : [1],
    balance: Number(user.balance || 0),
    xp: String(user.xp || '0'),
    level: progression.level,
    progressPercent: progression.progressPercent,
    nextLevelXp: progression.nextLevelXp,
    role: user.role || 'user'
  };
}

function makeHttpError(statusCode, message, code = 'REQUEST_FAILED') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function getBearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

module.exports = {
  createId,
  sha256,
  normalizeEmail,
  isValidEmail,
  safeString,
  safeNumber,
  publicUser,
  makeHttpError,
  asyncRoute,
  getBearerToken
};

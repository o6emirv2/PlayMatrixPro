'use strict';

const crypto = require('crypto');
const env = require('../config/env');

const ADMIN_GATE_TTL_MS = 7 * 60 * 1000;
const CLIENT_KEY_TTL_MS = 12 * 60 * 60 * 1000;
const clean = (value = '', max = 240) => String(value || '').trim().slice(0, max);
const normalizeEmail = (value = '') => clean(value, 254).toLowerCase();
const now = () => Date.now();

function b64(value = '') { return Buffer.from(String(value), 'utf8').toString('base64url'); }
function unb64(value = '') { try { return Buffer.from(String(value), 'base64url').toString('utf8'); } catch { return ''; } }
function secret() {
  return [
    env.admin.secondFactorHashHex,
    env.admin.secondFactorSaltHex,
    env.admin.thirdFactorName,
    env.adminUids.join(','),
    env.adminEmails.join(','),
    env.firebase.projectId,
    'playmatrix_admin_matrix_v2_clean'
  ].map(x => clean(x, 1000)).join('|');
}
function signPayload(payload = {}) {
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySignedPayload(token = '') {
  const raw = String(token || '').trim();
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(unb64(body)); } catch { return null; }
}
function issueStepTicket({ uid = '', email = '', stage = 1, role = 'owner', source = 'admin_matrix' } = {}) {
  return signPayload({ typ: 'pm_admin_step', uid: clean(uid, 160), email: normalizeEmail(email), stage: Math.max(1, Math.min(4, Number(stage) || 1)), role: clean(role, 48), source: clean(source, 80), nonce: crypto.randomBytes(12).toString('hex'), issuedAt: now(), expiresAt: now() + ADMIN_GATE_TTL_MS });
}
function verifyStepTicket(ticket = '', expectedStage = 1) {
  const payload = verifySignedPayload(ticket);
  if (!payload || payload.typ !== 'pm_admin_step') return { ok: false, code: 'INVALID_STEP_TOKEN' };
  if ((Number(payload.stage) || 0) !== Number(expectedStage || 0)) return { ok: false, code: 'STEP_MISMATCH' };
  if ((Number(payload.expiresAt) || 0) < now()) return { ok: false, code: 'STEP_EXPIRED' };
  return { ok: true, payload: { ...payload, uid: clean(payload.uid, 160), email: normalizeEmail(payload.email) } };
}
function compareHex(a = '', b = '') {
  const left = clean(a, 512).toLowerCase();
  const right = clean(b, 512).toLowerCase();
  if (!left || !right || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
function candidateHashes(password = '', saltHex = '') {
  const pwd = Buffer.from(String(password || ''), 'utf8');
  const salt = /^[0-9a-f]+$/i.test(String(saltHex || '')) && String(saltHex).length % 2 === 0 ? Buffer.from(String(saltHex), 'hex') : Buffer.from(String(saltHex), 'utf8');
  const saltText = String(saltHex || '');
  return Array.from(new Set([
    crypto.createHash('sha256').update(Buffer.concat([salt, pwd])).digest('hex'),
    crypto.createHash('sha256').update(Buffer.concat([pwd, salt])).digest('hex'),
    crypto.createHash('sha256').update(`${saltText}${String(password || '')}`).digest('hex'),
    crypto.createHash('sha256').update(`${String(password || '')}${saltText}`).digest('hex'),
    crypto.createHmac('sha256', salt).update(pwd).digest('hex')
  ]));
}
function verifySecondFactor(password = '') {
  const plain = clean(process.env.ADMIN_PANEL_SECOND_FACTOR || '', 240);
  if (plain && String(password || '') === plain) return true;
  const stored = clean(env.admin.secondFactorHashHex, 256).toLowerCase();
  if (!stored) return false;
  return candidateHashes(password, env.admin.secondFactorSaltHex).some(h => compareHex(h, stored));
}
function verifyThirdFactor(name = '') {
  const expected = clean(env.admin.thirdFactorName, 240);
  const received = clean(name, 240);
  if (!expected || !received) return false;
  const a = Buffer.from(received.normalize('NFKC'));
  const b = Buffer.from(expected.normalize('NFKC'));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function issueClientGateKey({ uid = '', email = '', sessionId = '' } = {}) {
  return signPayload({ typ: 'pm_admin_client_key', uid: clean(uid, 160), email: normalizeEmail(email), sessionId: clean(sessionId, 160), nonce: crypto.randomBytes(10).toString('hex'), issuedAt: now(), expiresAt: now() + CLIENT_KEY_TTL_MS });
}
function verifyClientGateKey(key = '') {
  const payload = verifySignedPayload(key);
  if (!payload || payload.typ !== 'pm_admin_client_key') return { ok: false, code: 'INVALID_CLIENT_KEY' };
  if ((Number(payload.expiresAt) || 0) < now()) return { ok: false, code: 'CLIENT_KEY_EXPIRED' };
  return { ok: true, payload };
}
function configuredAdminByEmail(email = '') {
  const safe = normalizeEmail(email);
  const index = env.adminEmails.map(normalizeEmail).indexOf(safe);
  if (index < 0) return null;
  return { uid: env.adminUids[index] || env.adminUids[0] || safe, email: safe, role: 'owner', permissions: ['admin.read', 'users.write', 'rewards.write', 'system.read'] };
}
function isConfiguredAdmin({ uid = '', email = '' } = {}) {
  const safeUid = clean(uid, 160);
  const safeEmail = normalizeEmail(email);
  return (!!safeUid && env.adminUids.includes(safeUid)) || (!!safeEmail && env.adminEmails.map(normalizeEmail).includes(safeEmail));
}

module.exports = { normalizeEmail, issueStepTicket, verifyStepTicket, verifySecondFactor, verifyThirdFactor, issueClientGateKey, verifyClientGateKey, configuredAdminByEmail, isConfiguredAdmin, ADMIN_GATE_TTL_MS, CLIENT_KEY_TTL_MS };

const crypto = require('crypto');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { runtimeStore } = require('./runtimeStore');
const { debitBalance, creditBalance } = require('./economyService');

const DEFAULT_CATEGORIES = Object.freeze(['frames','avatars','profile-backgrounds','stats-backgrounds','profile-effects','chat-bubbles','name-colors']);
const memoryCatalog = new Map();
const memoryOwnership = new Map();
const now = () => Date.now();
function cleanId(v) { return String(v || '').trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, '').slice(0, 80); }
function ownKey(uid, itemId) { return `${uid}:${itemId}`; }
function normalizeItem(id, data = {}) {
  return { id: cleanId(id || data.id), title: String(data.title || data.name || id || '').slice(0,80), category: String(data.category || 'frames').slice(0,60), price: Number(data.price), active: data.active === true, stock: data.stock == null ? null : Math.max(0, Math.trunc(Number(data.stock) || 0)), asset: String(data.asset || data.src || '').slice(0,500), premium: !!data.premium, updatedAt: data.updatedAt || null };
}
async function listMarketItems() {
  const { db } = initFirebaseAdmin();
  if (!db) return [...memoryCatalog.entries()].map(([id, data]) => normalizeItem(id, data));
  const snap = await db.collection('marketItems').limit(500).get();
  return snap.docs.map((doc) => normalizeItem(doc.id, doc.data()));
}
async function upsertMarketItem(item = {}) {
  const normalized = normalizeItem(item.id, item);
  if (!normalized.id) return { ok: false, error: 'ITEM_ID_REQUIRED' };
  const { db } = initFirebaseAdmin();
  if (db) await db.collection('marketItems').doc(normalized.id).set({ ...normalized, updatedAt: now() }, { merge: true });
  else memoryCatalog.set(normalized.id, { ...normalized, updatedAt: now() });
  return { ok: true, item: normalized };
}
async function getItem(itemId) {
  const id = cleanId(itemId);
  const { db } = initFirebaseAdmin();
  if (!db) return memoryCatalog.has(id) ? normalizeItem(id, memoryCatalog.get(id)) : null;
  const snap = await db.collection('marketItems').doc(id).get();
  return snap.exists ? normalizeItem(snap.id, snap.data()) : null;
}
async function hasOwnership(uid, itemId) {
  const id = cleanId(itemId);
  if (!uid || !id) return false;
  const { db } = initFirebaseAdmin();
  if (!db) return memoryOwnership.has(ownKey(uid, id));
  const snap = await db.collection('marketOwnership').doc(ownKey(uid, id)).get();
  return snap.exists && snap.data().active !== false;
}
async function purchaseItem({ uid, itemId, idempotencyKey = '' }) {
  const item = await getItem(itemId);
  if (!uid) return { ok: false, error: 'AUTH_REQUIRED' };
  if (!item) return { ok: false, error: 'ITEM_NOT_FOUND' };
  if (!item.active || !Number.isFinite(item.price) || item.price <= 0 || item.stock === 0) return { ok: false, error: 'ITEM_UNAVAILABLE' };
  if (await hasOwnership(uid, item.id)) return { ok: true, owned: true, item };
  const key = idempotencyKey || `market:${uid}:${item.id}:${crypto.randomUUID()}`;
  const charge = await debitBalance({ uid, amount: item.price, reason: `market:${item.id}`, idempotencyKey: key, metadata: { itemId: item.id, category: item.category } });
  if (!charge.ok) return charge;
  const { db, admin } = initFirebaseAdmin();
  const ownershipId = ownKey(uid, item.id);
  if (!db || !admin) memoryOwnership.set(ownershipId, { uid, itemId: item.id, active: true, at: now() });
  else {
    await db.collection('marketOwnership').doc(ownershipId).set({ uid, itemId: item.id, active: true, purchasedAt: now(), price: item.price }, { merge: true });
    if (item.stock !== null) await db.collection('marketItems').doc(item.id).set({ stock: admin.firestore.FieldValue.increment(-1), updatedAt: now() }, { merge: true });
  }
  runtimeStore.notifications.set(`market:${uid}:${item.id}`, { uid, type:'market-purchase', itemId:item.id, at:now() }, 30*60000);
  return { ok: true, item, balance: charge.balance, purchase: { itemId: item.id, price: item.price } };
}
async function refundItem({ adminUid = '', uid, itemId, idempotencyKey = '' }) {
  const item = await getItem(itemId);
  if (!uid || !item) return { ok: false, error: 'UID_ITEM_REQUIRED' };
  const ownershipId = ownKey(uid, item.id);
  if (!(await hasOwnership(uid, item.id))) return { ok: false, error: 'OWNERSHIP_NOT_FOUND' };
  const refund = await creditBalance({ uid, amount: item.price, reason: `market-refund:${item.id}`, idempotencyKey: idempotencyKey || `refund:${ownershipId}:${crypto.randomUUID()}`, metadata: { adminUid, itemId: item.id } });
  if (!refund.ok) return refund;
  const { db } = initFirebaseAdmin();
  if (!db) memoryOwnership.delete(ownershipId);
  else await db.collection('marketOwnership').doc(ownershipId).set({ active: false, refundedAt: now(), refundedBy: adminUid }, { merge: true });
  return { ok: true, item, balance: refund.balance };
}
module.exports = { DEFAULT_CATEGORIES, listMarketItems, upsertMarketItem, purchaseItem, refundItem, hasOwnership };

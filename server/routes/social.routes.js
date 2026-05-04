const express = require('express');
const { requireAuth } = require('../core/security');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const { globalChat, localChat, dm, presence } = require('../social/socialRuntimeStore');
const friends = require('../social/friendshipService');

const router = express.Router();
const MAX_CHAT_TEXT = 500;
const MAX_SEARCH_RESULTS = 50;

function cleanText(value = '', max = MAX_CHAT_TEXT) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, max);
}
function directKey(a, b) {
  return [String(a || ''), String(b || '')].filter(Boolean).sort().join('_');
}
function getChatStore(scope = '') {
  return String(scope).toLowerCase() === 'tr' ? localChat : globalChat;
}
function normalizeFriendship(row = {}, viewerUid = '') {
  const fromUid = String(row.fromUid || '');
  const toUid = String(row.toUid || '');
  const members = Array.isArray(row.members) ? row.members.map(String) : [fromUid, toUid].filter(Boolean);
  const peerUid = members.find(uid => uid && uid !== viewerUid) || toUid || fromUid || '';
  return { id: row.id || directKey(fromUid, toUid), ...row, fromUid, toUid, members, peerUid, status: String(row.status || 'pending') };
}
async function listFriendRows(uid) {
  const { db } = initFirebaseAdmin();
  const rows = await friends.listFriends(db, uid);
  return rows.map(row => normalizeFriendship(row, uid));
}
function friendCounts(items = [], viewerUid = '') {
  return items.reduce((acc, row) => {
    const status = String(row.status || 'pending').toLowerCase();
    if (status === 'accepted') acc.accepted += 1;
    else if (row.toUid === viewerUid) acc.incoming += 1;
    else acc.outgoing += 1;
    return acc;
  }, { accepted: 0, incoming: 0, outgoing: 0 });
}
function listDirectConversations(uid) {
  return dm.entries()
    .filter(([key]) => key.split('_').includes(uid))
    .map(([key, messages]) => {
      const list = Array.isArray(messages) ? messages : [];
      const last = list[list.length - 1] || {};
      const peerUid = key.split('_').find(part => part && part !== uid) || last.peerUid || last.toUid || last.fromUid || '';
      return {
        id: key,
        peerUid,
        username: peerUid,
        count: list.length,
        lastMessage: last.text || last.message || '',
        lastAt: Number(last.at || 0),
        messages: list.slice(-20)
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);
}

router.get('/social/chat/:scope', (req, res) => {
  const store = getChatStore(req.params.scope);
  const messages = store.values().sort((a, b) => Number(a.at || 0) - Number(b.at || 0)).slice(-100);
  res.json({ ok: true, messages, policy: { lobbyDays: 7, directDays: 14 } });
});

router.post('/social/chat/:scope', requireAuth, (req, res) => {
  const store = getChatStore(req.params.scope);
  const text = cleanText(req.body.text || req.body.message || '', 280);
  if (!text) return res.status(422).json({ ok: false, error: 'EMPTY_MESSAGE' });
  const msg = {
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    uid: req.user.uid,
    username: cleanText(req.body.username || req.user.email || 'Oyuncu', 80),
    avatar: cleanText(req.body.avatar || '', 500),
    text,
    message: text,
    at: Date.now(),
    scope: String(req.params.scope || 'tr')
  };
  store.set(msg.id, msg, 7 * 86400000);
  res.json({ ok: true, message: msg });
});

router.get(['/social/dm/:peerUid', '/chat/direct/:peerUid'], requireAuth, (req, res) => {
  const key = directKey(req.user.uid, req.params.peerUid);
  res.json({ ok: true, peerUid: req.params.peerUid, messages: dm.get(key) || [] });
});

router.post(['/social/dm/:peerUid', '/chat/direct/:peerUid'], requireAuth, (req, res) => {
  const peerUid = cleanText(req.params.peerUid || req.body.targetUid || req.body.toUid || '', 160);
  const text = cleanText(req.body.text || req.body.message || '', 500);
  if (!peerUid || !text) return res.status(422).json({ ok: false, error: 'DM_INVALID_PAYLOAD' });
  const key = directKey(req.user.uid, peerUid);
  const list = dm.get(key) || [];
  const msg = {
    id: `dm_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    fromUid: req.user.uid,
    byUid: req.user.uid,
    toUid: peerUid,
    targetUid: peerUid,
    peerUid,
    text,
    message: text,
    at: Date.now()
  };
  const next = [...list, msg].slice(-200);
  dm.set(key, next, 14 * 86400000);
  res.json({ ok: true, message: msg, messages: next });
});

router.get('/chat/direct/list', requireAuth, (req, res) => {
  res.json({ ok: true, items: listDirectConversations(req.user.uid) });
});

router.get('/chat/direct/search', requireAuth, (req, res) => {
  const q = cleanText(req.query.q || '', 80).toLowerCase();
  if (!q) return res.json({ ok: true, items: [] });
  const items = [];
  for (const conversation of listDirectConversations(req.user.uid)) {
    for (const message of conversation.messages || []) {
      const text = String(message.text || message.message || '');
      if (text.toLowerCase().includes(q)) items.push({ ...message, peerUid: conversation.peerUid });
      if (items.length >= MAX_SEARCH_RESULTS) break;
    }
    if (items.length >= MAX_SEARCH_RESULTS) break;
  }
  res.json({ ok: true, items });
});

router.post('/social/presence', requireAuth, (req, res) => {
  presence.set(req.user.uid, { uid: req.user.uid, status: cleanText(req.body.status || 'online', 40), game: cleanText(req.body.game || '', 80), at: Date.now() });
  res.json({ ok: true });
});

router.get(['/social/friends', '/friends/list'], requireAuth, async (req, res, next) => {
  try {
    const items = await listFriendRows(req.user.uid);
    res.json({ ok: true, friends: items, items, counts: friendCounts(items, req.user.uid) });
  } catch (error) { next(error); }
});

router.post(['/social/friends/request', '/friends/request'], requireAuth, async (req, res, next) => {
  try {
    const toUid = cleanText(req.body.toUid || req.body.targetUid || '', 160);
    if (!toUid || toUid === req.user.uid) return res.status(422).json({ ok: false, error: 'INVALID_TARGET_UID' });
    const { db } = initFirebaseAdmin();
    const result = await friends.requestFriend(db, req.user.uid, toUid);
    res.json({ ok: true, targetUid: toUid, ...result });
  } catch (error) { next(error); }
});

module.exports = router;

const express = require('express');
const { requireAuth } = require('../core/security');
const { presence } = require('../social/socialRuntimeStore');

const router = express.Router();
const SOCIAL_DISABLED_PAYLOAD = Object.freeze({
  ok: true,
  disabled: true,
  status: 'maintenance',
  message: 'Sosyal Merkez anlık kullanıma kapalıdır. Bildirimler paneli aktif kalır.'
});

router.get('/social/status', (_req, res) => res.json(SOCIAL_DISABLED_PAYLOAD));
router.get('/social/chat/:scope', (_req, res) => res.json({ ...SOCIAL_DISABLED_PAYLOAD, messages: [] }));
router.post('/social/chat/:scope', requireAuth, (_req, res) => res.status(423).json({ ...SOCIAL_DISABLED_PAYLOAD, ok: false, error: 'SOCIAL_CENTER_DISABLED' }));
router.get('/social/dm/:peerUid', requireAuth, (_req, res) => res.json({ ...SOCIAL_DISABLED_PAYLOAD, messages: [] }));
router.post('/social/dm/:peerUid', requireAuth, (_req, res) => res.status(423).json({ ...SOCIAL_DISABLED_PAYLOAD, ok: false, error: 'SOCIAL_CENTER_DISABLED' }));
router.post('/social/presence', requireAuth, (req, res) => { presence.set(req.user.uid, { uid: req.user.uid, status: 'offline', disabled: true, at: Date.now() }); res.json(SOCIAL_DISABLED_PAYLOAD); });
router.get('/social/friends', requireAuth, (_req, res) => res.json({ ...SOCIAL_DISABLED_PAYLOAD, friends: [] }));
router.post('/social/friends/request', requireAuth, (_req, res) => res.status(423).json({ ...SOCIAL_DISABLED_PAYLOAD, ok: false, error: 'SOCIAL_CENTER_DISABLED' }));
router.get('/chat/direct/list', requireAuth, (_req, res) => res.json({ ...SOCIAL_DISABLED_PAYLOAD, items: [] }));
router.get('/chat/direct/search', requireAuth, (_req, res) => res.json({ ...SOCIAL_DISABLED_PAYLOAD, items: [] }));
router.get('/friends/list', requireAuth, (_req, res) => res.json({ ...SOCIAL_DISABLED_PAYLOAD, counts: { accepted: 0, incoming: 0, outgoing: 0 }, friends: [] }));
router.post('/friends/request', requireAuth, (_req, res) => res.status(423).json({ ...SOCIAL_DISABLED_PAYLOAD, ok: false, error: 'SOCIAL_CENTER_DISABLED' }));

module.exports = router;

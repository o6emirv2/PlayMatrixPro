const express = require('express');
const { requireAuth, requireAdmin } = require('../core/security');
const { runtimeStore } = require('../core/runtimeStore');
const router = express.Router();
router.post('/support/message', requireAuth, (req, res) => {
  const msg = { id:`support_${Date.now()}_${Math.random().toString(36).slice(2)}`, uid:req.user.uid, email:req.user.email || '', subject:String(req.body.subject || 'Destek').slice(0,140).replace(/[<>]/g,''), category:String(req.body.category || 'home').slice(0,80).replace(/[<>]/g,''), reference:String(req.body.reference || req.body.source || req.headers.referer || '').slice(0,180).replace(/[<>]/g,''), source:String(req.body.source || req.headers.referer || 'home').slice(0,160), urgency:String(req.body.urgency || req.body.priority || 'normal').slice(0,40), text:String(req.body.text || req.body.message || '').slice(0,1000).replace(/[<>]/g,''), status:'open', at:Date.now() };
  runtimeStore.support.set(msg.id, msg, 24*3600000);
  console.info('[support:message]', JSON.stringify({ id: msg.id, uid: msg.uid, urgency: msg.urgency, source: msg.source }));
  res.status(202).json({ ok:true, message: msg });
});
router.get('/admin/support/runtime', requireAuth, requireAdmin, (_req, res) => res.json({ ok:true, messages: runtimeStore.support.values().sort((a,b)=>b.at-a.at) }));
module.exports = router;

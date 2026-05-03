const express = require('express'); const { requireAuth } = require('../core/security'); const { initFirebaseAdmin } = require('../config/firebaseAdmin'); const { shouldShowNotification, markNotificationShown } = require('../core/notificationService');
const router = express.Router();
router.post('/notifications/check', requireAuth, async (req,res)=>{ const { db } = initFirebaseAdmin(); const notificationId = String(req.body.notificationId || ''); res.json({ ok:true, show: await shouldShowNotification({ userId:req.user.uid, notificationId, db }) }); });
router.post('/notifications/ack', requireAuth, async (req,res)=>{ const { db } = initFirebaseAdmin(); res.json(await markNotificationShown({ userId:req.user.uid, notificationId:String(req.body.notificationId||''), type:String(req.body.type||'generic'), db })); });
module.exports = router;

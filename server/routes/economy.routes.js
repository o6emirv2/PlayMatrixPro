const express = require('express');
const { verifyBearerToken } = require('../core/security');
const { getBalance } = require('../core/economyService');

const router = express.Router();

router.get('/balance', verifyBearerToken, async (req, res) => {
  const balance = await getBalance(req.user.uid);
  return res.json({ ok: true, balance });
});

module.exports = router;

const express = require('express');
const { pushRuntimeError } = require('../core/runtimeStore');
const { safeString } = require('../core/security');
const router = express.Router();

router.post('/client-error', (req, res) => {
  const record = pushRuntimeError({
    source: 'frontend',
    message: safeString(req.body.message, 400),
    path: safeString(req.body.path, 200),
    stack: safeString(req.body.stack, 1200)
  });
  console.error('[CLIENT_ERROR]', record);
  res.json({ ok: true });
});

module.exports = router;

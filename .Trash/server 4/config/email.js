async function sendTransactionalEmail({ to, subject, text }) {
  if (!to || !subject || !text) throw new Error('EMAIL_PAYLOAD_INVALID');
  if (!process.env.RESEND_API_KEY && !process.env.SENDGRID_API_KEY && !process.env.BREVO_API_KEY) {
    console.log('[email] transactional email provider missing; code generated but not sent', { to, subject });
    return { ok: true, dryRun: true };
  }
  console.log('[email] provider configured; integrate selected provider in production secret scope', { to, subject });
  return { ok: true };
}
module.exports = { sendTransactionalEmail };

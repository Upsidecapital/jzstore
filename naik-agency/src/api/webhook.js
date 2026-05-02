const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { routeMessage } = require('../bot/router');

// Verify that the incoming request is genuinely from Meta using HMAC-SHA256
function verifyMetaSignature(req) {
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WHATSAPP_TOKEN)
    .update(req.rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// Meta sends a GET to verify the webhook endpoint during setup
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified by Meta');
    return res.status(200).send(challenge);
  }
  console.warn('❌ Webhook verification failed');
  return res.sendStatus(403);
});

// All incoming WhatsApp messages arrive here as POST
router.post('/', async (req, res) => {
  // Always return 200 immediately — Meta retries on non-200 and floods the queue
  res.sendStatus(200);

  if (!verifyMetaSignature(req)) {
    console.warn('❌ Invalid Meta signature — request rejected');
    return;
  }

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value || !value.messages) continue;

      for (const message of value.messages) {
        const phoneNumberId = value.metadata?.phone_number_id;
        const from = message.from; // customer's WhatsApp number (60XXXXXXXXX)

        // Parse message content based on type
        let text = '';
        if (message.type === 'text') {
          text = message.text?.body || '';
        } else if (message.type === 'interactive') {
          // Button replies and list replies
          text =
            message.interactive?.button_reply?.id ||
            message.interactive?.list_reply?.id ||
            '';
        }

        if (!text.trim()) continue;

        console.log(`📨 [${from}] → "${text}"`);

        // Fire-and-forget: route the message; errors are caught inside routeMessage
        routeMessage({ from, text, phoneNumberId, message }).catch((err) =>
          console.error(`❌ routeMessage error [${from}]:`, err.message)
        );
      }
    }
  }
});

module.exports = router;
// ✅ src/api/webhook.js complete

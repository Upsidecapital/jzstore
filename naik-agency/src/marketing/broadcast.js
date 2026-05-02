// PHASE 2 — WhatsApp Broadcast Campaign Sender
// Sends approved template messages to a client's customer list via WhatsApp Cloud API

const axios = require('axios');
const { complete } = require('../utils/claude');
const { createBroadcast } = require('../db/queries');

// Generate a broadcast message using Claude
async function generateBroadcast(client, theme) {
  const halalNote = client.is_halal ? 'Business is halal certified.' : '';
  return complete({
    systemPrompt: `You write WhatsApp broadcast messages for Malaysian F&B businesses.
${halalNote} Messages must be warm, under 100 words, and include a clear call-to-action.
Write in the business's language preference. Best sent Thu 7pm or Sun 11am (MYT).`,
    userMessage: `Write a "${theme}" broadcast for ${client.business_name} in ${client.area || 'KL'}.`,
    maxTokens: 300,
  });
}

// Send a broadcast to a list of WhatsApp numbers using an approved template
// Note: Mass messages via WhatsApp must use pre-approved message templates (HSM)
async function sendBroadcast(client, recipients, templateName, templateParams) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  let sent = 0;

  for (const phone of recipients) {
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'ms' },
            components: templateParams,
          },
        },
        { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
      );
      sent++;
      // WhatsApp rate limit: max 80 msg/s — 50ms gap keeps us well within limit
      await new Promise((r) => setTimeout(r, 50));
    } catch (err) {
      console.error(`⚠️ Broadcast send failed to ${phone}:`, err.message);
    }
  }

  await createBroadcast({
    client_id: client.id,
    message_body: templateName,
    template_name: templateName,
    recipient_count: sent,
    sent_at: new Date().toISOString(),
    status: 'sent',
  });

  console.log(`📢 Broadcast sent to ${sent}/${recipients.length} recipients`);
  return sent;
}

module.exports = { generateBroadcast, sendBroadcast };
// ✅ src/marketing/broadcast.js complete

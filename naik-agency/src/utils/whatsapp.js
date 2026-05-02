const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

// Send a plain text message to a WhatsApp number
async function sendMessage(to, text, phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID) {
  await axios.post(
    `${BASE_URL}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// Send a quick-reply button message (up to 3 buttons)
async function sendButtons(to, bodyText, buttons, phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID) {
  await axios.post(
    `${BASE_URL}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// Send a document (PDF receipt) as a WhatsApp attachment
async function sendDocument(to, documentUrl, filename, phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID) {
  await axios.post(
    `${BASE_URL}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link: documentUrl, filename },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// Rate-limited send — never fire more than 1 message/second to the same number
async function sendWithDelay(to, text, delayMs = 1000) {
  await sendMessage(to, text);
  await new Promise((r) => setTimeout(r, delayMs));
}

module.exports = { sendMessage, sendButtons, sendDocument, sendWithDelay };
// ✅ src/utils/whatsapp.js complete

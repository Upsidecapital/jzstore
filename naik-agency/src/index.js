require('dotenv').config();

// Fail fast on startup if critical env vars are missing
const REQUIRED_ENV = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WEBHOOK_VERIFY_TOKEN',
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const bodyParser = require('body-parser');

const webhookRouter = require('./api/webhook');
const paymentCallbackRouter = require('./api/payment');

const app = express();
const PORT = process.env.PORT || 3000;

// Raw body needed for Meta webhook signature verification
app.use(
  '/webhook',
  bodyParser.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Payment callbacks use standard JSON
app.use('/payment', bodyParser.json());

app.use('/webhook', webhookRouter);
app.use('/payment', paymentCallbackRouter);

// Health check — Railway/Render needs this
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`🚀 Naik Agency server running on port ${PORT}`);
  console.log(`📱 Webhook: POST /webhook  |  Health: GET /health`);
});

// ✅ src/index.js complete

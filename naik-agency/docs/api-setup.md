# WhatsApp Business Cloud API Setup Guide

## Prerequisites
- Facebook Business Manager account
- Verified business (or use test number during dev)
- Meta Developer account at developers.facebook.com

## Step 1 — Create a Meta App
1. Go to developers.facebook.com → My Apps → Create App
2. Select **Business** type
3. Name it e.g. "Naik Agency Bot"
4. Under "Add Products", add **WhatsApp**

## Step 2 — Get your credentials
From the WhatsApp → API Setup page:
- **Phone Number ID** → set as `WHATSAPP_PHONE_NUMBER_ID`
- **WhatsApp Business Account ID** → set as `WHATSAPP_BUSINESS_ACCOUNT_ID`
- **Temporary access token** → set as `WHATSAPP_TOKEN` (rotate before going live)

For production, generate a **System User token** with `whatsapp_business_messaging` permission.

## Step 3 — Configure the webhook
1. Go to WhatsApp → Configuration → Webhook
2. Set Callback URL: `https://your-domain.com/webhook`
3. Set Verify Token: same value as `WEBHOOK_VERIFY_TOKEN` in your `.env`
4. Subscribe to: **messages**, **message_deliveries**, **message_reads**

## Step 4 — Test with ngrok (local dev)
```bash
npx ngrok http 3000
# Copy the https:// URL and use it as your Callback URL
```

## Step 5 — Send a test message
Use the Meta API Explorer or curl:
```bash
curl -X POST "https://graph.facebook.com/v19.0/$WHATSAPP_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $WHATSAPP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"60XXXXXXXXX","type":"text","text":{"body":"Hello from Naik Agency!"}}'
```

## Going Live
- Submit your app for Business Verification
- Apply for the `whatsapp_business_messaging` permission
- Approved message templates are required for broadcasts (not for session messages)

# Client Onboarding Guide — New Café Setup

## What you need from the client (Day 1 call)
- [ ] Business name (exact as on Google Maps)
- [ ] WhatsApp Business number (the one customers will message)
- [ ] Owner's WhatsApp number (for order notifications)
- [ ] Area / full address
- [ ] Halal status (certified / no pork no lard / not halal)
- [ ] Language preference (EN / BM / ZH)
- [ ] Menu (item names, prices, categories) — can be WhatsApp photo of menu
- [ ] Google Business Profile link (for review monitoring)
- [ ] Instagram handle (for content scheduling)

## Step 1 — Create client record in Supabase
Insert a row in the `clients` table with their details.
Note the `id` (UUID) — you'll need it for menu items.

## Step 2 — Digitise the menu
Insert rows into `menu_items` for each item.
Assign sequential `item_number` values starting from 1.
Rule: max 20 items for WhatsApp readability. Group into categories.

## Step 3 — Set up WhatsApp Business number
- Client must have a WhatsApp Business account (app or API)
- For API-level ordering: migrate their number to WhatsApp Business Cloud API
  (this requires them to lose the mobile app access — warn them)
- Alternatively: use a dedicated number for the ordering bot

## Step 4 — Configure webhook routing
In `src/api/webhook.js`, the `phoneNumberId` in Meta's webhook payload maps
to the client's number. `getClientByWhatsapp(phoneNumberId)` must return their record.
Ensure `clients.whatsapp_number` matches the `phone_number_id` from Meta.

## Step 5 — Test end-to-end
1. Send "hi" to the bot number
2. Confirm greeting shows correct business name
3. Send "menu" — confirm all items show with correct prices in RM
4. Place a test order
5. Complete a RM1.00 test payment
6. Confirm receipt and owner notification arrive

## Step 6 — Handover
- Share bot WhatsApp number with client
- Show them how to check orders in Supabase (or build dashboard later)
- Set up their Google review monitoring (Phase 2)
- Schedule their first broadcast (Phase 2)

## One-Time Fees to Charge
- WhatsApp ordering system setup: RM799
- Menu digitisation + onboarding: RM299
- Chatbot setup (FAQ config): RM499

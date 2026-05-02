# CLAUDE.md — Master Build Prompt
# Project: Malaysian WhatsApp-First AI CMO & Direct Ordering Platform
# Version: 1.0 | Author: Upside Capital

---

## 🧠 WHO YOU ARE

You are a senior full-stack engineer and product architect building a
WhatsApp-first AI marketing and direct ordering platform for Malaysian
F&B small businesses (cafés, bubble tea shops, restaurants).

You write clean, production-ready code with inline comments explaining
every decision. You never build what isn't asked. You always suggest the
simplest solution first before a complex one. When you hit a decision
point, you state your assumption and proceed — you do not ask 10
clarifying questions before writing a single line of code.

You are deeply familiar with:
- Malaysian payment infrastructure (iPay88, Toyyibpay, FPX, DuitNow)
- WhatsApp Business Cloud API (Meta)
- Malaysia's F&B SMB context (halal, Manglish, multi-language: BM/EN/ZH)
- No-code/low-code tools: Make.com, Wati.io, Glide, Airtable, Notion
- AI APIs: Anthropic Claude (claude-sonnet-4-20250514), OpenAI

---

## 🏢 BUSINESS OVERVIEW

**Company name:** Naik Agency (placeholder)
**Business model:** B2B SaaS + managed service hybrid
**Target customers:** Malaysian F&B SMBs (cafés, bubble tea, restaurants)
  with 1–5 outlets, no dedicated marketing officer, doing RM5k–50k/mo revenue
**Geography:** Start in KL / PJ / Selangor, expand SEA in Year 2
**Core problem solved:**
  1. F&B owners pay GrabFood/FoodPanda 25–35% commission per order
  2. They have no consistent marketing (no content, unanswered reviews,
     dead Instagram, zero WhatsApp strategy)
  3. They cannot afford a RM5,000/mo marketing agency

**Core value proposition:**
  "Replace GrabFood commissions and your missing marketing officer
   with one WhatsApp-native AI system — from RM499/month."

---

## 🛍️ PRODUCT SUITE (7 PRODUCTS)

### PRODUCT 1 — WhatsApp Direct Ordering System [CORE — BUILT ✅]
### PRODUCT 2 — Google Review Management [Phase 2]
### PRODUCT 3 — Monthly Social Media Content Pack [Phase 2]
### PRODUCT 4 — WhatsApp Broadcast Campaigns [Phase 2]
### PRODUCT 5 — Monthly Email Newsletter [Phase 2]
### PRODUCT 6 — WhatsApp AI Chatbot (FAQ Bot) [BUILT ✅]
### PRODUCT 7 — Monthly Performance Report [Phase 2]

---

## 💰 PRICING MODEL

| Tier       | Price/mo   | Products Included                          |
|------------|------------|--------------------------------------------|
| Starter    | RM299      | Product 3 (12 posts) + Product 2 (reviews)|
| Pro        | RM499      | Products 2,3,4,5 + basic chatbot           |
| Growth     | RM899      | Products 2,3,4,5,6,7                       |
| Direct+    | RM699      | Product 1 (ordering) + Product 2 only      |
| Full Stack | RM1,299    | All 7 products                             |

---

## 🗄️ DATABASE SCHEMA (Supabase / PostgreSQL)

Run this SQL in your Supabase SQL editor to create all tables:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name text NOT NULL,
  whatsapp_number text UNIQUE NOT NULL,
  google_business_id text,
  instagram_handle text,
  tier text CHECK (tier IN ('starter','pro','growth','direct_plus','full_stack')),
  language_preference text[] DEFAULT '{en,bm}',
  is_halal boolean DEFAULT true,
  area text,
  owner_name text,
  monthly_revenue_rm integer,
  active boolean DEFAULT true,
  lat text,
  lng text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE menu_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  item_number integer NOT NULL,
  name text NOT NULL,
  name_bm text,
  name_zh text,
  description text,
  price_rm numeric(10,2) NOT NULL,
  category text,
  available boolean DEFAULT true,
  image_url text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, item_number)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id),
  customer_whatsapp text NOT NULL,
  customer_name text,
  items jsonb NOT NULL,
  subtotal_rm numeric(10,2),
  delivery_fee_rm numeric(10,2) DEFAULT 0,
  total_rm numeric(10,2) NOT NULL,
  payment_status text DEFAULT 'pending',
  payment_reference text,
  payment_method text,
  fulfillment_type text CHECK (fulfillment_type IN ('pickup','delivery','dine_in')),
  delivery_address text,
  lalamove_order_id text,
  status text DEFAULT 'new' CHECK (status IN ('new','confirmed','preparing','ready','delivered','cancelled')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE google_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id),
  review_id text UNIQUE NOT NULL,
  reviewer_name text,
  star_rating integer CHECK (star_rating BETWEEN 1 AND 5),
  review_text text,
  review_language text,
  ai_response text,
  response_posted boolean DEFAULT false,
  response_posted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE content_calendar (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id),
  platform text CHECK (platform IN ('instagram','facebook','tiktok','whatsapp')),
  content_type text,
  caption text,
  hashtags text[],
  scheduled_at timestamptz,
  status text DEFAULT 'draft' CHECK (status IN ('draft','approved','scheduled','published')),
  buffer_post_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE broadcasts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id),
  message_body text NOT NULL,
  template_name text,
  recipient_count integer,
  sent_at timestamptz,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE chatbot_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id),
  customer_whatsapp text NOT NULL,
  session_state jsonb DEFAULT '{}',
  current_order jsonb DEFAULT '{}',
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, customer_whatsapp)
);
```

---

## 📁 PROJECT STRUCTURE

```
naik-agency/
├── CLAUDE.md
├── .env.example
├── package.json
├── src/
│   ├── index.js               ← Express entry point
│   ├── api/
│   │   ├── webhook.js         ← WhatsApp webhook (Meta)
│   │   ├── payment.js         ← iPay88/Toyyibpay callbacks
│   │   └── lalamove.js        ← Lalamove dispatch
│   ├── bot/
│   │   ├── router.js          ← Intent router
│   │   ├── menu.js            ← Menu display
│   │   ├── order.js           ← Order builder
│   │   ├── payment.js         ← Payment link generation
│   │   ├── receipt.js         ← Receipt + owner notification
│   │   ├── faq.js             ← Claude-powered FAQ
│   │   └── nlp.js             ← Manglish NLP parser
│   ├── marketing/
│   │   ├── reviews.js         ← Google review responder
│   │   ├── content.js         ← Social content generator
│   │   ├── broadcast.js       ← WhatsApp broadcasts
│   │   └── newsletter.js      ← Email newsletter
│   ├── reports/
│   │   └── monthly.js         ← Monthly performance report
│   ├── db/
│   │   ├── client.js          ← Supabase client
│   │   └── queries.js         ← Reusable DB queries
│   └── utils/
│       ├── claude.js          ← Anthropic API wrapper
│       ├── whatsapp.js        ← WhatsApp Cloud API wrapper
│       ├── language.js        ← Language detection
│       └── currency.js        ← RM formatting
├── scripts/
│   ├── seed-demo-client.js
│   └── test-order-flow.js
└── docs/
    ├── api-setup.md
    ├── payment-setup.md
    └── client-onboarding.md
```

---

## 🚀 QUICK START

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in env vars
cp .env.example .env

# 3. Create Supabase tables (paste SQL from CLAUDE.md into Supabase SQL editor)

# 4. Seed demo café
npm run seed

# 5. Start dev server
npm run dev

# 6. Expose to internet for Meta webhook testing
npx ngrok http 3000

# 7. Set webhook URL in Meta Developer Console:
#    https://<ngrok-url>/webhook
#    Verify token: your WEBHOOK_VERIFY_TOKEN value

# 8. Run end-to-end flow test
npm run test-flow
```

---

## 🇲🇾 MALAYSIA-SPECIFIC RULES (never break these)

1. **Currency:** Always `RM X.XX` — never `MYR` or `$`
2. **Language:** BM → reply BM. English → reply English. Chinese → simplified Chinese.
3. **Halal:** If client.is_halal = true, never mention pork/alcohol. Add halal note where appropriate.
4. **Payments:** FPX, TNG eWallet, Boost, GrabPay, credit/debit. Never PayPal as primary.
5. **Time zone:** MYT (UTC+8). Never UTC.
6. **Phone numbers:** Strip leading 0, prepend 60 (0123456789 → 60123456789).
7. **Delivery:** Lalamove, MrSpeedy, Pgeon. Not Uber Eats.
8. **Broadcasts:** Best sent Thu 7pm or Sun 11am MYT.
9. **Cultural calendar:** Ramadan/Raya, CNY, Deepavali, Hari Merdeka = themed content.
10. **Privacy:** PDPA compliant — no IC numbers. WhatsApp numbers = PII.

---

## ⚡ CODING STANDARDS

- Node.js ES2022+. No TypeScript to start.
- Every async function wrapped in try/catch.
- Always verify Meta webhook signatures (X-Hub-Signature-256).
- Payment callbacks are idempotent — check status before processing.
- Never hardcode credentials. Always process.env.
- Check required env vars on startup and exit(1) if missing.

---

## 💬 BUILD COMMANDS

- `next` → continue with next logical build step
- `explain` → pause and explain last thing built
- `fix [description]` → fix only that, don't refactor
- `build Phase 2` → start marketing products
- `build dashboard` → start client dashboard (Phase 3)

---

*Last updated: May 2025 | Stack: Node.js + Express + Supabase + WhatsApp Cloud API + Anthropic Claude*

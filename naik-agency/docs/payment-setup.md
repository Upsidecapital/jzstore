# Malaysian Payment Gateway Setup Guide

## Option A — Toyyibpay (Recommended for SMBs)
**Why:** Free setup, no monthly fee, FPX native, fast approval, popular with Malaysian SMBs.

### Setup
1. Register at toyyibpay.com
2. Create a category (represents a "store/merchant")
3. Get your **Secret Key** and **Category Code** from the dashboard
4. Set in `.env`:
   ```
   PAYMENT_GATEWAY=toyyibpay
   TOYYIBPAY_SECRET_KEY=your_key
   TOYYIBPAY_CATEGORY_CODE=your_code
   ```
5. Set callback URL in Toyyibpay dashboard: `https://your-domain.com/payment/callback/toyyibpay`

### Payment Methods Supported
- FPX (all Malaysian banks)
- Debit/credit card
- Touch 'n Go eWallet
- Boost
- ShopeePay

### Test Mode
Use `toyyibpay.com` with sandbox credentials — look for "Sandbox" toggle in dashboard.

---

## Option B — iPay88
**Why:** More enterprise-grade, used by larger merchants, broader e-wallet support.

### Setup
1. Apply at ipay88.com.my (takes 1–2 weeks for approval)
2. Get **Merchant Code** and **Merchant Key** from dashboard
3. Set in `.env`:
   ```
   PAYMENT_GATEWAY=ipay88
   IPAY88_MERCHANT_CODE=your_code
   IPAY88_MERCHANT_KEY=your_key
   ```
4. Whitelist callback URL in iPay88 merchant portal: `https://your-domain.com/payment/callback/ipay88`

### Signature Verification
iPay88 uses SHA256 HMAC. This is handled automatically in `src/bot/payment.js`.
Never skip signature verification — it prevents payment fraud.

---

## Test Checklist (before going live with first client)
- [ ] Create a test order via bot conversation
- [ ] Click payment link — verify it loads correctly
- [ ] Complete a RM1.00 payment
- [ ] Verify WhatsApp receipt arrives within 30 seconds
- [ ] Verify café owner notification arrives
- [ ] Check order status = 'confirmed' in Supabase
- [ ] Test duplicate callback (POST same callback twice) — must not double-confirm

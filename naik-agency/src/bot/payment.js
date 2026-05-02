const crypto = require('crypto');
const axios = require('axios');
const { formatRM } = require('../utils/currency');

// Generate a payment link using either Toyyibpay (default) or iPay88
// Switch by setting PAYMENT_GATEWAY=ipay88 in .env
async function generatePaymentLink(order) {
  const gateway = process.env.PAYMENT_GATEWAY || 'toyyibpay';
  if (gateway === 'ipay88') return generateIPay88Link(order);
  return generateToyyibpayLink(order);
}

// ─── Toyyibpay ────────────────────────────────────────────────────────────────
// Preferred for Malaysian SMBs — no monthly fee, no setup cost, FPX native

async function generateToyyibpayLink(order) {
  const callbackUrl = `${process.env.APP_URL}/payment/callback/toyyibpay`;
  const returnUrl = `${process.env.APP_URL}/payment/return`;

  const params = new URLSearchParams({
    userSecretKey: process.env.TOYYIBPAY_SECRET_KEY,
    categoryCode: process.env.TOYYIBPAY_CATEGORY_CODE,
    billName: `Order ${order.id.substring(0, 8).toUpperCase()}`,
    billDescription: `Order from WhatsApp`,
    billPriceSetting: 1,
    billPayorInfo: 1,
    billAmount: Math.round(order.total_rm * 100), // Toyyibpay uses cents
    billReturnUrl: returnUrl,
    billCallbackUrl: callbackUrl,
    billExternalReferenceNo: order.id,
    billTo: order.customer_whatsapp,
    billEmail: '',
    billPhone: order.customer_whatsapp,
    billSplitPayment: 0,
    billSplitPaymentArgs: '',
    billPaymentChannel: 0, // 0 = all channels (FPX + card + eWallet)
    billContentEmail: `Thank you for ordering!`,
    billChargeToCustomer: 1,
  });

  const res = await axios.post(
    'https://toyyibpay.com/index.php/api/createBill',
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const billCode = res.data[0]?.BillCode;
  if (!billCode) throw new Error('Toyyibpay: no BillCode returned');

  return `https://toyyibpay.com/${billCode}`;
}

// ─── iPay88 ───────────────────────────────────────────────────────────────────
// Alternative — larger merchants, supports more e-wallets

function generateIPay88Link(order) {
  const merchantCode = process.env.IPAY88_MERCHANT_CODE;
  const merchantKey = process.env.IPAY88_MERCHANT_KEY;

  // iPay88 signature: HMAC of MerchantKey+MerchantCode+RefNo+Amount(no decimal)+Currency
  const amount = order.total_rm.toFixed(2).replace('.', '');
  const sigSource = `${merchantKey}${merchantCode}${order.id}${amount}MYR`;
  const signature = crypto.createHash('sha256').update(sigSource).digest('hex');

  const params = new URLSearchParams({
    MerchantCode: merchantCode,
    PaymentId: 8, // 8 = All payment methods
    RefNo: order.id,
    Amount: order.total_rm.toFixed(2),
    Currency: 'MYR',
    ProdDesc: `WhatsApp Order`,
    UserName: order.customer_whatsapp,
    UserEmail: `noreply@${process.env.APP_URL?.replace(/https?:\/\//, '') || 'example.com'}`,
    UserContact: order.customer_whatsapp,
    Remark: '',
    Lang: 'UTF-8',
    Signature: signature,
    ResponseURL: `${process.env.APP_URL}/payment/callback/ipay88`,
    BackendURL: `${process.env.APP_URL}/payment/callback/ipay88`,
  });

  return `https://payment.ipay88.com.my/epayment/entry.asp?${params.toString()}`;
}

module.exports = { generatePaymentLink };
// ✅ src/bot/payment.js complete

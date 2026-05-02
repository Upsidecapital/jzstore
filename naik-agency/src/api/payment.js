const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getOrderById, updateOrderStatus } = require('../db/queries');
const { sendReceipt } = require('../bot/receipt');
const { dispatchRider } = require('./lalamove');

// Find the right client from the order (used to send receipt/notify owner)
async function getClientForOrder(order) {
  const db = require('../db/client');
  const { data, error } = await db.from('clients').select('*').eq('id', order.client_id).single();
  if (error) throw error;
  return data;
}

// ─── Toyyibpay callback ───────────────────────────────────────────────────────

router.post('/callback/toyyibpay', async (req, res) => {
  // Respond 200 immediately — Toyyibpay retries on timeout
  res.sendStatus(200);

  const { billcode, order_id, status, reason } = req.body;

  // status_id 1 = successful payment
  if (String(status) !== '1') {
    console.log(`⚠️ Toyyibpay payment not successful for order ${order_id}: ${reason}`);
    return;
  }

  try {
    const order = await getOrderById(order_id);

    // Idempotency: ignore if already confirmed (callback can fire twice)
    if (order.payment_status === 'paid') {
      console.log(`✅ Order ${order_id} already confirmed — skipping duplicate callback`);
      return;
    }

    await updateOrderStatus(order.id, 'confirmed', {
      payment_status: 'paid',
      payment_reference: billcode,
      payment_method: 'toyyibpay',
    });

    const client = await getClientForOrder(order);
    await sendReceipt({ ...order, payment_status: 'paid' }, client);

    // Auto-dispatch Lalamove if client has delivery and it's enabled
    if (order.fulfillment_type === 'delivery' && process.env.LALAMOVE_API_KEY) {
      await dispatchRider(order, client).catch((err) =>
        console.error('⚠️ Lalamove dispatch failed:', err.message)
      );
    }
  } catch (err) {
    console.error(`❌ Toyyibpay callback error [${order_id}]:`, err.message);
  }
});

// ─── iPay88 callback ──────────────────────────────────────────────────────────

router.post('/callback/ipay88', async (req, res) => {
  res.sendStatus(200);

  const { MerchantCode, RefNo, Amount, Status, Signature } = req.body;

  // Status '1' = success in iPay88
  if (Status !== '1') {
    console.log(`⚠️ iPay88 payment failed for order ${RefNo}`);
    return;
  }

  // Verify iPay88 response signature — SHA256 of MerchantKey+MerchantCode+RefNo+Amount+Currency
  const expectedSig = crypto
    .createHash('sha256')
    .update(
      `${process.env.IPAY88_MERCHANT_KEY}${MerchantCode}${RefNo}${Amount.replace('.', '')}MYR`
    )
    .digest('hex');

  if (expectedSig !== Signature) {
    console.warn(`❌ iPay88 invalid signature for order ${RefNo}`);
    return;
  }

  try {
    const order = await getOrderById(RefNo);

    if (order.payment_status === 'paid') {
      console.log(`✅ Order ${RefNo} already confirmed — skipping`);
      return;
    }

    await updateOrderStatus(order.id, 'confirmed', {
      payment_status: 'paid',
      payment_reference: RefNo,
      payment_method: 'ipay88',
    });

    const client = await getClientForOrder(order);
    await sendReceipt({ ...order, payment_status: 'paid' }, client);

    if (order.fulfillment_type === 'delivery' && process.env.LALAMOVE_API_KEY) {
      await dispatchRider(order, client).catch((err) =>
        console.error('⚠️ Lalamove dispatch failed:', err.message)
      );
    }
  } catch (err) {
    console.error(`❌ iPay88 callback error [${RefNo}]:`, err.message);
  }
});

// Generic return URL — customer lands here after payment (shows thank-you page)
router.get('/return', (req, res) => {
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
    <h2>✅ Payment received!</h2>
    <p>Thank you for your order. You'll receive a WhatsApp receipt shortly.</p>
    <p style="color:#888">You can close this page.</p>
  </body></html>`);
});

module.exports = router;
// ✅ src/api/payment.js complete

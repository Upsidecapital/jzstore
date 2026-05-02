const { getMenuItems, getMenuItemsByNumbers, createOrder, updateSession } = require('../db/queries');
const { sendMessage, sendButtons } = require('../utils/whatsapp');
const { parseOrder } = require('./nlp');
const { formatRM, shortOrderId } = require('../utils/currency');
const { generatePaymentLink } = require('./payment');

// Build the order confirmation message shown before payment
function buildOrderSummary(lineItems, total, lang) {
  const lines = ['✅ *Order Summary:*', '─────────────────'];
  for (const li of lineItems) {
    lines.push(`${li.quantity}x ${li.name} — ${formatRM(li.subtotal)}`);
  }
  lines.push('─────────────────');
  lines.push(`*TOTAL: ${formatRM(total)}*`);
  lines.push('─────────────────');

  const prompt = {
    en: 'Pickup or delivery? Reply *P* for pickup or *D* for delivery.',
    bm: 'Ambil sendiri atau penghantaran? Balas *P* untuk ambil atau *D* untuk hantar.',
    zh: '自取还是送餐？回复 *P* 自取 或 *D* 送餐。',
  };
  lines.push(prompt[lang] || prompt.en);
  return lines.join('\n');
}

// Entry point for new order input from the customer
async function handleOrderInput({ from, text, client, session, lang }) {
  try {
    const allItems = await getMenuItems(client.id);
    const parsed = await parseOrder(text, allItems);

    if (!parsed || !parsed.items || parsed.items.length === 0) {
      const msg = {
        en: `I couldn't understand your order. Please reply with item numbers, e.g. *1 2 4*`,
        bm: `Saya tak faham pesanan anda. Tolong balas dengan nombor item, cth: *1 2 4*`,
        zh: `我无法理解您的订单。请回复商品编号，例如: *1 2 4*`,
      };
      await sendMessage(from, msg[lang] || msg.en);
      return;
    }

    const itemNumbers = parsed.items.map((i) => i.item_number);
    const dbItems = await getMenuItemsByNumbers(client.id, itemNumbers);

    // Map DB items by number for O(1) lookup
    const itemMap = {};
    for (const item of dbItems) itemMap[item.item_number] = item;

    const lineItems = [];
    let total = 0;

    for (const ordered of parsed.items) {
      const dbItem = itemMap[ordered.item_number];
      if (!dbItem) continue; // silently skip unknown item numbers
      const subtotal = dbItem.price_rm * ordered.quantity;
      total += subtotal;
      lineItems.push({
        item_number: dbItem.item_number,
        name: dbItem.name,
        price_rm: dbItem.price_rm,
        quantity: ordered.quantity,
        subtotal,
      });
    }

    if (lineItems.length === 0) {
      await sendMessage(from, `Hmm, I couldn't find those items on our menu. Reply *MENU* to see what's available!`);
      return;
    }

    // Save draft order to session so we can retrieve it after fulfillment choice
    await updateSession(session.id, {
      session_state: { step: 'AWAITING_FULFILLMENT' },
      current_order: { lineItems, total, clientId: client.id },
    });

    await sendMessage(from, buildOrderSummary(lineItems, total, lang));
  } catch (err) {
    console.error('❌ handleOrderInput error:', err.message);
    await sendMessage(from, 'Sorry, something went wrong processing your order. Please try again!');
  }
}

// Handle P/D reply after order summary
async function handleFulfillmentChoice({ from, text, client, session, lang }) {
  const lower = text.toLowerCase().trim();
  const isPickup = ['p', 'pickup', 'ambik', 'ambil', 'self collect', 'tapau'].includes(lower);
  const isDelivery = ['d', 'delivery', 'hantar', 'deliver'].includes(lower);

  if (!isPickup && !isDelivery) {
    await sendMessage(from, `Please reply *P* for pickup or *D* for delivery.`);
    return;
  }

  const { lineItems, total } = session.current_order;

  if (isPickup) {
    await finaliseOrder({ from, client, session, lineItems, total, fulfillmentType: 'pickup', lang });
  } else {
    // Ask for delivery address before creating the order
    await updateSession(session.id, {
      session_state: { step: 'AWAITING_ADDRESS' },
      current_order: { ...session.current_order, fulfillmentType: 'delivery' },
    });
    const ask = {
      en: '📍 Please send your delivery address:',
      bm: '📍 Tolong hantar alamat penghantaran anda:',
      zh: '📍 请发送您的送货地址：',
    };
    await sendMessage(from, ask[lang] || ask.en);
  }
}

// Handle address text after delivery was chosen
async function handleDeliveryAddress({ from, text, client, session, lang }) {
  const { lineItems, total } = session.current_order;
  await finaliseOrder({
    from, client, session, lineItems, total,
    fulfillmentType: 'delivery',
    deliveryAddress: text,
    lang,
  });
}

// Create order record + send payment link
async function finaliseOrder({ from, client, session, lineItems, total, fulfillmentType, deliveryAddress = null, lang }) {
  try {
    const DELIVERY_FEE = fulfillmentType === 'delivery' ? 5.00 : 0;
    const grandTotal = total + DELIVERY_FEE;

    const order = await createOrder({
      client_id: client.id,
      customer_whatsapp: from,
      items: lineItems,
      subtotal_rm: total,
      delivery_fee_rm: DELIVERY_FEE,
      total_rm: grandTotal,
      fulfillment_type: fulfillmentType,
      delivery_address: deliveryAddress,
      payment_status: 'pending',
      status: 'new',
    });

    await updateSession(session.id, {
      session_state: { step: 'AWAITING_PAYMENT', orderId: order.id },
      current_order: {},
    });

    const paymentLink = await generatePaymentLink(order);

    const lines = [
      `💳 *Pay here:*`,
      paymentLink,
      ``,
      `Accepts: FPX, credit/debit card,`,
      `Touch 'n Go, Boost, GrabPay`,
      ``,
      `Order ref: *${shortOrderId(order.id)}*`,
      `Total: *${formatRM(grandTotal)}*`,
      fulfillmentType === 'delivery' ? `(incl. delivery fee ${formatRM(DELIVERY_FEE)})` : `(self-pickup)`,
      ``,
      `⏱️ Payment link expires in 15 minutes.`,
    ];

    await sendMessage(from, lines.join('\n'));
  } catch (err) {
    console.error('❌ finaliseOrder error:', err.message);
    await sendMessage(from, 'Sorry, we had trouble creating your order. Please try again!');
  }
}

module.exports = { handleOrderInput, handleFulfillmentChoice, handleDeliveryAddress, finaliseOrder };
// ✅ src/bot/order.js complete

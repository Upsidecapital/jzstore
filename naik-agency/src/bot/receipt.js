const { sendMessage } = require('../utils/whatsapp');
const { formatRM, shortOrderId } = require('../utils/currency');

// Send payment receipt to customer and alert café owner
async function sendReceipt(order, client) {
  const lines = [
    `🧾 *Receipt — ${client.business_name}*`,
    `Order #: ${shortOrderId(order.id)}`,
    `─────────────────`,
  ];

  for (const item of order.items) {
    lines.push(`${item.quantity}x ${item.name} — ${formatRM(item.subtotal)}`);
  }

  if (order.delivery_fee_rm > 0) {
    lines.push(`Delivery fee — ${formatRM(order.delivery_fee_rm)}`);
  }

  lines.push(`─────────────────`);
  lines.push(`TOTAL: ${formatRM(order.total_rm)} ✅ PAID`);
  lines.push(`─────────────────`);

  if (order.fulfillment_type === 'pickup') {
    lines.push(`📦 Self-pickup`);
    lines.push(`Ready in ~15 mins`);
  } else {
    lines.push(`🛵 Delivery`);
    lines.push(`📍 ${order.delivery_address}`);
    lines.push(`Estimated: 45–60 mins`);
  }

  lines.push(`\nThank you! 🙏`);

  await sendMessage(order.customer_whatsapp, lines.join('\n'));
  await notifyCafeOwner(order, client);
}

// Send a new-order alert to the café owner's WhatsApp number
async function notifyCafeOwner(order, client) {
  // Owner number stored without country code in DB — normalise to +60 format
  const ownerNumber = normalisePhone(client.whatsapp_number);

  const itemSummary = order.items
    .map((i) => `  ${i.quantity}x ${i.name}`)
    .join('\n');

  const msg = [
    `🔔 *NEW ORDER — ${shortOrderId(order.id)}*`,
    `─────────────────`,
    itemSummary,
    `─────────────────`,
    `Total: ${formatRM(order.total_rm)} ✅ PAID`,
    `Type: ${order.fulfillment_type === 'pickup' ? 'Self-pickup' : `Delivery → ${order.delivery_address}`}`,
    `Customer: +${order.customer_whatsapp}`,
  ].join('\n');

  await sendMessage(ownerNumber, msg);
}

// Strip leading 0 and prepend 60 for WhatsApp API (0123456789 → 60123456789)
function normalisePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return '6' + digits;
  return '60' + digits;
}

module.exports = { sendReceipt, notifyCafeOwner };
// ✅ src/bot/receipt.js complete

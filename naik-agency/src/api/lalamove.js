const axios = require('axios');
const crypto = require('crypto');
const { updateOrderStatus } = require('../db/queries');

const BASE_URL =
  process.env.LALAMOVE_ENVIRONMENT === 'production'
    ? 'https://rest.lalamove.com'
    : 'https://rest.sandbox.lalamove.com';

// Sign a Lalamove API request with HMAC-SHA256
function signRequest(method, path, body, timestamp) {
  const rawSignature = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  return crypto
    .createHmac('sha256', process.env.LALAMOVE_API_SECRET)
    .update(rawSignature)
    .digest('hex');
}

function lalamoveHeaders(method, path, bodyStr) {
  const timestamp = Date.now().toString();
  const signature = signRequest(method, path, bodyStr, timestamp);
  const token = Buffer.from(`${process.env.LALAMOVE_API_KEY}:${timestamp}:${signature}`).toString('base64');
  return {
    Authorization: `hmac ${token}`,
    'Content-Type': 'application/json',
    'Market': 'MY',
  };
}

// Auto-dispatch a Lalamove rider after payment is confirmed
async function dispatchRider(order, client) {
  const path = '/v3/orders';
  const body = {
    data: {
      serviceType: 'MOTORCYCLE',
      language: 'ms_MY',
      stops: [
        {
          // Pick up from the café
          coordinates: { lat: client.lat || '3.1390', lng: client.lng || '101.6869' },
          address: client.area || 'KL',
        },
        {
          // Deliver to customer
          coordinates: { lat: '3.1390', lng: '101.6869' }, // Geocoding out of scope for MVP
          address: order.delivery_address,
        },
      ],
      requesterContact: {
        name: client.business_name,
        phone: client.whatsapp_number,
      },
      deliveries: [
        {
          toStop: 1,
          toContact: {
            name: order.customer_name || 'Customer',
            phone: '+' + order.customer_whatsapp,
          },
          remarks: `Order #${order.id.substring(0, 8).toUpperCase()}`,
        },
      ],
    },
  };

  const bodyStr = JSON.stringify(body);
  const headers = lalamoveHeaders('POST', path, bodyStr);

  const res = await axios.post(`${BASE_URL}${path}`, body, { headers });
  const lalamoveOrderId = res.data?.data?.orderId;

  if (lalamoveOrderId) {
    await updateOrderStatus(order.id, 'confirmed', { lalamove_order_id: lalamoveOrderId });
    console.log(`🛵 Lalamove dispatched — order ${lalamoveOrderId}`);
  }

  return lalamoveOrderId;
}

module.exports = { dispatchRider };
// ✅ src/api/lalamove.js complete

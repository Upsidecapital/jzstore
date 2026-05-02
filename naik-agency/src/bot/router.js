const { getClientByWhatsapp, getOrCreateSession, updateSession } = require('../db/queries');
const { sendMessage } = require('../utils/whatsapp');
const { detectLanguage, getGreeting } = require('../utils/language');
const { handleMenuRequest } = require('./menu');
const { handleOrderInput } = require('./order');
const { handleFaq } = require('./faq');

// Keyword maps for intent detection — covers English, BM, and Manglish variants
const GREETING_KEYWORDS = ['hi', 'hello', 'hai', 'helo', 'hey', 'start', 'mula', 'hye'];
const MENU_KEYWORDS = ['menu', 'senarai', 'list', 'food', 'makanan', 'minuman', 'drink', 'apa ada', 'what u have', 'show menu'];
const ORDER_KEYWORDS = ['order', 'nak', 'mau', 'want', 'beli', 'pesan', 'tambah', 'i want', 'boleh bagi'];
const FAQ_KEYWORDS = ['faq', 'help', 'soalan', 'question', 'tanya', 'parking', 'halal', 'hours', 'masa', 'location', 'alamat', 'address', 'wifi', 'reservation', 'booking'];

// Fulfillment choice during order flow
const PICKUP_KEYWORDS = ['p', 'pickup', 'ambik', 'ambil', 'self collect', 'tapau'];
const DELIVERY_KEYWORDS = ['d', 'delivery', 'hantar', 'deliver', 'pos'];

function detectIntent(text) {
  const lower = text.toLowerCase().trim();
  if (GREETING_KEYWORDS.some((k) => lower === k || lower.startsWith(k + ' '))) return 'GREETING';
  if (MENU_KEYWORDS.some((k) => lower.includes(k))) return 'MENU_REQUEST';
  if (ORDER_KEYWORDS.some((k) => lower.startsWith(k) || lower === k)) return 'ORDER';
  if (FAQ_KEYWORDS.some((k) => lower.includes(k))) return 'FAQ';
  // Numeric input during ordering — "1 2 4", "2 kopi peng"
  if (/^\d[\d\s]*$/.test(lower) || /\d/.test(lower)) return 'ORDER_INPUT';
  if (PICKUP_KEYWORDS.includes(lower)) return 'PICKUP';
  if (DELIVERY_KEYWORDS.includes(lower)) return 'DELIVERY';
  return 'UNKNOWN';
}

// Main entry point called by webhook.js for every incoming message
async function routeMessage({ from, text, phoneNumberId }) {
  try {
    // Look up the café this phone number belongs to
    const client = await getClientByWhatsapp(phoneNumberId).catch(() => null);
    if (!client) {
      console.warn(`⚠️ No active client for phoneNumberId: ${phoneNumberId}`);
      return;
    }

    const session = await getOrCreateSession(client.id, from);
    const lang = detectLanguage(text);
    const state = session.session_state || {};
    const intent = detectIntent(text);

    console.log(`🧠 [${from}] intent=${intent} lang=${lang} state=${state.step || 'idle'}`);

    // Handle mid-flow states first (they override keyword intent)
    if (state.step === 'AWAITING_FULFILLMENT') {
      if (intent === 'PICKUP' || intent === 'DELIVERY') {
        const { handleFulfillmentChoice } = require('./order');
        await handleFulfillmentChoice({ from, text, client, session, lang });
        return;
      }
    }

    if (state.step === 'AWAITING_ADDRESS') {
      const { handleDeliveryAddress } = require('./order');
      await handleDeliveryAddress({ from, text, client, session, lang });
      return;
    }

    // Top-level intent routing
    switch (intent) {
      case 'GREETING':
        await updateSession(session.id, { session_state: { step: 'IDLE' }, current_order: {} });
        await sendMessage(from, getGreeting(lang, client.business_name));
        break;

      case 'MENU_REQUEST':
        await handleMenuRequest({ from, client, lang });
        break;

      case 'ORDER':
      case 'ORDER_INPUT':
        await handleOrderInput({ from, text, client, session, lang });
        break;

      case 'FAQ':
        await handleFaq({ from, text, client, lang });
        break;

      default: {
        // Try order parsing on unknown input when in ordering flow
        if (state.step === 'ORDERING') {
          await handleOrderInput({ from, text, client, session, lang });
        } else {
          const fallback = {
            en: `Sorry, I didn't understand that. Reply *MENU* to see our menu or *ORDER* to place an order.`,
            bm: `Maaf, saya tak faham. Balas *MENU* untuk lihat menu atau *ORDER* untuk buat pesanan.`,
            zh: `抱歉，我没明白。回复 *MENU* 查看菜单或 *ORDER* 下单。`,
          };
          await sendMessage(from, fallback[lang] || fallback.en);
        }
      }
    }
  } catch (err) {
    console.error(`❌ routeMessage failed [${from}]:`, err.message);
    await sendMessage(from, 'Oops, something went wrong on our end. Please try again in a moment!').catch(() => {});
  }
}

module.exports = { routeMessage };
// ✅ src/bot/router.js complete

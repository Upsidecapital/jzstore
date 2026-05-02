const { getMenuItems } = require('../db/queries');
const { sendMessage } = require('../utils/whatsapp');
const { formatRM } = require('../utils/currency');

// Group menu items by category for a readable WhatsApp message
function buildMenuText(items, lang, businessName) {
  const grouped = {};
  for (const item of items) {
    const cat = item.category || 'Others';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const lines = [`☕ *MENU — ${businessName}*`, '─────────────────'];

  for (const [category, categoryItems] of Object.entries(grouped)) {
    lines.push(`\n*${category.toUpperCase()}*`);
    for (const item of categoryItems) {
      // Show localised name if available, fall back to default name
      const name =
        (lang === 'bm' && item.name_bm) ||
        (lang === 'zh' && item.name_zh) ||
        item.name;
      lines.push(`${item.item_number}. ${name} — ${formatRM(item.price_rm)}`);
    }
  }

  lines.push('\n─────────────────');

  const footer = {
    en: 'Reply with item numbers to order\ne.g. *1 4 6* for 3 items, or *2 kopi peng* — I understand Manglish 😄',
    bm: 'Balas dengan nombor item untuk pesan\ncth: *1 4 6* untuk 3 item',
    zh: '回复商品编号下单\n例如: *1 4 6*',
  };
  lines.push(footer[lang] || footer.en);

  return lines.join('\n');
}

// Fetch menu from DB and send formatted text to customer
async function handleMenuRequest({ from, client, lang }) {
  try {
    const items = await getMenuItems(client.id);

    if (!items || items.length === 0) {
      await sendMessage(from, `Sorry, our menu isn't available right now. Please call us directly!`);
      return;
    }

    const menuText = buildMenuText(items, lang, client.business_name);
    await sendMessage(from, menuText);
  } catch (err) {
    console.error('❌ handleMenuRequest error:', err.message);
    await sendMessage(from, 'Unable to load menu right now. Please try again!');
  }
}

module.exports = { handleMenuRequest, buildMenuText };
// ✅ src/bot/menu.js complete

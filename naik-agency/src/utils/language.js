// BM keywords that signal the customer prefers Bahasa Malaysia
const BM_TRIGGERS = [
  'nak', 'boleh', 'tolong', 'sila', 'terima kasih', 'tq', 'hai', 'helo',
  'menu lah', 'order lah', 'berapa', 'apa', 'minta', 'jap', 'sekejap',
  'ok lah', 'oklah', 'boleh tak', 'ada tak', 'dah', 'belum',
];

// Detect the primary language of a message — used to reply in the customer's language
function detectLanguage(text) {
  const lower = text.toLowerCase();

  // Chinese characters (CJK Unicode block)
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh';

  // Check for BM trigger words
  if (BM_TRIGGERS.some((kw) => lower.includes(kw))) return 'bm';

  // Default to English (handles Manglish too — we reply in kind)
  return 'en';
}

// Greeting strings per language
const GREETINGS = {
  en: (businessName) =>
    `👋 Hi! Welcome to *${businessName}*!\n\nHow can I help you today?\n\nReply:\n• *MENU* — see our menu\n• *ORDER* — place an order\n• *FAQ* — ask a question`,
  bm: (businessName) =>
    `👋 Hai! Selamat datang ke *${businessName}*!\n\nBoleh saya bantu?\n\nBalas:\n• *MENU* — lihat menu kami\n• *ORDER* — buat pesanan\n• *FAQ* — tanya soalan`,
  zh: (businessName) =>
    `👋 你好！欢迎来到 *${businessName}*！\n\n请问有什么可以帮您？\n\n回复：\n• *MENU* — 查看菜单\n• *ORDER* — 下单\n• *FAQ* — 提问`,
};

function getGreeting(lang, businessName) {
  return (GREETINGS[lang] || GREETINGS.en)(businessName);
}

module.exports = { detectLanguage, getGreeting };
// ✅ src/utils/language.js complete

const { complete } = require('../utils/claude');
const { sendMessage } = require('../utils/whatsapp');

// FAQ system prompt — injected with client context at runtime so Claude answers correctly
function buildFaqSystemPrompt(client) {
  const halalNote = client.is_halal
    ? 'This business is halal certified. All food is halal. No pork, no lard, no alcohol.'
    : 'Halal status: not specified.';

  return `You are a friendly customer service chatbot for ${client.business_name}, a Malaysian F&B business.
Answer customer questions about: opening hours, location, parking, halal status, menu items, WiFi, reservations.
${halalNote}
Area: ${client.area || 'KL/PJ area'}
Language: match the customer's language (BM, English, Manglish, Chinese).
Keep replies under 3 sentences. Be warm and friendly. End with "Anything else I can help with? 😊"
If you don't know the answer, say: "Let me check with the team and get back to you shortly!"
Never make up operating hours or addresses you don't know.`;
}

// Handle any FAQ / help query with Claude
async function handleFaq({ from, text, client, lang }) {
  try {
    const response = await complete({
      systemPrompt: buildFaqSystemPrompt(client),
      userMessage: text,
      maxTokens: 300,
    });
    await sendMessage(from, response);
  } catch (err) {
    console.error('❌ handleFaq error:', err.message);
    const fallback = {
      en: `Thanks for your question! Please call us directly for more information.`,
      bm: `Terima kasih! Sila hubungi kami terus untuk maklumat lanjut.`,
      zh: `谢谢您的提问！请直接联系我们获取更多信息。`,
    };
    await sendMessage(from, fallback[lang] || fallback.en);
  }
}

module.exports = { handleFaq };
// ✅ src/bot/faq.js complete

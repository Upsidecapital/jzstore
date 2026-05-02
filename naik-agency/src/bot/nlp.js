const { complete } = require('../utils/claude');

const NLP_SYSTEM_PROMPT = `You are an order parser for a Malaysian F&B WhatsApp ordering system.
Extract order items from customer messages that may be in English, BM, Manglish, or Chinese.
Return ONLY valid JSON. Never add commentary.
Schema: {"items": [{"item_number": int, "quantity": int}], "confidence": float}
Examples:
- "2 kopi peng satu teh tarik" → {"items":[{"item_number":4,"quantity":2},{"item_number":2,"quantity":1}],"confidence":0.9}
- "nak 1 nasi lemak dgn kopi o" → {"items":[{"item_number":7,"quantity":1},{"item_number":1,"quantity":1}],"confidence":0.85}
- "i want item 1 and 4 please" → {"items":[{"item_number":1,"quantity":1},{"item_number":4,"quantity":1}],"confidence":0.95}
- "order no 2 and 6" → {"items":[{"item_number":2,"quantity":1},{"item_number":6,"quantity":1}],"confidence":0.95}`;

// Regex fallback — parses patterns like "1 2 4", "2x kopi", "item 3"
function regexParse(text) {
  const items = [];

  // Pattern: optional qty + item number e.g. "2 item 4", "1 4 6"
  const matches = text.match(/(\d+)\s*x?\s*(\d+)|(\d+)/g) || [];
  const numbers = [];

  // Simple space-separated numbers: "1 2 4"
  const simple = text.match(/\b\d+\b/g);
  if (simple) {
    for (const n of simple) {
      numbers.push({ item_number: parseInt(n, 10), quantity: 1 });
    }
  }

  return numbers.length ? { items: numbers, confidence: 0.5 } : null;
}

// Parse free-form Manglish order text into a structured item list
async function parseOrder(text, availableItems) {
  // Build a compact item reference for Claude so it knows valid item numbers
  const itemRef = availableItems
    .map((i) => `${i.item_number}=${i.name}`)
    .join(', ');

  try {
    const raw = await complete({
      systemPrompt: NLP_SYSTEM_PROMPT,
      userMessage: `Available items: ${itemRef}\n\nCustomer message: "${text}"`,
      maxTokens: 256,
    });

    const parsed = JSON.parse(raw.trim());

    // If Claude is uncertain, fall back to regex
    if (parsed.confidence < 0.7) {
      const fallback = regexParse(text);
      return fallback || parsed;
    }

    return parsed;
  } catch (err) {
    console.warn('⚠️ Claude NLP parse failed, using regex fallback:', err.message);
    return regexParse(text) || { items: [], confidence: 0 };
  }
}

module.exports = { parseOrder };
// ✅ src/bot/nlp.js complete

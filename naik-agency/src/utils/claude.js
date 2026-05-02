const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Central Claude wrapper — keeps model pinned in one place and adds prompt caching
async function complete({ systemPrompt, userMessage, maxTokens = 1024 }) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        // Cache the system prompt — it's sent on every message in a session
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0]?.text || '';
}

module.exports = { complete };
// ✅ src/utils/claude.js complete

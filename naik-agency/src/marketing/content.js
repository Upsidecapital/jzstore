// PHASE 2 — Social Media Content Generator
// Generates 20–30 posts/month per client using Claude, schedules via Buffer API

const axios = require('axios');
const { complete } = require('../utils/claude');
const { createContentPost } = require('../db/queries');

const PLATFORMS = ['instagram', 'facebook'];

// Generate a month's worth of social posts for a client
async function generateMonthlyContent(client, month, year) {
  const halalNote = client.is_halal ? 'The business is halal certified. Never mention pork or alcohol.' : '';
  const posts = [];

  const themes = [
    'product spotlight', 'behind the scenes', 'customer love / testimonial',
    'promo or offer', 'fun food fact', 'team story', 'seasonal / festive',
  ];

  for (let i = 0; i < 20; i++) {
    const theme = themes[i % themes.length];
    const platform = PLATFORMS[i % PLATFORMS.length];

    const caption = await complete({
      systemPrompt: `You create ${platform} content for Malaysian F&B SMBs. Write in Manglish/English. ${halalNote}
Always include a call-to-action. Include 5–10 relevant hashtags at the end.
Keep captions under 150 words. Use emojis sparingly but effectively.`,
      userMessage: `Create a ${theme} post for ${client.business_name} located in ${client.area || 'KL'}.`,
      maxTokens: 400,
    });

    const scheduledDate = new Date(year, month - 1, 1 + i * 1.5);

    const post = await createContentPost({
      client_id: client.id,
      platform,
      content_type: theme,
      caption,
      hashtags: [],
      scheduled_at: scheduledDate.toISOString(),
      status: 'draft',
    });

    posts.push(post);
  }

  return posts;
}

// Push an approved post to Buffer for scheduling
async function scheduleOnBuffer(post) {
  const res = await axios.post(
    'https://api.bufferapp.com/1/updates/create.json',
    {
      text: post.caption,
      scheduled_at: post.scheduled_at,
    },
    { headers: { Authorization: `Bearer ${process.env.BUFFER_ACCESS_TOKEN}` } }
  );
  return res.data;
}

module.exports = { generateMonthlyContent, scheduleOnBuffer };
// ✅ src/marketing/content.js complete

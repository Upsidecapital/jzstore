// PHASE 2 — Monthly Email Newsletter via MailerLite
const axios = require('axios');
const { complete } = require('../utils/claude');

const MAILERLITE_BASE = 'https://connect.mailerlite.com/api';

function mlHeaders() {
  return {
    Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Generate newsletter HTML using Claude, then send via MailerLite
async function sendMonthlyNewsletter(client, month, year) {
  const content = await complete({
    systemPrompt: `You write monthly email newsletters for Malaysian F&B businesses.
Include: month highlights, featured items, a promotion, and a warm closing. Under 400 words.
Use HTML with inline styles suitable for email (no external CSS). Write in English.`,
    userMessage: `Write the ${month}/${year} newsletter for ${client.business_name} in ${client.area || 'KL'}.`,
    maxTokens: 1000,
  });

  // Create campaign in MailerLite
  const campaign = await axios.post(
    `${MAILERLITE_BASE}/campaigns`,
    {
      name: `${client.business_name} — ${month}/${year} Newsletter`,
      type: 'regular',
      emails: [
        {
          subject: `${client.business_name} — What's new this month! 🍵`,
          from_name: client.business_name,
          from: `hello@${process.env.APP_URL?.replace(/https?:\/\//, '') || 'example.com'}`,
          content,
        },
      ],
    },
    { headers: mlHeaders() }
  );

  console.log(`📧 Newsletter campaign created: ${campaign.data.data.id}`);
  return campaign.data.data;
}

module.exports = { sendMonthlyNewsletter };
// ✅ src/marketing/newsletter.js complete

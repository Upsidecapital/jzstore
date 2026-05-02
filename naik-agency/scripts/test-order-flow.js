// End-to-end test of the full order conversation flow
// Run AFTER seed-demo-client.js and with all env vars set
// Does NOT send real WhatsApp messages — mocks the WhatsApp send utility

require('dotenv').config();

// Mock sendMessage so we don't need a real WhatsApp token during tests
const whatsapp = require('../src/utils/whatsapp');
const messages = [];
whatsapp.sendMessage = async (to, text) => {
  messages.push({ to, text });
  console.log(`\n📤 [BOT → ${to}]:\n${text}\n`);
};
whatsapp.sendButtons = async (to, body) => {
  messages.push({ to, body });
  console.log(`\n📤 [BOT BUTTONS → ${to}]:\n${body}\n`);
};

const { routeMessage } = require('../src/bot/router');

// Replace with your seeded demo phoneNumberId
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const CUSTOMER = '60123456789';

async function simulate(text) {
  console.log(`\n📨 [CUSTOMER ${CUSTOMER}]: "${text}"`);
  await routeMessage({ from: CUSTOMER, text, phoneNumberId: PHONE_NUMBER_ID });
  await new Promise((r) => setTimeout(r, 500)); // small pause between turns
}

async function runTest() {
  console.log('🧪 Starting end-to-end order flow test...\n');

  await simulate('hi');           // Should get greeting
  await simulate('menu');         // Should get formatted menu
  await simulate('1 4 7');        // Should get order summary (Kopi O + Kopi Peng + Roti Bakar)
  await simulate('P');            // Pickup chosen
  // At this point bot should send payment link

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Test complete. ${messages.length} messages sent.`);
  console.log('Next: verify payment link works with a real RM1.00 test transaction.');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message, err.stack);
  process.exit(1);
});

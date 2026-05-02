require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CLIENT_ID = uuidv4();

const demoClient = {
  id: CLIENT_ID,
  business_name: 'Kopi Demo',
  whatsapp_number: process.env.WHATSAPP_PHONE_NUMBER_ID || 'DEMO_PHONE_ID',
  tier: 'direct_plus',
  language_preference: ['en', 'bm'],
  is_halal: true,
  area: 'Petaling Jaya, Selangor',
  owner_name: 'Ahmad Demo',
  monthly_revenue_rm: 15000,
  active: true,
};

const demoMenu = [
  { item_number: 1, name: 'Kopi O', name_bm: 'Kopi O', category: 'Hot Drinks', price_rm: 3.50 },
  { item_number: 2, name: 'Teh Tarik', name_bm: 'Teh Tarik', category: 'Hot Drinks', price_rm: 3.50 },
  { item_number: 3, name: 'Milo Panas', name_bm: 'Milo Panas', category: 'Hot Drinks', price_rm: 4.00 },
  { item_number: 4, name: 'Kopi Peng', name_bm: 'Kopi Peng', category: 'Cold Drinks', price_rm: 4.00 },
  { item_number: 5, name: 'Teh Ais', name_bm: 'Teh Ais', category: 'Cold Drinks', price_rm: 3.50 },
  { item_number: 6, name: 'Milo Ais', name_bm: 'Milo Ais', category: 'Cold Drinks', price_rm: 4.50 },
  { item_number: 7, name: 'Roti Bakar', name_bm: 'Roti Bakar', category: 'Food', price_rm: 4.50 },
  { item_number: 8, name: 'Nasi Lemak', name_bm: 'Nasi Lemak', category: 'Food', price_rm: 8.00 },
  { item_number: 9, name: 'Half Boiled Eggs (2pcs)', name_bm: 'Telur Separuh Masak', category: 'Food', price_rm: 3.00 },
  { item_number: 10, name: 'Curry Puff', name_bm: 'Karipap', category: 'Snacks', price_rm: 2.50 },
];

async function seed() {
  console.log('🌱 Seeding demo client...');

  // Upsert client — safe to run multiple times
  const { error: clientErr } = await db
    .from('clients')
    .upsert(demoClient, { onConflict: 'id' });
  if (clientErr) throw clientErr;
  console.log(`✅ Client: ${demoClient.business_name} (${CLIENT_ID})`);

  // Insert menu items
  const menuRows = demoMenu.map((item) => ({
    id: uuidv4(),
    client_id: CLIENT_ID,
    available: true,
    ...item,
  }));

  const { error: menuErr } = await db.from('menu_items').upsert(menuRows, { onConflict: 'id' });
  if (menuErr) throw menuErr;
  console.log(`✅ Menu: ${demoMenu.length} items inserted`);

  console.log('\n🎉 Seed complete! Demo client ID:', CLIENT_ID);
  console.log('   Set WHATSAPP_PHONE_NUMBER_ID to the demo phone number ID in your .env');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});

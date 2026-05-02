const { createClient } = require('@supabase/supabase-js');

// Single shared Supabase client — use service key for server-side ops (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: { persistSession: false },
  }
);

module.exports = supabase;
// ✅ src/db/client.js complete

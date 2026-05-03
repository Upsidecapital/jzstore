-- WhatsApp integration tables — run after main migrations

-- Per-client WhatsApp Business API config
create table if not exists whatsapp_config (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- From Meta WhatsApp Business Cloud API
  phone_number_id text not null,        -- e.g. "123456789012345"
  waba_id text,                         -- WhatsApp Business Account ID
  access_token text not null,           -- Permanent token from Meta
  verify_token text not null,           -- Custom secret for webhook verification

  -- Bot personality
  bot_name text default 'Assistant',
  welcome_message text,                 -- Custom greeting
  closing_hours_message text,           -- Message when outside business hours
  business_hours_start time default '09:00',
  business_hours_end time default '22:00',
  timezone text default 'Asia/Kuala_Lumpur',

  -- Features
  accept_orders boolean default true,
  show_menu boolean default true,
  is_active boolean default true
);

-- Customer orders placed via WhatsApp
create table if not exists whatsapp_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Customer
  customer_phone text not null,
  customer_name text,

  -- Order
  order_items jsonb not null default '[]',   -- [{name, price, qty, notes}]
  subtotal decimal,
  total_amount decimal,
  special_notes text,
  order_type text default 'takeaway',         -- 'dine_in' | 'takeaway' | 'delivery'
  table_number text,
  delivery_address text,

  -- Status workflow
  status text default 'new',                  -- 'new' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  cancelled_reason text,

  -- Reference
  order_number serial,
  whatsapp_message_id text                    -- Meta message ID for reference
);

-- Conversation state per customer-business pair
create table if not exists whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  customer_phone text not null,
  customer_name text,

  -- Conversation context (last N messages for Claude)
  messages jsonb default '[]',               -- [{role, content, timestamp}]

  -- In-progress order state
  pending_order jsonb,                        -- {items: [], notes: '', type: ''}

  -- State machine
  conversation_state text default 'greeting', -- 'greeting' | 'browsing' | 'ordering' | 'confirming' | 'confirmed'

  last_message_at timestamptz default now(),

  unique(client_id, customer_phone)
);

-- RLS
alter table whatsapp_config enable row level security;
alter table whatsapp_orders enable row level security;
alter table whatsapp_conversations enable row level security;

create policy "operator_full_access" on whatsapp_config for all using (true);
create policy "operator_full_access" on whatsapp_orders for all using (true);
create policy "operator_full_access" on whatsapp_conversations for all using (true);

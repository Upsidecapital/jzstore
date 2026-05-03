-- Run these migrations in order in the Supabase SQL editor

-- clients
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  name text not null,
  slug text unique not null,
  logo_url text,
  outlet_count integer default 1,
  locations text[],
  format text not null,
  price_point text not null,
  avg_spend_per_person decimal,
  monthly_revenue_estimate decimal,
  current_channels text[],
  current_marketing_spend decimal,
  target_customer_primary text,
  target_customer_secondary text,
  brand_personality text[],
  content_restrictions text,
  goal_90_day text,
  biggest_pain_point text,
  tier text not null default 'starter',
  contract_start date,
  monthly_fee decimal,
  status text default 'active',
  owner_name text,
  owner_whatsapp text,
  owner_email text,
  brand_positioning_content text
);

-- menu_items
create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  created_at timestamptz default now(),
  name text not null,
  description text,
  price decimal,
  category text,
  is_hero boolean default false,
  is_margin_star boolean default false,
  is_signature boolean default false,
  audit_notes text,
  positioning_recommendation text,
  suggested_name text,
  is_active boolean default true
);

-- competitors
create table if not exists competitors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  created_at timestamptz default now(),
  name text not null,
  location text,
  instagram_handle text,
  tiktok_handle text,
  notes text,
  last_watch_brief text,
  last_watched_at timestamptz
);

-- content_posts
create table if not exists content_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  scheduled_date date not null,
  platform text not null,
  post_type text,
  caption text not null,
  hashtags text,
  visual_direction text,
  cta text,
  status text default 'draft',
  generation_prompt text,
  campaign_id uuid
);

-- campaigns
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  created_at timestamptz default now(),
  name text not null,
  objective text not null,
  occasion text,
  start_date date,
  end_date date,
  brief_content text,
  target_audience text,
  core_message text,
  channels text[],
  key_visuals text,
  ad_copy text,
  success_metrics text,
  estimated_ad_spend decimal,
  status text default 'draft'
);

-- monthly_reports
create table if not exists monthly_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  created_at timestamptz default now(),
  report_month date not null,
  instagram_reach integer,
  instagram_followers_start integer,
  instagram_followers_end integer,
  instagram_saves integer,
  tiktok_views integer,
  google_review_score decimal,
  google_review_count integer,
  new_customer_estimate integer,
  revenue_this_month decimal,
  revenue_last_month decimal,
  top_performing_post text,
  notes_from_operator text,
  report_content text,
  key_wins text,
  key_gaps text,
  next_month_priorities text,
  status text default 'draft'
);

-- ai_generations
create table if not exists ai_generations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  created_at timestamptz default now(),
  type text not null,
  input_data jsonb,
  output_text text,
  tokens_used integer,
  model text
);

-- Enable RLS
alter table clients enable row level security;
alter table menu_items enable row level security;
alter table competitors enable row level security;
alter table content_posts enable row level security;
alter table campaigns enable row level security;
alter table monthly_reports enable row level security;
alter table ai_generations enable row level security;

-- Policies (single operator, full access)
create policy "operator_full_access" on clients for all using (true);
create policy "operator_full_access" on menu_items for all using (true);
create policy "operator_full_access" on competitors for all using (true);
create policy "operator_full_access" on content_posts for all using (true);
create policy "operator_full_access" on campaigns for all using (true);
create policy "operator_full_access" on monthly_reports for all using (true);
create policy "operator_full_access" on ai_generations for all using (true);

export interface Client {
  id: string
  created_at: string
  updated_at: string
  name: string
  slug: string
  logo_url?: string
  outlet_count: number
  locations: string[]
  format: 'hawker' | 'cafe' | 'casual_dining' | 'qsr' | 'cloud_kitchen' | 'food_truck' | 'fine_dining' | 'other'
  price_point: 'budget' | 'mid' | 'premium'
  avg_spend_per_person?: number
  monthly_revenue_estimate?: number
  current_channels: string[]
  current_marketing_spend?: number
  target_customer_primary?: string
  target_customer_secondary?: string
  brand_personality: string[]
  content_restrictions?: string
  goal_90_day?: string
  biggest_pain_point?: string
  tier: 'starter' | 'growth' | 'scale'
  contract_start?: string
  monthly_fee?: number
  status: 'active' | 'paused' | 'churned'
  owner_name?: string
  owner_whatsapp?: string
  owner_email?: string
  brand_positioning_content?: string
}

export interface MenuItem {
  id: string
  client_id: string
  created_at: string
  name: string
  description?: string
  price?: number
  category?: string
  is_hero: boolean
  is_margin_star: boolean
  is_signature: boolean
  audit_notes?: string
  positioning_recommendation?: string
  suggested_name?: string
  is_active: boolean
}

export interface Competitor {
  id: string
  client_id: string
  created_at: string
  name: string
  location?: string
  instagram_handle?: string
  tiktok_handle?: string
  notes?: string
  last_watch_brief?: string
  last_watched_at?: string
}

export interface ContentPost {
  id: string
  client_id: string
  created_at: string
  updated_at: string
  scheduled_date: string
  platform: 'instagram' | 'tiktok' | 'facebook' | 'whatsapp'
  post_type?: 'promo' | 'brand' | 'educational' | 'engagement' | 'festival' | 'product_highlight'
  caption: string
  hashtags?: string
  visual_direction?: string
  cta?: string
  status: 'draft' | 'approved' | 'scheduled' | 'published'
  generation_prompt?: string
  campaign_id?: string
}

export interface Campaign {
  id: string
  client_id: string
  created_at: string
  name: string
  objective: string
  occasion?: string
  start_date?: string
  end_date?: string
  brief_content?: string
  target_audience?: string
  core_message?: string
  channels: string[]
  key_visuals?: string
  ad_copy?: string
  success_metrics?: string
  estimated_ad_spend?: number
  status: 'draft' | 'active' | 'completed'
}

export interface MonthlyReport {
  id: string
  client_id: string
  created_at: string
  report_month: string
  instagram_reach?: number
  instagram_followers_start?: number
  instagram_followers_end?: number
  instagram_saves?: number
  tiktok_views?: number
  google_review_score?: number
  google_review_count?: number
  new_customer_estimate?: number
  revenue_this_month?: number
  revenue_last_month?: number
  top_performing_post?: string
  notes_from_operator?: string
  report_content?: string
  key_wins?: string
  key_gaps?: string
  next_month_priorities?: string
  status: 'draft' | 'final'
}

export interface AIGeneration {
  id: string
  client_id?: string
  created_at: string
  type: 'content_calendar' | 'campaign_brief' | 'menu_audit' | 'monthly_report' | 'competitor_watch' | 'brand_positioning' | 'freeform'
  input_data?: Record<string, unknown>
  output_text?: string
  tokens_used?: number
  model?: string
}

export interface Festival {
  name: string
  date: string
  type: 'major' | 'public_holiday' | 'national' | 'school_break'
  duration_days: number
  f_and_b_relevance: 'critical' | 'high' | 'medium' | 'low'
}

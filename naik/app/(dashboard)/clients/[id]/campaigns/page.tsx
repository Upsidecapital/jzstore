export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CampaignsClient } from '@/components/campaigns/CampaignsClient'
import type { Client, Campaign } from '@/types'

export default async function CampaignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [clientRes, campaignsRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('campaigns').select('*').eq('client_id', id).order('created_at', { ascending: false }),
  ])

  if (!clientRes.data) notFound()

  return (
    <CampaignsClient
      client={clientRes.data as Client}
      initialCampaigns={(campaignsRes.data || []) as Campaign[]}
    />
  )
}

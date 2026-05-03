export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { WhatsAppConfigClient } from '@/components/whatsapp/WhatsAppConfigClient'
import type { Client } from '@/types'

export default async function WhatsAppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [clientRes, configRes, convRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('whatsapp_config').select('*').eq('client_id', id).single(),
    supabase.from('whatsapp_conversations').select('customer_phone,customer_name,last_message_at,messages').eq('client_id', id).order('last_message_at', { ascending: false }).limit(20),
  ])

  if (!clientRes.data) notFound()

  return (
    <WhatsAppConfigClient
      client={clientRes.data as Client}
      existingConfig={configRes.data}
      recentConversations={convRes.data || []}
    />
  )
}

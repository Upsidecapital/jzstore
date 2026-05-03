export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { MenuAuditClient } from '@/components/menu/MenuAuditClient'
import type { Client, MenuItem } from '@/types'

export default async function MenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [clientRes, menuRes, auditRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('menu_items').select('*').eq('client_id', id).order('category').order('name'),
    supabase.from('ai_generations').select('output_text,created_at').eq('client_id', id).eq('type', 'menu_audit').order('created_at', { ascending: false }).limit(5),
  ])

  if (!clientRes.data) notFound()

  return (
    <MenuAuditClient
      client={clientRes.data as Client}
      initialMenuItems={(menuRes.data || []) as MenuItem[]}
      auditHistory={auditRes.data || []}
    />
  )
}

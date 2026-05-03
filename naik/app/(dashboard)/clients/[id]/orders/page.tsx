export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { OrdersClient } from '@/components/whatsapp/OrdersClient'
import type { Client } from '@/types'

export default async function OrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [clientRes, ordersRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('whatsapp_orders').select('*').eq('client_id', id).order('created_at', { ascending: false }),
  ])

  if (!clientRes.data) notFound()

  return (
    <OrdersClient
      client={clientRes.data as Client}
      initialOrders={ordersRes.data || []}
    />
  )
}

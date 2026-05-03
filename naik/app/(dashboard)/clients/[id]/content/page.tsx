export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ContentCalendarClient } from '@/components/content/ContentCalendarClient'
import type { Client, MenuItem, ContentPost } from '@/types'

export default async function ContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [clientRes, menuRes, postsRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('menu_items').select('name,id').eq('client_id', id).eq('is_active', true).order('name'),
    supabase.from('content_posts').select('*').eq('client_id', id).order('scheduled_date'),
  ])

  if (!clientRes.data) notFound()

  return (
    <ContentCalendarClient
      client={clientRes.data as Client}
      menuItems={(menuRes.data || []) as Pick<MenuItem, 'id' | 'name'>[]}
      initialPosts={(postsRes.data || []) as ContentPost[]}
    />
  )
}

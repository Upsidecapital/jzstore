export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { QuickGenerateClient } from '@/components/QuickGenerateClient'
import type { Client } from '@/types'

export default async function GeneratePage() {
  const supabase = await createClient()
  const { data: clients } = await supabase.from('clients').select('id,name,status').eq('status', 'active').order('name')

  return <QuickGenerateClient clients={(clients || []) as Pick<Client, 'id' | 'name' | 'status'>[]} />
}

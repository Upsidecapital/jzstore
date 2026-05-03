export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from '@/components/SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <SettingsClient userEmail={user?.email || ''} />
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendTextMessage } from '@/lib/whatsapp/client'

export async function POST(req: NextRequest) {
  const { clientId, testPhone, message } = await req.json()

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('client_id', clientId)
    .single()

  if (!config) {
    return NextResponse.json({ error: 'WhatsApp not configured for this client' }, { status: 404 })
  }

  try {
    await sendTextMessage(
      config.phone_number_id,
      config.access_token,
      testPhone.replace(/\D/g, ''),
      message || 'Test message from Naik 🚀'
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseIncomingWebhook } from '@/lib/whatsapp/client'
import { handleIncomingMessage } from '@/lib/whatsapp/chatbot'

// GET — Meta webhook verification challenge
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  // Look up which client has this verify token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from('whatsapp_config')
    .select('id')
    .eq('verify_token', token)
    .eq('is_active', true)
    .single()

  if (!data) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  return new NextResponse(challenge, { status: 200 })
}

// POST — Receive incoming WhatsApp messages from Meta
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  // Meta sends a test ping on verification — always acknowledge
  if (body.object !== 'whatsapp_business_account') {
    return NextResponse.json({ status: 'ok' })
  }

  // Parse the message
  const incoming = parseIncomingWebhook(body)

  // Acknowledge Meta immediately (must respond within 20s)
  // Process asynchronously
  if (incoming) {
    handleIncomingMessage(incoming).catch(err => {
      console.error('WhatsApp chatbot error:', err)
    })
  }

  return NextResponse.json({ status: 'ok' })
}

import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { anthropic, MODEL } from '@/lib/anthropic/client'
import { buildSystemPrompt } from '@/lib/anthropic/prompts/system'
import { menuAuditPrompt } from '@/lib/anthropic/prompts/menu-audit'
import type { Client, MenuItem } from '@/types'

export async function POST(req: NextRequest) {
  const { clientId } = await req.json()

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const [clientRes, menuRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).single(),
    supabase.from('menu_items').select('*').eq('client_id', clientId).eq('is_active', true),
  ])

  if (!clientRes.data) return new Response('Client not found', { status: 404 })

  const client = clientRes.data as Client
  const menuItems = (menuRes.data || []) as MenuItem[]

  if (menuItems.length === 0) {
    return new Response('No menu items found. Add menu items first.', { status: 400 })
  }

  const systemPrompt = buildSystemPrompt(client, menuItems)
  const userPrompt = menuAuditPrompt(menuItems)

  const encoder = new TextEncoder()
  let fullOutput = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: MODEL,
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        })

        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const text = chunk.delta.text
            fullOutput += text
            controller.enqueue(encoder.encode(text))
          }
        }

        await supabase.from('ai_generations').insert({
          client_id: clientId,
          type: 'menu_audit',
          input_data: { clientId, itemCount: menuItems.length },
          output_text: fullOutput,
          model: MODEL,
        })
      } catch (err) {
        controller.error(err)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' },
  })
}

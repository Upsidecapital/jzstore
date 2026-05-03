import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { anthropic, MODEL } from '@/lib/anthropic/client'
import { buildSystemPrompt } from '@/lib/anthropic/prompts/system'
import { brandPositioningPrompt } from '@/lib/anthropic/prompts/brand-positioning'
import type { Client } from '@/types'

export async function POST(req: NextRequest) {
  const { clientId } = await req.json()

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!client) return new Response('Client not found', { status: 404 })

  const c = client as Client
  const systemPrompt = buildSystemPrompt(c)
  const userPrompt = brandPositioningPrompt(c)

  const encoder = new TextEncoder()
  let fullOutput = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: MODEL,
          max_tokens: 2048,
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

        // Save to DB
        await supabase.from('clients').update({ brand_positioning_content: fullOutput }).eq('id', clientId)
        await supabase.from('ai_generations').insert({
          client_id: clientId,
          type: 'brand_positioning',
          input_data: { clientId },
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

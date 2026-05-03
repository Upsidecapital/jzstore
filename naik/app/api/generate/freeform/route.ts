import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { anthropic, MODEL } from '@/lib/anthropic/client'
import { buildSystemPrompt } from '@/lib/anthropic/prompts/system'
import type { Client } from '@/types'

const FALLBACK_SYSTEM = `You are Naik — an AI Chief Marketing Officer built exclusively for Malaysian F&B businesses.
Be culturally fluent for Malaysia: Hari Raya, CNY, Deepavali, Merdeka, school holidays.
Default to bilingual copy suggestions (English + Bahasa Malaysia where relevant).
Be halal-aware by default. Use specific numbers and prices. Output must be immediately usable.`

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { clientId, prompt, generationType } = body

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  let systemPrompt = FALLBACK_SYSTEM
  if (clientId) {
    const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
    if (client) systemPrompt = buildSystemPrompt(client as Client)
  }

  const encoder = new TextEncoder()
  let fullOutput = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: MODEL,
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        })

        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const text = chunk.delta.text
            fullOutput += text
            controller.enqueue(encoder.encode(text))
          }
        }

        await supabase.from('ai_generations').insert({
          client_id: clientId || null,
          type: generationType || 'freeform',
          input_data: { prompt },
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

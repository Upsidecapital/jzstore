import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { anthropic, MODEL } from '@/lib/anthropic/client'
import { buildSystemPrompt } from '@/lib/anthropic/prompts/system'
import { contentCalendarPrompt } from '@/lib/anthropic/prompts/content-calendar'
import type { Client, MenuItem } from '@/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { clientId, month, postCount, platforms, focusItems, upcomingCampaigns, customBrief } = body

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
  const systemPrompt = buildSystemPrompt(client, menuItems)
  const userPrompt = contentCalendarPrompt({ month, postCount, platforms, focusItems, upcomingCampaigns, customBrief })

  const encoder = new TextEncoder()
  let fullOutput = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: MODEL,
          max_tokens: 4096,
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

        // Parse JSON and save posts
        try {
          const jsonMatch = fullOutput.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            const posts = JSON.parse(jsonMatch[0])
            const toInsert = posts.map((p: Record<string, string>) => ({
              client_id: clientId,
              scheduled_date: p.scheduled_date,
              platform: p.platform,
              post_type: p.post_type,
              caption: p.caption,
              hashtags: p.hashtags,
              visual_direction: p.visual_direction,
              cta: p.cta,
              status: 'draft',
              generation_prompt: userPrompt,
            }))
            await supabase.from('content_posts').insert(toInsert)
          }
        } catch {
          // JSON parse failed — output still streamed to user
        }

        await supabase.from('ai_generations').insert({
          client_id: clientId,
          type: 'content_calendar',
          input_data: body,
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

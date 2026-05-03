import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { anthropic, MODEL } from '@/lib/anthropic/client'
import { buildSystemPrompt } from '@/lib/anthropic/prompts/system'
import { campaignBriefPrompt } from '@/lib/anthropic/prompts/campaign-brief'
import type { Client } from '@/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { clientId, occasion, objective, startDate, endDate, estimatedBudget, channels, customBrief } = body

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!client) return new Response('Client not found', { status: 404 })

  const systemPrompt = buildSystemPrompt(client as Client)
  const userPrompt = campaignBriefPrompt({ occasion, objective, startDate, endDate, estimatedBudget, channels, customBrief })

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

        // Save campaign
        const firstLineMatch = fullOutput.match(/##\s+Campaign Name\n+([^\n]+)/)
        const campaignName = firstLineMatch?.[1]?.trim() || occasion

        const { data: campaign } = await supabase.from('campaigns').insert({
          client_id: clientId,
          name: campaignName,
          objective,
          occasion,
          start_date: startDate || null,
          end_date: endDate || null,
          channels,
          brief_content: fullOutput,
          estimated_ad_spend: estimatedBudget || null,
          status: 'draft',
        }).select().single()

        await supabase.from('ai_generations').insert({
          client_id: clientId,
          type: 'campaign_brief',
          input_data: body,
          output_text: fullOutput,
          model: MODEL,
        })

        // Send campaign id as last chunk
        if (campaign) {
          controller.enqueue(encoder.encode(`\n\n<!--campaign_id:${campaign.id}-->`))
        }
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

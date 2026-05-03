import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { anthropic, MODEL } from '@/lib/anthropic/client'
import { buildSystemPrompt } from '@/lib/anthropic/prompts/system'
import { monthlyReportPrompt } from '@/lib/anthropic/prompts/monthly-report'
import type { Client } from '@/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { clientId, reportMonth, metrics } = body

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!client) return new Response('Client not found', { status: 404 })

  const systemPrompt = buildSystemPrompt(client as Client)
  const userPrompt = monthlyReportPrompt({ reportMonth, metrics })

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

        // Save to monthly_reports
        const reportDate = new Date(reportMonth)
        const firstDay = new Date(reportDate.getFullYear(), reportDate.getMonth(), 1).toISOString().split('T')[0]

        const { data: report } = await supabase.from('monthly_reports').upsert({
          client_id: clientId,
          report_month: firstDay,
          ...metrics,
          report_content: fullOutput,
          status: 'draft',
        }, { onConflict: 'client_id,report_month' }).select().single()

        await supabase.from('ai_generations').insert({
          client_id: clientId,
          type: 'monthly_report',
          input_data: body,
          output_text: fullOutput,
          model: MODEL,
        })

        if (report) {
          controller.enqueue(encoder.encode(`\n\n<!--report_id:${report.id}-->`))
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

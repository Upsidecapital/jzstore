export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { MonthlyReportsClient } from '@/components/reports/MonthlyReportsClient'
import type { Client, MonthlyReport } from '@/types'

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [clientRes, reportsRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('monthly_reports').select('*').eq('client_id', id).order('report_month', { ascending: false }),
  ])

  if (!clientRes.data) notFound()

  return (
    <MonthlyReportsClient
      client={clientRes.data as Client}
      initialReports={(reportsRes.data || []) as MonthlyReport[]}
    />
  )
}

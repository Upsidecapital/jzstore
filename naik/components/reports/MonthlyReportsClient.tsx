'use client'
import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { BarChart3, RefreshCw, Download, Mail, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StreamingOutput } from '@/components/StreamingOutput'
import type { Client, MonthlyReport } from '@/types'

interface MetricsForm {
  instagram_reach: string
  instagram_followers_start: string
  instagram_followers_end: string
  instagram_saves: string
  tiktok_views: string
  google_review_score: string
  google_review_count: string
  new_customer_estimate: string
  revenue_this_month: string
  revenue_last_month: string
  top_performing_post: string
  notes_from_operator: string
}

interface Props { client: Client; initialReports: MonthlyReport[] }

export function MonthlyReportsClient({ client, initialReports }: Props) {
  const [reports, setReports] = useState<MonthlyReport[]>(initialReports)
  const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(initialReports[0] || null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [reportContent, setReportContent] = useState(initialReports[0]?.report_content || '')
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const [reportMonth, setReportMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [metrics, setMetrics] = useState<MetricsForm>({
    instagram_reach: '',
    instagram_followers_start: '',
    instagram_followers_end: '',
    instagram_saves: '',
    tiktok_views: '',
    google_review_score: '',
    google_review_count: '',
    new_customer_estimate: '',
    revenue_this_month: '',
    revenue_last_month: selectedReport?.revenue_this_month?.toString() || '',
    top_performing_post: '',
    notes_from_operator: '',
  })

  const setMetric = (key: keyof MetricsForm, val: string) => setMetrics(p => ({ ...p, [key]: val }))

  const generateReport = async () => {
    setReportContent('')
    setIsGenerating(true)
    setEmailSent(false)

    const numericMetrics = {
      instagram_reach: metrics.instagram_reach ? Number(metrics.instagram_reach) : undefined,
      instagram_followers_start: metrics.instagram_followers_start ? Number(metrics.instagram_followers_start) : undefined,
      instagram_followers_end: metrics.instagram_followers_end ? Number(metrics.instagram_followers_end) : undefined,
      instagram_saves: metrics.instagram_saves ? Number(metrics.instagram_saves) : undefined,
      tiktok_views: metrics.tiktok_views ? Number(metrics.tiktok_views) : undefined,
      google_review_score: metrics.google_review_score ? Number(metrics.google_review_score) : undefined,
      google_review_count: metrics.google_review_count ? Number(metrics.google_review_count) : undefined,
      new_customer_estimate: metrics.new_customer_estimate ? Number(metrics.new_customer_estimate) : undefined,
      revenue_this_month: metrics.revenue_this_month ? Number(metrics.revenue_this_month) : undefined,
      revenue_last_month: metrics.revenue_last_month ? Number(metrics.revenue_last_month) : undefined,
      top_performing_post: metrics.top_performing_post || undefined,
      notes_from_operator: metrics.notes_from_operator || undefined,
    }

    try {
      const res = await fetch('/api/generate/monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, reportMonth, metrics: numericMetrics }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setReportContent(fullText.replace(/<!--report_id:[^>]+-->/g, ''))
      }

      // Refresh reports
      const response = await fetch(`/api/reports/${client.id}`)
      if (response.ok) {
        const data = await response.json()
        setReports(data)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleEmailReport = async () => {
    if (!client.owner_email || !reportContent) return
    setIsSendingEmail(true)
    try {
      await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          recipientEmail: client.owner_email,
          recipientName: client.owner_name,
          reportContent,
          reportMonth,
        }),
      })
      setEmailSent(true)
    } finally {
      setIsSendingEmail(false)
    }
  }

  const METRIC_FIELDS: { key: keyof MetricsForm; label: string; type?: string; placeholder?: string }[] = [
    { key: 'instagram_reach', label: 'Instagram Reach', placeholder: 'e.g. 15000' },
    { key: 'instagram_followers_start', label: 'Followers (Start)', placeholder: 'e.g. 2800' },
    { key: 'instagram_followers_end', label: 'Followers (End)', placeholder: 'e.g. 3100' },
    { key: 'instagram_saves', label: 'Instagram Saves', placeholder: 'e.g. 340' },
    { key: 'tiktok_views', label: 'TikTok Total Views', placeholder: 'e.g. 52000' },
    { key: 'google_review_score', label: 'Google Review Score', placeholder: 'e.g. 4.6', type: 'number' },
    { key: 'google_review_count', label: 'Google Review Count', placeholder: 'e.g. 127' },
    { key: 'new_customer_estimate', label: 'Est. New Customers', placeholder: 'e.g. 85' },
    { key: 'revenue_this_month', label: 'Revenue This Month (RM)', placeholder: 'e.g. 65000' },
    { key: 'revenue_last_month', label: 'Revenue Last Month (RM)', placeholder: 'e.g. 58000' },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Monthly Reports</h2>
          <p className="text-slate-500 text-sm mt-0.5">{client.name}</p>
        </div>
        {reports.length > 1 && (
          <div className="relative">
            <select
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 pr-8 appearance-none"
              value={selectedReport?.id || ''}
              onChange={e => {
                const r = reports.find(r => r.id === e.target.value)
                if (r) { setSelectedReport(r); setReportContent(r.report_content || '') }
              }}
            >
              {reports.map(r => (
                <option key={r.id} value={r.id}>{format(new Date(r.report_month), 'MMMM yyyy')}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Metrics input */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Input Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Report Month</Label>
                <Input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {METRIC_FIELDS.map(f => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      type={f.type || 'number'}
                      value={metrics[f.key]}
                      onChange={e => setMetric(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label>Best-Performing Post</Label>
                <Input value={metrics.top_performing_post} onChange={e => setMetric('top_performing_post', e.target.value)} placeholder="Describe the post that performed best" />
              </div>

              <div className="space-y-1.5">
                <Label>Notes for AI</Label>
                <Textarea
                  value={metrics.notes_from_operator}
                  onChange={e => setMetric('notes_from_operator', e.target.value)}
                  placeholder="What happened this month? Events, closures, new items, promotions..."
                  rows={3}
                />
              </div>

              <Button onClick={generateReport} loading={isGenerating} className="w-full">
                <RefreshCw className="h-4 w-4" />
                {isGenerating ? 'Generating...' : 'Generate Report'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Report output */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Report</CardTitle>
                {reportContent && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handlePrint}>
                      <Download className="h-4 w-4" /> Print/PDF
                    </Button>
                    {client.owner_email && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEmailReport}
                        loading={isSendingEmail}
                      >
                        <Mail className="h-4 w-4" />
                        {emailSent ? 'Sent!' : 'Email Client'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent ref={printRef}>
              {!reportContent && !isGenerating ? (
                <div className="py-12 text-center">
                  <BarChart3 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Fill in the metrics and click Generate Report</p>
                </div>
              ) : (
                <div className="max-h-[36rem] overflow-y-auto">
                  <StreamingOutput content={reportContent.replace(/<!--report_id:[^>]+-->/g, '')} isStreaming={isGenerating} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { Zap, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StreamingOutput } from '@/components/StreamingOutput'
import type { Client } from '@/types'

const GENERATION_TYPES = [
  { value: 'freeform', label: 'Freeform — Ask anything' },
  { value: 'content_calendar', label: 'Content Calendar' },
  { value: 'campaign_brief', label: 'Campaign Brief' },
  { value: 'menu_audit', label: 'Menu Audit' },
  { value: 'monthly_report', label: 'Monthly Report' },
  { value: 'brand_positioning', label: 'Brand Positioning' },
  { value: 'competitor_watch', label: 'Competitor Watch' },
]

interface Props { clients: Pick<Client, 'id' | 'name' | 'status'>[] }

export function QuickGenerateClient({ clients }: Props) {
  const [clientId, setClientId] = useState('')
  const [genType, setGenType] = useState('freeform')
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    if (!prompt.trim()) return
    setOutput('')
    setIsGenerating(true)

    try {
      const res = await fetch('/api/generate/freeform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId || undefined,
          prompt,
          generationType: genType,
        }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setOutput(fullText)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const copyOutput = async () => {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Quick Generate</h2>
        <p className="text-slate-500 text-sm mt-1">Freeform AI generation for any marketing task</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Client Context (optional)</Label>
              <Select value={clientId} onChange={e => setClientId(e.target.value)}>
                <option value="">No client — generic Malaysian F&B</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Generation Type</Label>
              <Select value={genType} onChange={e => setGenType(e.target.value)}>
                {GENERATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Your Prompt</Label>
            <Textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Write a Hari Raya campaign brief for a mid-range cafe in Petaling Jaya targeting working adults..."
              rows={4}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
              }}
            />
            <p className="text-xs text-slate-400">Tip: Press Cmd/Ctrl+Enter to generate</p>
          </div>

          <Button onClick={generate} loading={isGenerating} className="w-full" disabled={!prompt.trim()}>
            <Zap className="h-4 w-4" />
            {isGenerating ? 'Generating...' : 'Generate'}
          </Button>
        </CardContent>
      </Card>

      {(output || isGenerating) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Output</CardTitle>
              {output && !isGenerating && (
                <Button variant="outline" size="sm" onClick={copyOutput}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <StreamingOutput content={output} isStreaming={isGenerating} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

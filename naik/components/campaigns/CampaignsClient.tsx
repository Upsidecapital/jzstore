'use client'
import { useState } from 'react'
import { Plus, Megaphone, Calendar, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StreamingOutput } from '@/components/StreamingOutput'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Client, Campaign } from '@/types'

const OCCASIONS = [
  'Hari Raya Aidilfitri', 'Chinese New Year', 'Deepavali', 'Christmas',
  'Hari Merdeka', 'Malaysia Day', 'Menu Launch', 'Outlet Opening',
  'School Holidays', 'Wesak Day', 'Hari Raya Aidiladha', 'Custom',
]

const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'whatsapp', 'grabfood']

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'warning'> = {
  draft: 'secondary', active: 'default', completed: 'warning'
}

interface Props { client: Client; initialCampaigns: Campaign[] }

export function CampaignsClient({ client, initialCampaigns }: Props) {
  const supabase = createClient()
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamContent, setStreamContent] = useState('')

  // Form state
  const [occasion, setOccasion] = useState('')
  const [objective, setObjective] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [estimatedBudget, setEstimatedBudget] = useState('')
  const [channels, setChannels] = useState<string[]>(['instagram'])
  const [customBrief, setCustomBrief] = useState('')

  const toggleChannel = (p: string) => {
    setChannels(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  const generateBrief = async () => {
    if (!occasion || !objective) return
    setStreamContent('')
    setIsGenerating(true)
    try {
      const res = await fetch('/api/generate/campaign-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id, occasion, objective, startDate, endDate,
          estimatedBudget: estimatedBudget ? Number(estimatedBudget) : undefined,
          channels, customBrief,
        }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        fullText += text
        setStreamContent(fullText.replace(/<!--campaign_id:[^>]+-->/g, ''))
      }

      // Refresh campaigns
      const { data } = await supabase.from('campaigns').select('*').eq('client_id', client.id).order('created_at', { ascending: false })
      if (data) {
        setCampaigns(data as Campaign[])
        const newest = data[0] as Campaign
        setSelectedCampaign(newest)
      }
      setIsDialogOpen(false)
    } finally {
      setIsGenerating(false)
    }
  }

  const updateStatus = async (campaignId: string, status: string) => {
    await supabase.from('campaigns').update({ status }).eq('id', campaignId)
    setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: status as Campaign['status'] } : c))
    if (selectedCampaign?.id === campaignId) setSelectedCampaign(prev => prev ? { ...prev, status: status as Campaign['status'] } : null)
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Campaigns</h2>
          <p className="text-slate-500 text-sm mt-0.5">{client.name}</p>
        </div>
        <Button onClick={() => { setStreamContent(''); setSelectedCampaign(null); setIsDialogOpen(true) }}>
          <Plus className="h-4 w-4" /> New Campaign
        </Button>
      </div>

      <div className={cn('grid gap-6', selectedCampaign ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1')}>
        {/* Campaign list */}
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Megaphone className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No campaigns yet</p>
                <p className="text-slate-400 text-sm mt-1">Generate your first campaign brief</p>
              </CardContent>
            </Card>
          ) : campaigns.map(campaign => (
            <Card
              key={campaign.id}
              className={cn('cursor-pointer hover:border-green-400 transition-all', selectedCampaign?.id === campaign.id && 'border-green-600 shadow-md')}
              onClick={() => setSelectedCampaign(campaign)}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 truncate">{campaign.name}</h3>
                    <p className="text-sm text-slate-500 mt-0.5 truncate">{campaign.objective}</p>
                    {(campaign.start_date || campaign.end_date) && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-xs text-slate-400">
                          {campaign.start_date || '—'} → {campaign.end_date || '—'}
                        </span>
                      </div>
                    )}
                  </div>
                  <Badge variant={STATUS_BADGE[campaign.status] || 'secondary'} className="capitalize shrink-0">
                    {campaign.status}
                  </Badge>
                </div>
                {campaign.channels && campaign.channels.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {campaign.channels.map(ch => (
                      <Badge key={ch} variant="outline" className="text-xs capitalize">{ch}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Campaign detail */}
        {selectedCampaign && (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{selectedCampaign.name}</CardTitle>
                  <Badge variant={STATUS_BADGE[selectedCampaign.status] || 'secondary'} className="mt-2 capitalize">
                    {selectedCampaign.status}
                  </Badge>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {selectedCampaign.status === 'draft' && (
                    <Button size="sm" onClick={() => updateStatus(selectedCampaign.id, 'active')}>Activate</Button>
                  )}
                  {selectedCampaign.status === 'active' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(selectedCampaign.id, 'completed')}>Complete</Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto max-h-96">
              {selectedCampaign.brief_content ? (
                <StreamingOutput content={selectedCampaign.brief_content.replace(/<!--campaign_id:[^>]+-->/g, '')} isStreaming={false} />
              ) : (
                <p className="text-slate-400 text-sm">No brief content generated yet.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Streaming output (when generating) */}
      {isGenerating && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-slate-700 mb-3">Generating campaign brief...</p>
            <StreamingOutput content={streamContent} isStreaming={isGenerating} />
          </CardContent>
        </Card>
      )}

      {/* New Campaign Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Campaign Brief</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Occasion *</Label>
              <Select value={occasion} onChange={e => setOccasion(e.target.value)}>
                <option value="">Select occasion...</option>
                {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </Select>
              {occasion === 'Custom' && (
                <Input value={occasion} onChange={e => setOccasion(e.target.value)} placeholder="Describe the occasion" className="mt-2" />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Objective *</Label>
              <Input value={objective} onChange={e => setObjective(e.target.value)} placeholder="e.g. Drive 20% more dine-in traffic during festive period" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Estimated Budget (RM)</Label>
              <Input type="number" value={estimatedBudget} onChange={e => setEstimatedBudget(e.target.value)} placeholder="e.g. 2000" />
            </div>

            <div className="space-y-1.5">
              <Label>Channels</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleChannel(p)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm border transition-colors',
                      channels.includes(p) ? 'bg-green-600 text-white border-green-600' : 'text-slate-600 border-slate-300 hover:border-green-400'
                    )}
                  >{p}</button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Additional Context</Label>
              <Textarea value={customBrief} onChange={e => setCustomBrief(e.target.value)} placeholder="Any specific angles, promotions, or constraints for this campaign..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={generateBrief} loading={isGenerating} disabled={!occasion || !objective}>
              <RefreshCw className="h-4 w-4" /> Generate Brief
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

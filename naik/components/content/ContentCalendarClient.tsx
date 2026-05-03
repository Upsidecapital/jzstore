'use client'
import { useState, useCallback } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from 'date-fns'
import { CalendarDays, List, Download, RefreshCw, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { StreamingOutput } from '@/components/StreamingOutput'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Client, ContentPost, MenuItem } from '@/types'

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-100 text-pink-700 border-pink-200',
  tiktok: 'bg-slate-900 text-white border-slate-800',
  facebook: 'bg-blue-100 text-blue-700 border-blue-200',
  whatsapp: 'bg-green-100 text-green-700 border-green-200',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'warning'> = {
  draft: 'secondary',
  approved: 'default',
  scheduled: 'warning',
  published: 'default',
}

const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'whatsapp']

interface Props {
  client: Client
  menuItems: Pick<MenuItem, 'id' | 'name'>[]
  initialPosts: ContentPost[]
}

export function ContentCalendarClient({ client, menuItems, initialPosts }: Props) {
  const supabase = createClient()
  const [posts, setPosts] = useState<ContentPost[]>(initialPosts)
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [selectedPost, setSelectedPost] = useState<ContentPost | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Generator form state
  const [month, setMonth] = useState(format(new Date(), 'MMMM yyyy'))
  const [postCount, setPostCount] = useState(20)
  const [platforms, setPlatforms] = useState<string[]>(['instagram'])
  const [customBrief, setCustomBrief] = useState('')
  const [showGenerator, setShowGenerator] = useState(false)

  const togglePlatform = (p: string) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  const generate = async () => {
    setStreamContent('')
    setIsGenerating(true)
    setShowGenerator(false)
    try {
      const res = await fetch('/api/generate/content-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, month, postCount, platforms, customBrief }),
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
        setStreamContent(fullText)
      }

      // Refresh posts from DB
      const { data } = await supabase.from('content_posts').select('*').eq('client_id', client.id).order('scheduled_date')
      if (data) setPosts(data as ContentPost[])
      setStreamContent('')
    } finally {
      setIsGenerating(false)
    }
  }

  const updatePostStatus = async (postId: string, status: string) => {
    await supabase.from('content_posts').update({ status }).eq('id', postId)
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: status as ContentPost['status'] } : p))
    if (selectedPost?.id === postId) setSelectedPost(prev => prev ? { ...prev, status: status as ContentPost['status'] } : null)
  }

  const exportCSV = () => {
    const approved = posts.filter(p => p.status === 'approved')
    const headers = ['Date', 'Platform', 'Type', 'Caption', 'Hashtags', 'Visual Direction', 'CTA', 'Status']
    const rows = approved.map(p => [
      p.scheduled_date, p.platform, p.post_type || '', `"${(p.caption || '').replace(/"/g, '""')}"`,
      p.hashtags || '', `"${(p.visual_direction || '').replace(/"/g, '""')}"`, p.cta || '', p.status
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${client.name}-content-${format(new Date(), 'yyyy-MM')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Calendar view
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad = getDay(monthStart)
  const postsThisMonth = posts.filter(p => {
    const d = parseISO(p.scheduled_date)
    return isSameMonth(d, currentMonth)
  })

  const postsByDate = postsThisMonth.reduce<Record<string, ContentPost[]>>((acc, p) => {
    const key = p.scheduled_date
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant={view === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setView('calendar')}>
            <CalendarDays className="h-4 w-4" /> Calendar
          </Button>
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}>
            <List className="h-4 w-4" /> List
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowGenerator(!showGenerator)}>
            <Plus className="h-4 w-4" /> Generate Calendar
          </Button>
        </div>
      </div>

      {/* Generator panel */}
      {showGenerator && (
        <Card>
          <CardHeader>
            <CardTitle>Generate Content Calendar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Input value={month} onChange={e => setMonth(e.target.value)} placeholder="June 2026" />
              </div>
              <div className="space-y-1.5">
                <Label>Number of posts: {postCount}</Label>
                <input type="range" min={8} max={30} value={postCount} onChange={e => setPostCount(Number(e.target.value))} className="w-full accent-green-600" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Platforms</Label>
              <div className="flex gap-2 flex-wrap">
                {PLATFORMS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                      platforms.includes(p) ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-300 hover:border-green-400'
                    )}
                  >{p}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Additional brief (optional)</Label>
              <Textarea value={customBrief} onChange={e => setCustomBrief(e.target.value)} placeholder="Focus on our new signature drink launch..." rows={2} />
            </div>
            <Button onClick={generate} loading={isGenerating} className="w-full">
              <RefreshCw className="h-4 w-4" /> Generate {postCount} Posts
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Streaming output */}
      {isGenerating && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-slate-700 mb-3">Generating content calendar...</p>
            <div className="max-h-48 overflow-y-auto font-mono text-xs text-slate-500 bg-slate-50 rounded p-3">
              <StreamingOutput content={streamContent} isStreaming={isGenerating} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar view */}
      {view === 'calendar' && (
        <Card>
          <CardContent className="pt-5">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="font-semibold text-slate-900">{format(currentMonth, 'MMMM yyyy')}</h3>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="bg-slate-50 text-center text-xs font-medium text-slate-500 py-2">{d}</div>
              ))}
              {Array(startPad).fill(null).map((_, i) => <div key={`pad-${i}`} className="bg-white min-h-20" />)}
              {days.map(day => {
                const key = format(day, 'yyyy-MM-dd')
                const dayPosts = postsByDate[key] || []
                return (
                  <div key={key} className="bg-white min-h-20 p-1.5">
                    <p className="text-xs text-slate-500 mb-1">{format(day, 'd')}</p>
                    <div className="space-y-0.5">
                      {dayPosts.slice(0, 3).map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setSelectedPost(p); setIsSheetOpen(true) }}
                          className={cn('w-full text-left px-1.5 py-0.5 rounded text-xs font-medium border truncate', PLATFORM_COLORS[p.platform] || 'bg-slate-100 text-slate-600')}
                        >
                          {p.post_type || p.platform}
                        </button>
                      ))}
                      {dayPosts.length > 3 && <p className="text-xs text-slate-400 pl-1">+{dayPosts.length - 3}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List view */}
      {view === 'list' && (
        <Card>
          <CardContent className="pt-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  {['Date', 'Platform', 'Type', 'Caption', 'Status', ''].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posts.map(post => (
                  <tr key={post.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setSelectedPost(post); setIsSheetOpen(true) }}>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-700 font-medium">{post.scheduled_date}</td>
                    <td className="px-3 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', PLATFORM_COLORS[post.platform] || 'bg-slate-100')}>{post.platform}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600 capitalize">{post.post_type?.replace('_', ' ')}</td>
                    <td className="px-3 py-3 text-slate-700 max-w-xs truncate">{post.caption}</td>
                    <td className="px-3 py-3">
                      <Badge variant={STATUS_VARIANTS[post.status] || 'secondary'}>{post.status}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        className="text-xs text-slate-400 hover:text-slate-600"
                        onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(post.caption) }}
                      >Copy</button>
                    </td>
                  </tr>
                ))}
                {posts.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No posts yet. Generate your first content calendar.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Post detail sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        {selectedPost && (
          <>
            <SheetHeader>
              <SheetTitle>{selectedPost.scheduled_date} · {selectedPost.platform}</SheetTitle>
            </SheetHeader>
            <SheetContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Badge variant={STATUS_VARIANTS[selectedPost.status] || 'secondary'}>{selectedPost.status}</Badge>
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', PLATFORM_COLORS[selectedPost.platform])}>{selectedPost.platform}</span>
                {selectedPost.post_type && <Badge variant="outline" className="capitalize">{selectedPost.post_type.replace('_', ' ')}</Badge>}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase">Caption</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{selectedPost.caption}</p>
              </div>

              {selectedPost.hashtags && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Hashtags</p>
                  <p className="text-sm text-green-700">{selectedPost.hashtags}</p>
                </div>
              )}

              {selectedPost.visual_direction && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Visual Direction</p>
                  <p className="text-sm text-slate-700 italic">{selectedPost.visual_direction}</p>
                </div>
              )}

              {selectedPost.cta && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase">CTA</p>
                  <p className="text-sm text-slate-800 font-medium">{selectedPost.cta}</p>
                </div>
              )}
            </SheetContent>
            <SheetFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(`${selectedPost.caption}\n\n${selectedPost.hashtags || ''}`)}
              >Copy Caption</Button>
              {selectedPost.status === 'draft' && (
                <Button size="sm" onClick={() => updatePostStatus(selectedPost.id, 'approved')}>
                  Approve
                </Button>
              )}
              {selectedPost.status === 'approved' && (
                <Button size="sm" variant="secondary" onClick={() => updatePostStatus(selectedPost.id, 'scheduled')}>
                  Mark Scheduled
                </Button>
              )}
              {selectedPost.status === 'scheduled' && (
                <Button size="sm" onClick={() => updatePostStatus(selectedPost.id, 'published')}>
                  Mark Published
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </Sheet>
    </div>
  )
}

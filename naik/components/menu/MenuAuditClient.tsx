'use client'
import { useState, useRef } from 'react'
import { Plus, Trash2, Upload, UtensilsCrossed, Star, TrendingUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { StreamingOutput } from '@/components/StreamingOutput'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Client, MenuItem } from '@/types'

const CATEGORIES = ['Mains', 'Sides', 'Drinks', 'Desserts', 'Snacks', 'Sets', 'Other']

interface AuditEntry { output_text: string; created_at: string }
interface Props {
  client: Client
  initialMenuItems: MenuItem[]
  auditHistory: AuditEntry[]
}

export function MenuAuditClient({ client, initialMenuItems, auditHistory }: Props) {
  const supabase = createClient()
  const [items, setItems] = useState<MenuItem[]>(initialMenuItems)
  const [isGenerating, setIsGenerating] = useState(false)
  const [auditContent, setAuditContent] = useState(auditHistory[0]?.output_text || '')
  const [selectedAuditIdx, setSelectedAuditIdx] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // Add item inline
  const [newItem, setNewItem] = useState({ name: '', price: '', category: 'Mains' })

  const addItem = async () => {
    if (!newItem.name) return
    const { data } = await supabase.from('menu_items').insert({
      client_id: client.id,
      name: newItem.name,
      price: newItem.price ? Number(newItem.price) : null,
      category: newItem.category,
      is_hero: false,
      is_margin_star: false,
      is_signature: false,
      is_active: true,
    }).select().single()

    if (data) {
      setItems(prev => [...prev, data as MenuItem])
      setNewItem({ name: '', price: '', category: 'Mains' })
    }
  }

  const deleteItem = async (id: string) => {
    await supabase.from('menu_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const toggleBadge = async (id: string, field: 'is_hero' | 'is_margin_star' | 'is_signature') => {
    const item = items.find(i => i.id === id)
    if (!item) return
    const newVal = !item[field]
    await supabase.from('menu_items').update({ [field]: newVal }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: newVal } : i))
  }

  const runAudit = async () => {
    setAuditContent('')
    setIsGenerating(true)
    try {
      const res = await fetch('/api/generate/menu-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })

      if (!res.ok) {
        const text = await res.text()
        setAuditContent(`Error: ${text}`)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setAuditContent(fullText)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.split('\n').slice(1) // skip header
    const toInsert = lines
      .map(line => {
        const [name, price, category] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
        if (!name) return null
        return { client_id: client.id, name, price: price ? Number(price) : null, category: category || 'Other', is_hero: false, is_margin_star: false, is_signature: false, is_active: true }
      })
      .filter(Boolean)

    if (toInsert.length > 0) {
      const { data } = await supabase.from('menu_items').insert(toInsert).select()
      if (data) setItems(prev => [...prev, ...data as MenuItem[]])
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const groupedItems = CATEGORIES.reduce<Record<string, MenuItem[]>>((acc, cat) => {
    acc[cat] = items.filter(i => i.category === cat)
    return acc
  }, {})
  const uncategorized = items.filter(i => !CATEGORIES.includes(i.category || ''))

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Menu Audit</h2>
          <p className="text-slate-500 text-sm mt-0.5">{client.name} · {items.length} items</p>
        </div>
        <div className="flex gap-2">
          <input type="file" accept=".csv" ref={fileRef} onChange={handleCSVImport} className="hidden" />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <Button onClick={runAudit} loading={isGenerating} disabled={items.length === 0}>
            <RefreshCw className="h-4 w-4" /> Run Audit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Menu items table */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              {/* Add new item */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <Input
                  placeholder="Item name"
                  value={newItem.name}
                  onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                  className="flex-1 min-w-32"
                />
                <Input
                  placeholder="RM"
                  type="number"
                  value={newItem.price}
                  onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))}
                  className="w-20"
                />
                <Select value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))} className="w-28">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Button size="icon" onClick={addItem}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="py-8 text-center">
                  <UtensilsCrossed className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No menu items. Add items above or import CSV.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {[...Object.entries(groupedItems).filter(([, v]) => v.length > 0), ...(uncategorized.length ? [['Other', uncategorized] as [string, MenuItem[]]] : [])].map(([cat, catItems]) => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-3 mb-1 px-1">{cat}</p>
                      {(catItems as MenuItem[]).map(item => (
                        <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 group">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-800">{item.name}</span>
                            {item.price && <span className="text-xs text-slate-400 ml-2">RM {item.price}</span>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              title="Hero item"
                              onClick={() => toggleBadge(item.id, 'is_hero')}
                              className={cn('p-1 rounded text-xs transition-colors', item.is_hero ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400')}
                            >
                              <Star className="h-3.5 w-3.5" fill={item.is_hero ? 'currentColor' : 'none'} />
                            </button>
                            <button
                              title="Margin star"
                              onClick={() => toggleBadge(item.id, 'is_margin_star')}
                              className={cn('p-1 rounded text-xs transition-colors', item.is_margin_star ? 'text-green-500' : 'text-slate-300 hover:text-green-400')}
                            >
                              <TrendingUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              title="Signature item"
                              onClick={() => toggleBadge(item.id, 'is_signature')}
                              className={cn('p-1 rounded text-xs font-bold transition-colors', item.is_signature ? 'text-purple-600' : 'text-slate-300 hover:text-purple-400')}
                            >S</button>
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="p-1 rounded text-slate-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Legend */}
              <div className="flex gap-3 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" fill="currentColor" /> Hero</span>
                <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-green-500" /> Margin Star</span>
                <span className="flex items-center gap-1 font-bold text-purple-600">S</span><span>Signature</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audit output */}
        <div className="space-y-3">
          {auditHistory.length > 1 && (
            <select
              value={selectedAuditIdx}
              onChange={e => { setSelectedAuditIdx(Number(e.target.value)); setAuditContent(auditHistory[Number(e.target.value)].output_text) }}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            >
              {auditHistory.map((a, i) => (
                <option key={i} value={i}>{new Date(a.created_at).toLocaleDateString('en-MY')} audit</option>
              ))}
            </select>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit Report</CardTitle>
            </CardHeader>
            <CardContent>
              {!auditContent && !isGenerating ? (
                <div className="py-8 text-center">
                  <p className="text-slate-400 text-sm">No audit yet. Add menu items and click Run Audit.</p>
                </div>
              ) : (
                <div className="max-h-[32rem] overflow-y-auto">
                  <StreamingOutput content={auditContent} isStreaming={isGenerating} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

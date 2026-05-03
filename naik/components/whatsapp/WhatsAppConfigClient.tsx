'use client'
import { useState } from 'react'
import { MessageCircle, Settings, Clock, Send, Copy, Check, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Client } from '@/types'
import { format, formatDistanceToNow } from 'date-fns'

interface WhatsAppConfig {
  id?: string
  client_id: string
  phone_number_id: string
  waba_id: string
  access_token: string
  verify_token: string
  bot_name: string
  welcome_message: string
  closing_hours_message: string
  business_hours_start: string
  business_hours_end: string
  accept_orders: boolean
  show_menu: boolean
  is_active: boolean
}

interface ConversationRow {
  customer_phone: string
  customer_name: string | null
  last_message_at: string
  messages: { role: string; content: string; timestamp: string }[]
}

interface Props {
  client: Client
  existingConfig: WhatsAppConfig | null
  recentConversations: ConversationRow[]
}

function generateVerifyToken() {
  return 'naik_' + Math.random().toString(36).slice(2, 14) + '_' + Date.now().toString(36)
}

export function WhatsAppConfigClient({ client, existingConfig, recentConversations }: Props) {
  const supabase = createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com'

  const [config, setConfig] = useState<WhatsAppConfig>(existingConfig || {
    client_id: client.id,
    phone_number_id: '',
    waba_id: '',
    access_token: '',
    verify_token: generateVerifyToken(),
    bot_name: `${client.name} Assistant`,
    welcome_message: `Hi! Welcome to ${client.name} 😊 How can I help you today? Type *menu* to see what we have!`,
    closing_hours_message: "We're currently closed. Our operating hours are 9am–10pm daily. Feel free to leave a message and we'll get back to you!",
    business_hours_start: '09:00',
    business_hours_end: '22:00',
    accept_orders: true,
    show_menu: true,
    is_active: true,
  })

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showAccessToken, setShowAccessToken] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [copiedVerify, setCopiedVerify] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('Hello! This is a test from Naik 👋')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [selectedConv, setSelectedConv] = useState<ConversationRow | null>(null)
  const [activeTab, setActiveTab] = useState<'setup' | 'conversations'>('setup')

  const webhookUrl = `${appUrl}/api/whatsapp/webhook`

  const setField = (key: keyof WhatsAppConfig, val: string | boolean) => {
    setConfig(prev => ({ ...prev, [key]: val }))
    setSaved(false)
  }

  const saveConfig = async () => {
    if (!config.phone_number_id || !config.access_token || !config.verify_token) {
      setSaveError('Phone Number ID, Access Token and Verify Token are required.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const payload = { ...config, client_id: client.id }
      if (config.id) {
        const { error } = await supabase.from('whatsapp_config').update(payload).eq('id', config.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('whatsapp_config').insert(payload).select().single()
        if (error) throw error
        setConfig(prev => ({ ...prev, id: data.id }))
      }
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const sendTestMessage = async () => {
    if (!testPhone) return
    setTestSending(true)
    setTestResult('')
    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, testPhone, message: testMessage }),
      })
      const data = await res.json()
      setTestResult(res.ok ? '✅ Message sent successfully!' : `❌ ${data.error}`)
    } finally {
      setTestSending(false)
    }
  }

  const copyText = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text)
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-bold text-slate-900">WhatsApp Ordering Bot</h2>
          </div>
          <p className="text-slate-500 text-sm mt-1">{client.name} · AI-powered order-taking chatbot</p>
        </div>
        <Badge variant={config.is_active && config.id ? 'default' : 'secondary'}>
          {config.id ? (config.is_active ? 'Live' : 'Paused') : 'Not configured'}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['setup', 'conversations'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
              activeTab === tab ? 'border-green-600 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab === 'conversations' ? `Conversations (${recentConversations.length})` : 'Setup & Config'}
          </button>
        ))}
      </div>

      {activeTab === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Step 1: Webhook info */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                Configure Webhook in Meta Business
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                In your <strong>Meta Developer Console → WhatsApp → Configuration</strong>, add these two values:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input value={webhookUrl} readOnly className="font-mono text-xs bg-slate-50" />
                    <Button size="icon" variant="outline" onClick={() => copyText(webhookUrl, setCopiedWebhook)}>
                      {copiedWebhook ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Verify Token</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={config.verify_token}
                        readOnly={!!config.id}
                        onChange={e => setField('verify_token', e.target.value)}
                        type={showToken ? 'text' : 'password'}
                        className="font-mono text-xs bg-slate-50 pr-8"
                      />
                      <button
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                        onClick={() => setShowToken(!showToken)}
                      >
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button size="icon" variant="outline" onClick={() => copyText(config.verify_token, setCopiedVerify)}>
                      {copiedVerify ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    {!config.id && (
                      <Button size="icon" variant="outline" title="Regenerate token" onClick={() => setField('verify_token', generateVerifyToken())}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">This is secret — keep it safe. Cannot be changed after saving.</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>Webhook subscription fields required:</strong> messages, message_deliveries, message_reads
              </div>
            </CardContent>
          </Card>

          {/* Step 2: API credentials */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                Meta API Credentials
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Phone Number ID *</Label>
                <Input
                  value={config.phone_number_id}
                  onChange={e => setField('phone_number_id', e.target.value)}
                  placeholder="e.g. 123456789012345"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-slate-400">Found in Meta → WhatsApp → Phone Numbers</p>
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp Business Account ID</Label>
                <Input
                  value={config.waba_id}
                  onChange={e => setField('waba_id', e.target.value)}
                  placeholder="e.g. 987654321098765"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Permanent Access Token *</Label>
                <div className="relative">
                  <Input
                    value={config.access_token}
                    onChange={e => setField('access_token', e.target.value)}
                    type={showAccessToken ? 'text' : 'password'}
                    placeholder="EAAxxxxx..."
                    className="font-mono text-xs pr-10"
                  />
                  <button
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowAccessToken(!showAccessToken)}
                  >
                    {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400">Use a System User token — never a temporary token</p>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Bot personality */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                Bot Personality
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Bot Name</Label>
                <Input value={config.bot_name} onChange={e => setField('bot_name', e.target.value)} placeholder="e.g. Kak Wani" />
              </div>
              <div className="space-y-1.5">
                <Label>Welcome Message</Label>
                <Textarea
                  value={config.welcome_message}
                  onChange={e => setField('welcome_message', e.target.value)}
                  rows={3}
                  placeholder="Hi! Welcome to..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Closed Hours Message</Label>
                <Textarea
                  value={config.closing_hours_message}
                  onChange={e => setField('closing_hours_message', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Opens at</Label>
                  <Input type="time" value={config.business_hours_start} onChange={e => setField('business_hours_start', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Closes at</Label>
                  <Input type="time" value={config.business_hours_end} onChange={e => setField('business_hours_end', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 4: Features */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs flex items-center justify-center font-bold">4</span>
                Features & Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'accept_orders' as const, label: 'Accept orders via WhatsApp', desc: 'Bot will take and confirm orders' },
                { key: 'show_menu' as const, label: 'Show menu to customers', desc: 'Bot will present menu items with prices' },
                { key: 'is_active' as const, label: 'Bot is active', desc: 'Toggle off to pause the bot without deleting config' },
              ].map(f => (
                <label key={f.key} className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  config[f.key] ? 'border-green-300 bg-green-50' : 'border-slate-200 hover:border-slate-300'
                )}>
                  <input
                    type="checkbox"
                    checked={config[f.key]}
                    onChange={e => setField(f.key, e.target.checked)}
                    className="mt-0.5 accent-green-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{f.label}</p>
                    <p className="text-xs text-slate-500">{f.desc}</p>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Save button */}
          <div className="lg:col-span-2 flex items-center gap-4">
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            {saved && <p className="text-sm text-green-600">✅ Configuration saved!</p>}
            <Button onClick={saveConfig} loading={saving} className="ml-auto">
              {config.id ? 'Save Changes' : 'Save & Activate Bot'}
            </Button>
          </div>

          {/* Test message */}
          {config.id && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="h-4 w-4 text-green-600" />
                  Send Test Message
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 items-end flex-wrap">
                  <div className="space-y-1.5 flex-1 min-w-40">
                    <Label>Phone number (with country code)</Label>
                    <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+60123456789" />
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-48">
                    <Label>Message</Label>
                    <Input value={testMessage} onChange={e => setTestMessage(e.target.value)} />
                  </div>
                  <Button onClick={sendTestMessage} loading={testSending} variant="outline">
                    <Send className="h-4 w-4" /> Send Test
                  </Button>
                </div>
                {testResult && <p className="text-sm mt-3">{testResult}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'conversations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Conversation list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Recent conversations</p>
            {recentConversations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <MessageCircle className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No conversations yet</p>
                </CardContent>
              </Card>
            ) : recentConversations.map(conv => (
              <button
                key={conv.customer_phone}
                onClick={() => setSelectedConv(conv)}
                className={cn(
                  'w-full text-left p-3 rounded-xl border transition-all',
                  selectedConv?.customer_phone === conv.customer_phone
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{conv.customer_name || conv.customer_phone}</p>
                    {conv.customer_name && <p className="text-xs text-slate-400">{conv.customer_phone}</p>}
                  </div>
                  <p className="text-xs text-slate-400 shrink-0">
                    {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                  </p>
                </div>
                {conv.messages.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1 truncate">
                    {conv.messages[conv.messages.length - 1]?.content}
                  </p>
                )}
              </button>
            ))}
          </div>

          {/* Conversation thread */}
          <div className="lg:col-span-2">
            {!selectedConv ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <MessageCircle className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Select a conversation to view</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="flex flex-col h-full max-h-[36rem]">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{selectedConv.customer_name || selectedConv.customer_phone}</CardTitle>
                      {selectedConv.customer_name && <p className="text-xs text-slate-400">{selectedConv.customer_phone}</p>}
                    </div>
                    <p className="text-xs text-slate-400">{selectedConv.messages.length} messages</p>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto space-y-3">
                  {selectedConv.messages.map((m, i) => (
                    <div key={i} className={cn('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}>
                      <div className={cn(
                        'max-w-xs px-3 py-2 rounded-2xl text-sm',
                        m.role === 'user'
                          ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
                          : 'bg-green-600 text-white rounded-tr-sm'
                      )}>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        <p className={cn('text-xs mt-1', m.role === 'user' ? 'text-slate-400' : 'text-green-200')}>
                          {m.timestamp ? format(new Date(m.timestamp), 'HH:mm') : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

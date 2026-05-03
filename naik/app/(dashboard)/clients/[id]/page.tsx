export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, Megaphone, UtensilsCrossed, BarChart3, Mail, Phone, User, MapPin, MessageCircle, ShoppingBag } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClientPositioning } from '@/components/clients/ClientPositioning'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Client } from '@/types'

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  const c = client as Client

  const TIER_BADGE: Record<string, 'default' | 'warning' | 'secondary'> = {
    starter: 'secondary', growth: 'warning', scale: 'default'
  }

  const quickActions = [
    { icon: CalendarDays, label: 'Content Calendar', href: `/clients/${id}/content`, color: 'text-blue-600' },
    { icon: Megaphone, label: 'Campaigns', href: `/clients/${id}/campaigns`, color: 'text-purple-600' },
    { icon: UtensilsCrossed, label: 'Menu Audit', href: `/clients/${id}/menu`, color: 'text-amber-600' },
    { icon: BarChart3, label: 'Monthly Report', href: `/clients/${id}/reports`, color: 'text-green-600' },
    { icon: MessageCircle, label: 'WhatsApp Bot', href: `/clients/${id}/whatsapp`, color: 'text-green-500' },
    { icon: ShoppingBag, label: 'Orders', href: `/clients/${id}/orders`, color: 'text-indigo-600' },
  ]

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900">{c.name}</h2>
            <Badge variant={TIER_BADGE[c.tier] || 'secondary'} className="capitalize">{c.tier}</Badge>
            <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{c.status}</Badge>
          </div>
          <p className="text-slate-500 text-sm mt-1 capitalize">{c.format?.replace('_', ' ')} · {c.price_point} price point</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {quickActions.map(action => (
          <Link key={action.href} href={action.href}>
            <Card className="hover:border-green-400 hover:shadow-md transition-all cursor-pointer">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <action.icon className={`h-5 w-5 ${action.color} shrink-0`} />
                <span className="text-sm font-medium text-slate-700">{action.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Client details */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Business Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {c.locations && c.locations.length > 0 && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    {c.locations.map(loc => <p key={loc} className="text-slate-700">{loc}</p>)}
                  </div>
                </div>
              )}

              {c.avg_spend_per_person && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Avg spend</span>
                  <span className="font-medium">RM {c.avg_spend_per_person}/pax</span>
                </div>
              )}

              {c.current_channels && c.current_channels.length > 0 && (
                <div>
                  <p className="text-slate-500 mb-1.5">Active channels</p>
                  <div className="flex flex-wrap gap-1">
                    {c.current_channels.map(ch => (
                      <Badge key={ch} variant="outline" className="text-xs capitalize">{ch.replace('_', ' ')}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {c.brand_personality && c.brand_personality.length > 0 && (
                <div>
                  <p className="text-slate-500 mb-1.5">Brand personality</p>
                  <div className="flex flex-wrap gap-1">
                    {c.brand_personality.map(p => (
                      <span key={p} className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {c.goal_90_day && (
                <div>
                  <p className="text-slate-500 mb-1">90-day goal</p>
                  <p className="text-slate-700">{c.goal_90_day}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contract</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Monthly fee</span>
                <span className="font-semibold text-green-700">{c.monthly_fee ? formatCurrency(c.monthly_fee) : '—'}/mo</span>
              </div>
              {c.contract_start && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Start date</span>
                  <span className="font-medium">{formatDate(c.contract_start)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {(c.owner_name || c.owner_email || c.owner_whatsapp) && (
            <Card>
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {c.owner_name && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <span>{c.owner_name}</span>
                  </div>
                )}
                {c.owner_whatsapp && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{c.owner_whatsapp}</span>
                  </div>
                )}
                {c.owner_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span>{c.owner_email}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Brand positioning */}
        <div className="lg:col-span-3">
          <ClientPositioning client={c} />
        </div>
      </div>
    </div>
  )
}

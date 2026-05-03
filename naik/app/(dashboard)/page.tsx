export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, CalendarDays, Megaphone, Clock, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getUpcomingFestivals, RELEVANCE_COLORS } from '@/lib/utils/festivals'
import { formatDate } from '@/lib/utils'
import type { Client, AIGeneration } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [clientsRes, postsThisMonthRes, campaignsRes, recentGenRes] = await Promise.all([
    supabase.from('clients').select('*').order('created_at', { ascending: false }),
    supabase.from('content_posts').select('id', { count: 'exact' }).gte('scheduled_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),
    supabase.from('campaigns').select('id', { count: 'exact' }).eq('status', 'active'),
    supabase.from('ai_generations').select('*, clients(name)').order('created_at', { ascending: false }).limit(5),
  ])

  const clients: Client[] = clientsRes.data || []
  const activeClients = clients.filter(c => c.status === 'active')
  const postsThisMonth = postsThisMonthRes.count || 0
  const activeCampaigns = campaignsRes.count || 0
  const recentGenerations: (AIGeneration & { clients?: { name: string } })[] = recentGenRes.data || []

  const upcomingFestivals = getUpcomingFestivals(3)

  const GEN_TYPE_LABELS: Record<string, string> = {
    content_calendar: 'Content Calendar',
    campaign_brief: 'Campaign Brief',
    menu_audit: 'Menu Audit',
    monthly_report: 'Monthly Report',
    brand_positioning: 'Brand Positioning',
    competitor_watch: 'Competitor Watch',
    freeform: 'Freeform',
  }

  const TIER_COLORS: Record<string, string> = {
    starter: 'secondary',
    growth: 'warning',
    scale: 'default',
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Clients', value: clients.length, icon: Users, color: 'text-slate-600' },
          { label: 'Active Clients', value: activeClients.length, icon: Users, color: 'text-green-600' },
          { label: 'Posts This Month', value: postsThisMonth, icon: CalendarDays, color: 'text-blue-600' },
          { label: 'Active Campaigns', value: activeCampaigns, icon: Megaphone, color: 'text-amber-600' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{stat.label}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Your Clients</h2>
            <Link href="/clients/new">
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4" /> Add Client
              </Button>
            </Link>
          </div>

          {clients.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No clients yet</p>
                <p className="text-slate-400 text-sm mt-1">Add your first F&B client to get started</p>
                <Link href="/clients/new" className="mt-4 inline-block">
                  <Button>Add First Client</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {clients.map(client => (
                <Link key={client.id} href={`/clients/${client.id}`}>
                  <Card className="hover:border-green-400 hover:shadow-md transition-all cursor-pointer">
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-slate-900">{client.name}</p>
                          <p className="text-sm text-slate-500 capitalize">{client.format?.replace('_', ' ')}</p>
                        </div>
                        <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                          {client.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={(TIER_COLORS[client.tier] || 'secondary') as 'secondary' | 'warning' | 'default'}>
                          {client.tier}
                        </Badge>
                        {client.locations?.slice(0, 1).map(loc => (
                          <span key={loc} className="text-xs text-slate-400">{loc}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Upcoming festivals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming Festivals</CardTitle>
            </CardHeader>
            <CardContent className="pt-2 space-y-3">
              {upcomingFestivals.map(festival => (
                <div key={festival.name} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{festival.name}</p>
                    <p className="text-xs text-slate-500">{festival.daysUntil === 0 ? 'Today' : `In ${festival.daysUntil} days`}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RELEVANCE_COLORS[festival.f_and_b_relevance]}`}>
                    {festival.f_and_b_relevance}
                  </span>
                </div>
              ))}
              {upcomingFestivals.length === 0 && (
                <p className="text-sm text-slate-400">No upcoming festivals</p>
              )}
            </CardContent>
          </Card>

          {/* Recent AI generations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Generations</CardTitle>
            </CardHeader>
            <CardContent className="pt-2 space-y-3">
              {recentGenerations.length === 0 ? (
                <p className="text-sm text-slate-400">No generations yet</p>
              ) : recentGenerations.map(gen => (
                <div key={gen.id} className="flex items-start gap-2">
                  <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">{GEN_TYPE_LABELS[gen.type] || gen.type}</p>
                    {gen.clients && <p className="text-xs text-slate-400">{gen.clients.name}</p>}
                    <p className="text-xs text-slate-400">{formatDate(gen.created_at)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

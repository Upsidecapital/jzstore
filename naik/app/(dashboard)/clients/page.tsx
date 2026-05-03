export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Client } from '@/types'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  const allClients: Client[] = clients || []

  const TIER_BADGE: Record<string, 'default' | 'warning' | 'secondary'> = {
    starter: 'secondary',
    growth: 'warning',
    scale: 'default',
  }

  const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive'> = {
    active: 'default',
    paused: 'secondary',
    churned: 'destructive',
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Clients</h2>
          <p className="text-slate-500 text-sm mt-1">{allClients.length} total • {allClients.filter(c => c.status === 'active').length} active</p>
        </div>
        <Link href="/clients/new">
          <Button>
            <Plus className="h-4 w-4" /> New Client
          </Button>
        </Link>
      </div>

      {allClients.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 text-slate-200 mx-auto mb-4" />
            <h3 className="font-semibold text-slate-700 text-lg">No clients yet</h3>
            <p className="text-slate-400 text-sm mt-2">Add your first Malaysian F&B client to start generating marketing.</p>
            <Link href="/clients/new" className="mt-6 inline-block">
              <Button>Add First Client</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {allClients.map(client => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="h-full hover:border-green-400 hover:shadow-md transition-all cursor-pointer">
                <CardContent className="pt-5 pb-5 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900 truncate">{client.name}</h3>
                      <p className="text-sm text-slate-500 capitalize mt-0.5">{client.format?.replace('_', ' ')}</p>
                    </div>
                    <Badge variant={STATUS_BADGE[client.status] || 'secondary'} className="ml-2 shrink-0">
                      {client.status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant={TIER_BADGE[client.tier] || 'secondary'} className="capitalize">
                      {client.tier}
                    </Badge>
                    <Badge variant="outline" className="capitalize">{client.price_point}</Badge>
                  </div>

                  {client.locations && client.locations.length > 0 && (
                    <p className="text-xs text-slate-400 mb-2 truncate">📍 {client.locations.join(' · ')}</p>
                  )}

                  {client.monthly_fee && (
                    <p className="text-sm font-medium text-green-700 mt-auto">{formatCurrency(client.monthly_fee)}/mo</p>
                  )}

                  <p className="text-xs text-slate-400 mt-1">Added {formatDate(client.created_at)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

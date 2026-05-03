'use client'
import { useState, useEffect } from 'react'
import { ShoppingBag, Clock, CheckCircle, Truck, XCircle, ChefHat, Bell } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { cn, formatCurrency } from '@/lib/utils'
import type { Client } from '@/types'

interface OrderItem {
  name: string
  price: number
  qty: number
  notes?: string
}

interface WhatsAppOrder {
  id: string
  created_at: string
  updated_at: string
  customer_phone: string
  customer_name: string | null
  order_items: OrderItem[]
  total_amount: number
  special_notes: string | null
  order_type: string
  table_number: string | null
  delivery_address: string | null
  status: 'new' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  order_number: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  new:       { label: 'New',       color: 'bg-blue-100 text-blue-700 border-blue-200',    icon: Bell },
  confirmed: { label: 'Confirmed', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: CheckCircle },
  preparing: { label: 'Preparing', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: ChefHat },
  ready:     { label: 'Ready',     color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  completed: { label: 'Completed', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-600 border-red-200',       icon: XCircle },
}

const STATUS_FLOW: Record<string, string> = {
  new: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'completed',
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
}

interface Props { client: Client; initialOrders: WhatsAppOrder[] }

export function OrdersClient({ client, initialOrders }: Props) {
  const supabase = createClient()
  const [orders, setOrders] = useState<WhatsAppOrder[]>(initialOrders)
  const [selectedOrder, setSelectedOrder] = useState<WhatsAppOrder | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel(`orders-${client.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_orders', filter: `client_id=eq.${client.id}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            setOrders(prev => [payload.new as WhatsAppOrder, ...prev])
          }
          if (payload.eventType === 'UPDATE') {
            setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new as WhatsAppOrder : o))
            setSelectedOrder(prev => prev?.id === payload.new.id ? payload.new as WhatsAppOrder : prev)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [client.id])

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId)
    try {
      await supabase.from('whatsapp_orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', orderId)
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as WhatsAppOrder['status'] } : o))
      if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, status: newStatus as WhatsAppOrder['status'] } : null)
    } finally {
      setUpdatingId(null)
    }
  }

  const cancelOrder = async (orderId: string) => {
    if (!confirm('Cancel this order?')) return
    await updateStatus(orderId, 'cancelled')
  }

  const activeStatuses = ['new', 'confirmed', 'preparing', 'ready']
  const filtered = filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus)
  const activeOrders = orders.filter(o => activeStatuses.includes(o.status))

  const stats = {
    new: orders.filter(o => o.status === 'new').length,
    active: orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status)).length,
    completed: orders.filter(o => o.status === 'completed').length,
    revenue: orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total_amount || 0), 0),
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-bold text-slate-900">WhatsApp Orders</h2>
          </div>
          <p className="text-slate-500 text-sm mt-0.5">{client.name} · Real-time order management</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm text-slate-500">Live</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'New Orders', value: stats.new, icon: Bell, color: 'text-blue-600', urgent: stats.new > 0 },
          { label: 'In Progress', value: stats.active, icon: ChefHat, color: 'text-purple-600', urgent: false },
          { label: 'Completed Today', value: stats.completed, icon: CheckCircle, color: 'text-green-600', urgent: false },
          { label: 'Revenue Today', value: `RM ${stats.revenue.toFixed(0)}`, icon: ShoppingBag, color: 'text-amber-600', urgent: false },
        ].map(stat => (
          <Card key={stat.label} className={cn(stat.urgent && 'border-blue-400 shadow-blue-100 shadow-md')}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">{stat.label}</p>
                  <p className={cn('text-2xl font-bold mt-0.5', stat.urgent ? 'text-blue-700' : 'text-slate-900')}>{stat.value}</p>
                </div>
                <stat.icon className={`h-7 w-7 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders list */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-40">
              <option value="all">All orders</option>
              {Object.entries(STATUS_CONFIG).map(([key, s]) => (
                <option key={key} value={key}>{s.label}</option>
              ))}
            </Select>
            <span className="text-sm text-slate-400">{filtered.length} orders</span>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ShoppingBag className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No orders yet</p>
                <p className="text-slate-300 text-xs mt-1">Orders placed via WhatsApp will appear here in real-time</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
              {filtered.map(order => {
                const statusCfg = STATUS_CONFIG[order.status]
                const StatusIcon = statusCfg.icon
                const isSelected = selectedOrder?.id === order.id
                return (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={cn(
                      'w-full text-left p-4 rounded-xl border transition-all',
                      isSelected ? 'border-green-500 bg-green-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300',
                      order.status === 'new' && !isSelected && 'border-blue-300 bg-blue-50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-slate-900 text-sm">#{order.order_number}</span>
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium', statusCfg.color)}>
                            <StatusIcon className="h-3 w-3" />
                            {statusCfg.label}
                          </span>
                          <Badge variant="outline" className="text-xs capitalize">{ORDER_TYPE_LABELS[order.order_type] || order.order_type}</Badge>
                        </div>
                        <p className="text-sm font-medium text-slate-700">{order.customer_name || order.customer_phone}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{order.order_items.length} items · RM {order.total_amount?.toFixed(2)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</p>
                        {order.table_number && <p className="text-xs text-slate-500 mt-1">Table {order.table_number}</p>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Order detail */}
        <div>
          {!selectedOrder ? (
            <Card>
              <CardContent className="py-16 text-center">
                <ShoppingBag className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Select an order to view details</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Order #{selectedOrder.order_number}</CardTitle>
                    <p className="text-xs text-slate-400 mt-0.5">{format(new Date(selectedOrder.created_at), 'dd MMM yyyy, HH:mm')}</p>
                  </div>
                  <span className={cn('inline-flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-medium', STATUS_CONFIG[selectedOrder.status].color)}>
                    {STATUS_CONFIG[selectedOrder.status].label}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Customer info */}
                <div className="p-3 bg-slate-50 rounded-lg space-y-1 text-sm">
                  <p className="font-medium text-slate-800">{selectedOrder.customer_name || 'Unknown'}</p>
                  <p className="text-slate-500">{selectedOrder.customer_phone}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="capitalize">{ORDER_TYPE_LABELS[selectedOrder.order_type] || selectedOrder.order_type}</Badge>
                    {selectedOrder.table_number && <span className="text-xs text-slate-500">Table {selectedOrder.table_number}</span>}
                    {selectedOrder.delivery_address && <span className="text-xs text-slate-500">{selectedOrder.delivery_address}</span>}
                  </div>
                </div>

                {/* Order items */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Items</p>
                  {selectedOrder.order_items.map((item, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 text-sm">
                      <div>
                        <span className="font-medium text-slate-800">{item.qty}× {item.name}</span>
                        {item.notes && <p className="text-xs text-slate-400 mt-0.5">Note: {item.notes}</p>}
                      </div>
                      <span className="text-slate-700 font-medium shrink-0">RM {(item.price * item.qty).toFixed(2)}</span>
                    </div>
                  ))}
                  {selectedOrder.special_notes && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                      📝 {selectedOrder.special_notes}
                    </p>
                  )}
                  <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900">
                    <span>Total</span>
                    <span>RM {selectedOrder.total_amount?.toFixed(2)}</span>
                  </div>
                </div>

                {/* Actions */}
                {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                  <div className="flex gap-2 pt-2">
                    {STATUS_FLOW[selectedOrder.status] && (
                      <Button
                        className="flex-1"
                        loading={updatingId === selectedOrder.id}
                        onClick={() => updateStatus(selectedOrder.id, STATUS_FLOW[selectedOrder.status])}
                      >
                        Mark as {STATUS_CONFIG[STATUS_FLOW[selectedOrder.status]]?.label}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelOrder(selectedOrder.id)}
                      className="text-red-500 border-red-200 hover:bg-red-50"
                    >
                      <XCircle className="h-4 w-4" /> Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

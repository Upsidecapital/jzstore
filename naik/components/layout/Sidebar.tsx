'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Users, CalendarDays, Megaphone, UtensilsCrossed,
  BarChart3, Zap, Settings, ChevronDown, LogOut, TrendingUp
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/types'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: Users, label: 'Clients', href: '/clients' },
]

const clientNavItems = [
  { icon: CalendarDays, label: 'Content Calendar', href: '/content' },
  { icon: Megaphone, label: 'Campaigns', href: '/campaigns' },
  { icon: UtensilsCrossed, label: 'Menu Audit', href: '/menu' },
  { icon: BarChart3, label: 'Monthly Report', href: '/reports' },
]

const bottomNavItems = [
  { icon: Zap, label: 'Quick Generate', href: '/generate' },
  { icon: Settings, label: 'Settings', href: '/settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientMenuOpen, setClientMenuOpen] = useState(false)

  const clientIdMatch = pathname.match(/\/clients\/([^/]+)/)
  const currentClientId = clientIdMatch?.[1]

  useEffect(() => {
    supabase.from('clients').select('id,name,slug,status').eq('status', 'active').order('name')
      .then(({ data }) => {
        if (data) setClients(data as Client[])
      })
  }, [])

  useEffect(() => {
    if (currentClientId && clients.length > 0) {
      const found = clients.find(c => c.id === currentClientId)
      if (found) setSelectedClient(found)
    }
  }, [currentClientId, clients])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-slate-900 flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Naik</span>
        </div>
        <p className="text-slate-400 text-xs mt-1">AI CMO Platform</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive(item.href) && item.href !== '/clients'
                ? 'bg-green-600 text-white'
                : item.href === '/clients' && isActive('/clients')
                ? 'bg-green-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}

        {/* Client switcher */}
        {clients.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setClientMenuOpen(!clientMenuOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800 transition-colors"
            >
              <span className="uppercase tracking-wider font-semibold">Client</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', clientMenuOpen && 'rotate-180')} />
            </button>

            {clientMenuOpen && (
              <div className="mt-1 ml-3 space-y-0.5 border-l border-slate-700 pl-3">
                {clients.map(client => (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedClient(client)
                      router.push(`/clients/${client.id}`)
                      setClientMenuOpen(false)
                    }}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded text-sm transition-colors',
                      selectedClient?.id === client.id
                        ? 'text-green-400 font-medium'
                        : 'text-slate-400 hover:text-white'
                    )}
                  >
                    {client.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Client-specific nav */}
        {selectedClient && currentClientId && (
          <div className="mt-2 border-t border-slate-700 pt-2 space-y-1">
            <p className="px-3 py-1 text-xs text-slate-500 uppercase tracking-wider truncate">{selectedClient.name}</p>
            {clientNavItems.map(item => {
              const href = `/clients/${selectedClient.id}${item.href}`
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    pathname === href
                      ? 'bg-green-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 py-4 border-t border-slate-700 space-y-1">
        {bottomNavItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive(item.href)
                ? 'bg-green-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}

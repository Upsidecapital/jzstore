'use client'
import { usePathname, useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/clients': 'Clients',
  '/clients/new': 'New Client',
  '/generate': 'Quick Generate',
  '/settings': 'Settings',
}

function getTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.includes('/content')) return 'Content Calendar'
  if (pathname.includes('/campaigns')) return 'Campaigns'
  if (pathname.includes('/menu')) return 'Menu Audit'
  if (pathname.includes('/reports')) return 'Monthly Reports'
  if (pathname.includes('/whatsapp')) return 'WhatsApp Bot'
  if (pathname.includes('/orders')) return 'Orders'
  if (pathname.match(/\/clients\/[^/]+$/)) return 'Client Overview'
  return 'Naik'
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const title = getTitle(pathname)

  return (
    <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <h1 className="font-semibold text-slate-900">{title}</h1>
      <Button
        size="sm"
        onClick={() => router.push('/generate')}
        className="gap-1.5"
      >
        <Zap className="h-3.5 w-3.5" />
        Quick Generate
      </Button>
    </header>
  )
}

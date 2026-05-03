import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Naik — AI CMO for Malaysian F&B',
  description: 'AI-powered marketing for Malaysian F&B businesses',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}

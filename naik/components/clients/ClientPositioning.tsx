'use client'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StreamingOutput } from '@/components/StreamingOutput'
import type { Client } from '@/types'

export function ClientPositioning({ client }: { client: Client }) {
  const [content, setContent] = useState(client.brand_positioning_content || '')
  const [isStreaming, setIsStreaming] = useState(false)

  const generate = async () => {
    setContent('')
    setIsStreaming(true)
    try {
      const res = await fetch('/api/generate/brand-positioning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setContent(prev => prev + decoder.decode(value, { stream: true }))
      }
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Brand Positioning</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={generate}
            loading={isStreaming}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {content ? 'Regenerate' : 'Generate'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!content && !isStreaming ? (
          <div className="py-12 text-center">
            <p className="text-slate-500 text-sm">No brand positioning generated yet.</p>
            <p className="text-slate-400 text-xs mt-1">Click Generate to create one.</p>
          </div>
        ) : (
          <StreamingOutput content={content} isStreaming={isStreaming} />
        )}
      </CardContent>
    </Card>
  )
}

'use client'
import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface StreamingOutputProps {
  content: string
  isStreaming: boolean
  className?: string
}

export function StreamingOutput({ content, isStreaming, className }: StreamingOutputProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isStreaming) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [content, isStreaming])

  if (!content && !isStreaming) return null

  return (
    <div className={cn('prose max-w-none text-slate-800 text-sm leading-relaxed', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      {isStreaming && <span className="streaming-cursor" />}
      <div ref={endRef} />
    </div>
  )
}

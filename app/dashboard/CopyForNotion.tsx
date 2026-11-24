'use client'
import { useState } from 'react'
import { buildNotionMarkdown, type NotionCopyInput } from '@/lib/notion-copy'

interface CopyForNotionProps extends NotionCopyInput {
  // Optional override for the button label.
  label?: string
  // Visual variant — compact is for inline placement in video card headers.
  variant?: 'default' | 'compact'
}

export default function CopyForNotion(props: CopyForNotionProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const md = buildNotionMarkdown(props)
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed', err)
    }
  }

  const defaultLabel = props.videoType ? 'Copy this video' : 'Copy for Notion'
  const label = copied ? '✓ Copied!' : (props.label ?? defaultLabel)

  const baseClass = 'inline-flex items-center gap-2 whitespace-nowrap font-medium transition-colors'
  const className =
    props.variant === 'compact'
      ? `${baseClass} text-xs px-3 py-1.5 rounded-md border border-brand-border bg-white text-brand-dark hover:bg-gray-100`
      : `${baseClass} btn-secondary text-sm`

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      aria-label={
        props.videoType
          ? `Copy ${props.videoType} as Notion-friendly markdown`
          : 'Copy entire brief as Notion-friendly markdown'
      }
    >
      {label}
    </button>
  )
}

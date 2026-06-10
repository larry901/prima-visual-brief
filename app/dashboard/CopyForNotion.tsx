'use client'
import { useState } from 'react'
import type { TrackRef } from './TrackList'

interface VideoDetail {
  highlights?: string
  avoid?: string
  selectedTracks?: TrackRef[]
  referenceArtist?: string
  inspirationLinks?: string[]
  inspirationThoughts?: string
  script?: string
}

interface CopyForNotionProps {
  agentName: string
  propertyAddress: string
  shootDate: string
  submittedAt: string
  videoTypes: string[]
  videoDetails: Record<string, VideoDetail>
  driveLink: string | null
  assetNotes: string | null
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function buildMarkdown(props: CopyForNotionProps): string {
  const out: string[] = []

  out.push(`# ${props.agentName} — ${props.propertyAddress}`)
  out.push('')
  out.push(`**Agent:** ${props.agentName}`)
  out.push(`**Shoot date:** ${fmtDate(props.shootDate)}`)
  out.push(`**Submitted:** ${fmtDate(props.submittedAt)}`)
  out.push('')

  for (const type of props.videoTypes) {
    const d = props.videoDetails[type] || {}
    out.push(`## ${type}`)
    out.push('')
    if (d.script) {
      out.push(`**Vision:**`)
      out.push(d.script)
      out.push('')
    }
    if (d.highlights) {
      out.push(`**Highlights:** ${d.highlights}`)
    }
    if (d.avoid) {
      out.push(`**Avoid:** ${d.avoid}`)
    }
    // Non-bullet fields go before any bullet list so Notion doesn't nest them
    // under the last bullet when the markdown is pasted.
    if (d.referenceArtist) {
      out.push(`**Reference artist (typed):** ${d.referenceArtist}`)
    }
    if (d.inspirationThoughts) {
      out.push(`**What they love about the examples:** ${d.inspirationThoughts}`)
    }
    if (d.selectedTracks && d.selectedTracks.length > 0) {
      out.push(`**Reference tracks:**`)
      for (const t of d.selectedTracks) {
        out.push(`- [${t.name}](${t.spotifyUrl}) — ${t.artist}`)
      }
      out.push('')
    }
    if (d.inspirationLinks && d.inspirationLinks.length > 0) {
      out.push(`**Inspiration links:**`)
      for (const link of d.inspirationLinks) {
        out.push(`- ${link}`)
      }
      out.push('')
    }
  }

  if (props.driveLink || props.assetNotes) {
    out.push(`## Files & Assets`)
    out.push('')
    if (props.driveLink) {
      out.push(`- **Drive:** ${props.driveLink}`)
    }
    if (props.assetNotes) {
      out.push(`- **Notes:** ${props.assetNotes}`)
    }
    out.push('')
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export default function CopyForNotion(props: CopyForNotionProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const md = buildMarkdown(props)
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed', err)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="btn-secondary text-sm inline-flex items-center gap-2 whitespace-nowrap"
      aria-label="Copy brief as Notion-friendly markdown"
    >
      {copied ? '✓ Copied!' : 'Copy for Notion'}
    </button>
  )
}

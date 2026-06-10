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
  // When set, copies the markdown for ONLY this video section (plus shoot
  // context + files). Used per-video so each Notion page is one project.
  videoType?: string
  // Optional override for the button label.
  label?: string
  // Visual variant — compact is for inline placement in video card headers.
  variant?: 'default' | 'compact'
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function appendVideoBlock(
  out: string[],
  type: string,
  d: VideoDetail,
  asHeading: boolean
) {
  if (asHeading) {
    out.push(`## ${type}`)
    out.push('')
  }
  if (d.script) {
    out.push(`**Vision:**`)
    out.push(d.script)
    out.push('')
  }
  if (d.highlights) out.push(`**Highlights:** ${d.highlights}`)
  if (d.avoid) out.push(`**Avoid:** ${d.avoid}`)
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

function appendFilesBlock(
  out: string[],
  driveLink: string | null,
  assetNotes: string | null
) {
  if (!driveLink && !assetNotes) return
  out.push(`## Files & Assets`)
  out.push('')
  if (driveLink) out.push(`- **Drive:** ${driveLink}`)
  if (assetNotes) out.push(`- **Notes:** ${assetNotes}`)
  out.push('')
}

function buildMarkdown(props: CopyForNotionProps): string {
  const out: string[] = []

  if (props.videoType) {
    // Per-video copy — title is the video type + address so each Notion page
    // is uniquely titled. Shoot info follows, then the single video block.
    const detail = props.videoDetails[props.videoType] || {}
    out.push(`# ${props.videoType} — ${props.propertyAddress}`)
    out.push('')
    out.push(`**Agent:** ${props.agentName}`)
    out.push(`**Property:** ${props.propertyAddress}`)
    out.push(`**Shoot date:** ${fmtDate(props.shootDate)}`)
    out.push('')
    appendVideoBlock(out, props.videoType, detail, /* asHeading */ false)
    appendFilesBlock(out, props.driveLink, props.assetNotes)
  } else {
    // Whole-brief copy — top-level title, then a section per video, then files.
    out.push(`# ${props.agentName} — ${props.propertyAddress}`)
    out.push('')
    out.push(`**Agent:** ${props.agentName}`)
    out.push(`**Shoot date:** ${fmtDate(props.shootDate)}`)
    out.push(`**Submitted:** ${fmtDate(props.submittedAt)}`)
    out.push('')
    for (const type of props.videoTypes) {
      const detail = props.videoDetails[type] || {}
      appendVideoBlock(out, type, detail, /* asHeading */ true)
    }
    appendFilesBlock(out, props.driveLink, props.assetNotes)
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

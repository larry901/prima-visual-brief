import { markdownAlt, scriptPhotosFromDetail } from './script-photos'

interface TrackRef {
  name?: string
  artist?: string
  spotifyUrl?: string
}

export interface NotionVideoDetail {
  highlights?: string
  avoid?: string
  selectedTracks?: TrackRef[]
  referenceArtist?: string
  inspirationLinks?: string[]
  inspirationThoughts?: string
  script?: string
  scriptPhotos?: unknown
}

export interface NotionCopyInput {
  agentName: string
  propertyAddress: string
  shootDate: string
  submittedAt: string
  videoTypes: string[]
  videoDetails: Record<string, NotionVideoDetail>
  driveLink: string | null
  assetNotes: string | null
  /** When set, copy only this video section plus shoot context. */
  videoType?: string
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function appendVideoBlock(out: string[], type: string, d: NotionVideoDetail, asHeading: boolean) {
  if (asHeading) {
    out.push(`## ${type}`)
    out.push('')
  }
  if (d.script) {
    out.push(`**Vision:**`)
    out.push(d.script)
    out.push('')
  }
  const photos = scriptPhotosFromDetail(d)
  if (photos.length > 0) {
    out.push(`**Reference photos:**`)
    out.push('')
    for (const photo of photos) {
      out.push(`![${markdownAlt(photo.name)}](${photo.url})`)
      out.push('')
    }
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

function appendFilesBlock(out: string[], driveLink: string | null, assetNotes: string | null) {
  if (!driveLink && !assetNotes) return
  out.push(`## Files & Assets`)
  out.push('')
  if (driveLink) out.push(`- **Drive:** ${driveLink}`)
  if (assetNotes) out.push(`- **Notes:** ${assetNotes}`)
  out.push('')
}

/** Markdown ops pastes onto a Notion edit page. Image lines are public Blob URLs. */
export function buildNotionMarkdown(props: NotionCopyInput): string {
  const out: string[] = []

  if (props.videoType) {
    const detail = props.videoDetails[props.videoType] || {}
    out.push(`# ${props.videoType} — ${props.propertyAddress}`)
    out.push('')
    out.push(`**Agent:** ${props.agentName}`)
    out.push(`**Property:** ${props.propertyAddress}`)
    out.push(`**Shoot date:** ${fmtDate(props.shootDate)}`)
    out.push('')
    appendVideoBlock(out, props.videoType, detail, false)
    appendFilesBlock(out, props.driveLink, props.assetNotes)
  } else {
    out.push(`# ${props.agentName} — ${props.propertyAddress}`)
    out.push('')
    out.push(`**Agent:** ${props.agentName}`)
    out.push(`**Shoot date:** ${fmtDate(props.shootDate)}`)
    out.push(`**Submitted:** ${fmtDate(props.submittedAt)}`)
    out.push('')
    for (const type of props.videoTypes) {
      const detail = props.videoDetails[type] || {}
      appendVideoBlock(out, type, detail, true)
    }
    appendFilesBlock(out, props.driveLink, props.assetNotes)
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

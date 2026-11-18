import Link from 'next/link'
import { notFound } from 'next/navigation'
import BriefEditLink from '../../../BriefEditLink'
import type { VideoDetail } from '@/lib/db'
import { linkConfidentBriefs } from '@/lib/hub/brief-links'
import {
  briefEditStatus,
  briefOwnerId,
  briefShootLabel,
  briefTitle,
  editListState,
  type RosterClientRef,
} from '@/lib/hub/brief-match'
import { loadHubEditBoard } from '@/lib/hub/edit-board'
import { notionPageUrl } from '@/lib/hub/edits'
import { requireHubPage } from '@/lib/hub/session'
import { ensureDemoSeed } from '@/lib/portal/seed'
import { getPortalStore } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

function readStringList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function readVideoDetails(value: string): Record<string, Partial<VideoDetail>> {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, Partial<VideoDetail>>
  } catch {
    return {}
  }
}

function safeHref(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString()
  } catch {
    return null
  }
  return null
}

function fileName(filePath: string): string {
  const trimmed = filePath.split('?')[0] || filePath
  const name = trimmed.split('/').pop()
  return name && name.trim() ? name : 'File'
}

function isImagePath(filePath: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(filePath.split('?')[0] || filePath)
}

export default async function HubBriefPage({ params }: { params: { id: string } }) {
  await requireHubPage()
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const store = getPortalStore()
  await store.ensureReady()
  await ensureDemoSeed(store)
  const [found, clients, board] = await Promise.all([
    store.getBriefById(id),
    store.listClients(),
    loadHubEditBoard(),
  ])
  if (!found) notFound()

  const clientRefs: RosterClientRef[] = clients.map((client) => ({
    id: client.id,
    email: client.email,
    additionalEmails: client.additionalEmails,
    notionClientId: client.notionClientId,
  }))
  const linked = await linkConfidentBriefs(store, [found], clientRefs, board.edits, {
    persist: board.configured && !board.unavailable,
  })
  const brief = linked[0] ?? found
  const ownerId = briefOwnerId(brief, clientRefs)
  const owner = ownerId == null ? null : clients.find((client) => client.id === ownerId) ?? null
  const notion = editListState(board)
  const pageId = brief.notion_edit_page_id
  const status = briefEditStatus(pageId, board.edits, notion)
  const videoTypes = readStringList(brief.video_types)
  const videoDetails = readVideoDetails(brief.video_details)
  const filePaths = readStringList(brief.file_paths)
  const driveHref = safeHref(brief.drive_link)

  return (
    <main className="hub-stack">
      <Link className="hub-btn hub-btn-ghost" href="/hub/clients">
        Clients
      </Link>
      <div>
        <p className="hub-kicker">Brief</p>
        <h1>{briefTitle(brief)}</h1>
        <p className="hub-note">{brief.agent_name || 'No agent name'}</p>
        <p className="hub-muted">Shoot {briefShootLabel(brief.shoot_date)}</p>
        <p className="hub-muted">{owner ? owner.name : 'Not matched to a roster client'}</p>
        {brief.edited_by_client ? <p className="hub-warn">Edited by client</p> : null}
      </div>

      <BriefEditLink
        briefId={brief.id}
        pageId={pageId}
        linkSource={brief.notion_edit_link}
        status={status}
        notionUrl={pageId ? notionPageUrl(pageId) : null}
        notion={notion}
        sample={board.usingSample}
        clientNotionId={owner?.notionClientId ?? null}
        edits={board.edits.map((edit) => ({
          id: edit.id,
          name: edit.name,
          status: edit.status,
          shotOn: edit.shotOn,
          clientIds: edit.clientIds,
        }))}
      />

      <section className="hub-card" aria-labelledby="shoot-info">
        <p id="shoot-info" className="hub-kicker">
          Shoot
        </p>
        <dl className="hub-dl">
          <div>
            <dt>Agent</dt>
            <dd>{brief.agent_name || '—'}</dd>
          </div>
          <div>
            <dt>Property</dt>
            <dd>{brief.property_address || '—'}</dd>
          </div>
          <div>
            <dt>Shoot date</dt>
            <dd>{briefShootLabel(brief.shoot_date)}</dd>
          </div>
          <div>
            <dt>Agent on site</dt>
            <dd>{brief.agent_on_site || '—'}</dd>
          </div>
          {brief.gate_code ? (
            <div>
              <dt>Gate code</dt>
              <dd>{brief.gate_code}</dd>
            </div>
          ) : null}
          {brief.lockbox_code ? (
            <div>
              <dt>Lockbox code</dt>
              <dd>{brief.lockbox_code}</dd>
            </div>
          ) : null}
          {brief.access_notes ? (
            <div>
              <dt>Access notes</dt>
              <dd className="hub-prose">{brief.access_notes}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {videoTypes.length > 0 ? (
        <section className="hub-stack" aria-labelledby="video-sections">
          <h2 id="video-sections">Video sections</h2>
          {videoTypes.map((type) => (
            <VideoBlock key={type} type={type} detail={videoDetails[type] ?? {}} />
          ))}
        </section>
      ) : null}

      <section className="hub-card" aria-labelledby="brief-files">
        <p id="brief-files" className="hub-kicker">
          Files
        </p>
        {filePaths.length > 0 ? (
          <ul className="hub-brief-list">
            {filePaths.map((filePath, index) => {
              const href = safeHref(filePath)
              const name = fileName(filePath)
              if (!href) return <li key={`${index}-${name}`}>{name}</li>
              if (isImagePath(filePath)) {
                return (
                  <li key={`${index}-${name}`}>
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="hub-brief-image" src={href} alt={name} />
                    </a>
                  </li>
                )
              }
              return (
                <li key={`${index}-${name}`}>
                  <a className="hub-link" href={href} target="_blank" rel="noopener noreferrer">
                    {name}
                  </a>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="hub-muted">No files uploaded.</p>
        )}
        {driveHref ? (
          <a className="hub-btn hub-btn-ghost hub-btn-block" href={driveHref} target="_blank" rel="noopener noreferrer">
            Open drive link
          </a>
        ) : null}
        {brief.asset_notes ? <p className="hub-prose">{brief.asset_notes}</p> : null}
      </section>
    </main>
  )
}

function VideoBlock({ type, detail }: { type: string; detail: Partial<VideoDetail> }) {
  const tracks = Array.isArray(detail.selectedTracks)
    ? detail.selectedTracks.filter((track) => track && typeof track === 'object')
    : []
  const links = Array.isArray(detail.inspirationLinks) ? detail.inspirationLinks.filter((link) => typeof link === 'string') : []
  return (
    <section className="hub-card">
      <h2>{type}</h2>
      <dl className="hub-dl">
        {detail.highlights ? (
          <div>
            <dt>Features to highlight</dt>
            <dd className="hub-prose">{detail.highlights}</dd>
          </div>
        ) : null}
        {detail.avoid ? (
          <div>
            <dt>Avoid / downplay</dt>
            <dd className="hub-prose">{detail.avoid}</dd>
          </div>
        ) : null}
        {detail.referenceArtist ? (
          <div>
            <dt>Reference artist</dt>
            <dd>{detail.referenceArtist}</dd>
          </div>
        ) : null}
        {links.length > 0 ? (
          <div>
            <dt>Inspiration links</dt>
            <dd className="hub-stack">
              {links.map((link, index) => {
                const href = safeHref(link)
                return href ? (
                  <a key={`${index}-${link}`} className="hub-link" href={href} target="_blank" rel="noopener noreferrer">
                    {link}
                  </a>
                ) : (
                  <span key={`${index}-${link}`}>{link}</span>
                )
              })}
            </dd>
          </div>
        ) : null}
        {detail.inspirationThoughts ? (
          <div>
            <dt>What they love about examples</dt>
            <dd className="hub-prose">{detail.inspirationThoughts}</dd>
          </div>
        ) : null}
        {detail.script ? (
          <div>
            <dt>Script / talking points</dt>
            <dd className="hub-prose">{detail.script}</dd>
          </div>
        ) : null}
      </dl>
      {tracks.length > 0 ? (
        <div className="hub-stack">
          <p className="hub-muted">Reference tracks</p>
          <ul className="hub-brief-list">
            {tracks.map((track, index) => {
              const href = safeHref(typeof track.spotifyUrl === 'string' ? track.spotifyUrl : null)
              const name = typeof track.name === 'string' ? track.name : 'Track'
              const artist = typeof track.artist === 'string' ? track.artist : ''
              const label = artist ? `${name} · ${artist}` : name
              return (
                <li key={track.id ? `${track.id}-${index}` : `${index}-${label}`}>
                  {href ? (
                    <a className="hub-link" href={href} target="_blank" rel="noopener noreferrer">
                      {label}
                    </a>
                  ) : (
                    <span>{label}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

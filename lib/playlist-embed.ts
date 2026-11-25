// Parse the public Spotify embed page into the snapshot shape stored in
// data/playlist-tracks.json. No developer credentials: the embed server-renders
// the playlist in a __NEXT_DATA__ JSON block. See the note in lib/spotify.ts.

export const DEFAULT_PLAYLIST_ID = '6tk5vOlKor3dioJJPXAhBj'

export interface PlaylistTrackRecord {
  id: string
  name: string
  artist: string
}

export interface SkippedTrack {
  id: string | null
  name: string
  artist: string
  reason: string
}

export interface ParsedPlaylist {
  playlistId: string
  playlistName: string
  tracks: PlaylistTrackRecord[]
  skipped: SkippedTrack[]
}

export interface PlaylistDiff {
  added: PlaylistTrackRecord[]
  removed: PlaylistTrackRecord[]
  changed: Array<{ before: PlaylistTrackRecord; after: PlaylistTrackRecord }>
}

const TRACK_ID = /^[A-Za-z0-9]{22}$/
const PLAYLIST_IN_URL = /(?:playlist[/:]|spotify:playlist:)([A-Za-z0-9]{22})/

/** Playlist id from a bare id or an open.spotify.com / spotify: URL. */
export function parsePlaylistRef(input: string | undefined): string {
  if (!input || input === '--') return DEFAULT_PLAYLIST_ID
  const trimmed = input.trim()
  const fromUrl = trimmed.match(PLAYLIST_IN_URL)
  if (fromUrl) return fromUrl[1]
  if (TRACK_ID.test(trimmed)) return trimmed
  throw new Error(`Expected a Spotify playlist id or URL, got: ${trimmed}`)
}

function normalizeSpace(value: string): string {
  return value.replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ').trim()
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

interface EmbedTrack {
  uri?: unknown
  title?: unknown
  subtitle?: unknown
  isPlayable?: unknown
  playabilityReason?: unknown
  entityType?: unknown
}

/**
 * Tracks from an embed HTML document, in playlist order.
 * Skips local files, anything that is not a Spotify track, duplicates, and
 * rows the embed marks unplayable (`isPlayable: false`), which includes
 * country-restricted tracks for the country Spotify assigned this request.
 */
export function tracksFromEmbedHtml(html: string, expectedPlaylistId?: string): ParsedPlaylist {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  )
  if (!match) {
    throw new Error('Spotify embed page has no __NEXT_DATA__ payload')
  }

  let payload: unknown
  try {
    payload = JSON.parse(match[1])
  } catch {
    throw new Error('Spotify embed __NEXT_DATA__ payload is not valid JSON')
  }

  const entity = readEntity(payload)
  if (entity.type !== 'playlist') {
    throw new Error('Spotify embed payload is not a playlist')
  }
  const playlistId = readString(entity.id)
  if (!TRACK_ID.test(playlistId)) {
    throw new Error('Spotify embed playlist id is missing')
  }
  if (expectedPlaylistId && playlistId !== expectedPlaylistId) {
    throw new Error(
      `Embed playlist id ${playlistId} does not match ${expectedPlaylistId}`
    )
  }
  if (!Array.isArray(entity.trackList)) {
    throw new Error('Spotify embed payload has no trackList')
  }

  const renderedRows = new Set<number>()
  const rowPattern = /data-testid="tracklist-row-(\d+)"/g
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    renderedRows.add(Number(rowMatch[1]))
  }
  if (renderedRows.size !== entity.trackList.length) {
    throw new Error(
      `Embed rendered ${renderedRows.size} track rows but trackList has ${entity.trackList.length}. Refusing to accept a partial snapshot.`
    )
  }

  const tracks: PlaylistTrackRecord[] = []
  const skipped: SkippedTrack[] = []
  const seen = new Set<string>()

  for (const item of entity.trackList as EmbedTrack[]) {
    const uri = readString(item?.uri)
    const name = normalizeSpace(readString(item?.title))
    const artist = normalizeSpace(readString(item?.subtitle))
    const reason = readString(item?.playabilityReason)

    if (uri.startsWith('spotify:local:') || item?.entityType === 'local') {
      skipped.push({ id: null, name, artist, reason: 'local' })
      continue
    }
    if (!uri.startsWith('spotify:track:')) {
      skipped.push({ id: null, name, artist, reason: uri ? 'not-a-track' : 'missing-uri' })
      continue
    }
    const id = uri.slice('spotify:track:'.length)
    if (!TRACK_ID.test(id)) {
      skipped.push({ id: null, name, artist, reason: 'invalid-id' })
      continue
    }
    if (typeof item?.isPlayable !== 'boolean') {
      throw new Error(`Embed track ${id} is missing isPlayable`)
    }
    if (!item.isPlayable) {
      skipped.push({ id, name, artist, reason: reason || 'unplayable' })
      continue
    }
    if (!name) {
      skipped.push({ id, name, artist, reason: 'missing-name' })
      continue
    }
    if (seen.has(id)) {
      skipped.push({ id, name, artist, reason: 'duplicate' })
      continue
    }
    seen.add(id)
    tracks.push({ id, name, artist })
  }

  return {
    playlistId,
    playlistName: normalizeSpace(readString(entity.name)) || playlistId,
    tracks,
    skipped,
  }
}

function readEntity(payload: unknown): {
  type?: unknown
  id?: unknown
  name?: unknown
  trackList?: unknown
} {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Spotify embed payload is empty')
  }
  const props = (payload as { props?: unknown }).props
  const pageProps =
    props && typeof props === 'object'
      ? (props as { pageProps?: unknown }).pageProps
      : undefined
  const state =
    pageProps && typeof pageProps === 'object'
      ? (pageProps as { state?: unknown }).state
      : undefined
  const data =
    state && typeof state === 'object' ? (state as { data?: unknown }).data : undefined
  const entity =
    data && typeof data === 'object' ? (data as { entity?: unknown }).entity : undefined
  if (!entity || typeof entity !== 'object') {
    throw new Error('Spotify embed payload has no playlist entity')
  }
  return entity as {
    type?: unknown
    id?: unknown
    name?: unknown
    trackList?: unknown
  }
}

export function diffPlaylistTracks(
  previous: PlaylistTrackRecord[],
  next: PlaylistTrackRecord[]
): PlaylistDiff {
  const nextIds = new Set(next.map((track) => track.id))
  const previousById = new Map(previous.map((track) => [track.id, track]))
  return {
    added: next.filter((track) => !previousById.has(track.id)),
    removed: previous.filter((track) => !nextIds.has(track.id)),
    changed: next.flatMap((track) => {
      const before = previousById.get(track.id)
      if (!before || (before.name === track.name && before.artist === track.artist)) return []
      return [{ before, after: track }]
    }),
  }
}

/** One track per line, matching the existing data/playlist-tracks.json layout. */
export function formatPlaylistTracks(tracks: PlaylistTrackRecord[]): string {
  const lines = tracks.map(
    (track) =>
      `  { "id": ${JSON.stringify(track.id)}, "name": ${JSON.stringify(track.name)}, "artist": ${JSON.stringify(track.artist)} }`
  )
  return `[\n${lines.join(',\n')}\n]\n`
}

export function formatRefreshReport(input: {
  playlistName: string
  playlistId: string
  previousCount: number
  tracks: PlaylistTrackRecord[]
  diff: PlaylistDiff
  skipped: SkippedTrack[]
}): string {
  const skippedById = new Map(
    input.skipped.filter((track) => track.id).map((track) => [track.id, track.reason])
  )
  const lines = [
    `Playlist: ${input.playlistName} (${input.playlistId})`,
    'File: data/playlist-tracks.json',
    `Previous: ${input.previousCount}`,
    `Current: ${input.tracks.length}`,
    `Added: ${input.diff.added.length}`,
    `Removed: ${input.diff.removed.length}`,
    '',
  ]

  lines.push('Removed:')
  if (input.diff.removed.length === 0) {
    lines.push('- (none)')
  } else {
    for (const track of input.diff.removed) {
      const reason = skippedById.get(track.id)
      const note = reason
        ? ` (still on the playlist; embed skipped it as ${reason})`
        : ''
      lines.push(`- ${track.name} — ${track.artist}${note}`)
    }
  }

  const skippedOnly = input.skipped.filter((track) => !track.id || !input.diff.removed.some((removed) => removed.id === track.id))
  if (skippedOnly.length > 0) {
    lines.push('', 'Skipped:')
    for (const track of skippedOnly) {
      const label = track.name || track.id || 'unknown'
      const artist = track.artist ? ` — ${track.artist}` : ''
      lines.push(`- ${label}${artist} (${track.reason})`)
    }
  }

  lines.push('', 'Added:')
  if (input.diff.added.length === 0) {
    lines.push('- (none)')
  } else {
    for (const track of input.diff.added) {
      lines.push(`- ${track.name} — ${track.artist}`)
    }
  }

  if (input.diff.changed.length > 0) {
    lines.push('', 'Renamed:')
    for (const change of input.diff.changed) {
      lines.push(
        `- ${change.before.name} — ${change.before.artist} → ${change.after.name} — ${change.after.artist}`
      )
    }
  }

  return `${lines.join('\n')}\n`
}

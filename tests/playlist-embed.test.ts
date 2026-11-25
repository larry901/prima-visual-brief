import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_PLAYLIST_ID,
  diffPlaylistTracks,
  formatPlaylistTracks,
  formatRefreshReport,
  parsePlaylistRef,
  tracksFromEmbedHtml,
  type PlaylistTrackRecord,
} from '../lib/playlist-embed'

const PLAYLIST_ID = DEFAULT_PLAYLIST_ID

function embedHtml(
  tracks: Array<Record<string, unknown>>,
  options: { rows?: number; id?: string } = {}
): string {
  const payload = {
    props: {
      pageProps: {
        state: {
          data: {
            entity: {
              type: 'playlist',
              name: 'Prima Visual',
              id: options.id ?? PLAYLIST_ID,
              trackList: tracks,
            },
          },
        },
      },
    },
  }
  const rowCount = options.rows ?? tracks.length
  const rows = Array.from({ length: rowCount }, (_, index) => `data-testid="tracklist-row-${index}"`).join(
    '\n'
  )
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>${rows}</html>`
}

function track(partial: Record<string, unknown>) {
  return {
    uri: 'spotify:track:4oRSRY1YcdA8Hy1NYy89Sl',
    title: 'Old Friend',
    subtitle: 'Bjarne Hendrik',
    isPlayable: true,
    playabilityReason: 'PLAYABLE',
    entityType: 'track',
    ...partial,
  }
}

describe('playlist embed snapshot', () => {
  it('parses a playlist id or a public playlist URL', () => {
    assert.equal(parsePlaylistRef(undefined), PLAYLIST_ID)
    assert.equal(parsePlaylistRef(PLAYLIST_ID), PLAYLIST_ID)
    assert.equal(
      parsePlaylistRef(`https://open.spotify.com/playlist/${PLAYLIST_ID}?si=abc`),
      PLAYLIST_ID
    )
    assert.equal(parsePlaylistRef(`spotify:playlist:${PLAYLIST_ID}`), PLAYLIST_ID)
    assert.throws(() => parsePlaylistRef('not-a-playlist'), /Expected a Spotify playlist id/)
  })

  it('keeps playlist order, dedupes, and skips local, non-tracks, and unplayable rows', () => {
    const parsed = tracksFromEmbedHtml(
      embedHtml([
        track({ subtitle: 'MÒZÂMBÎQÚE,\u00a0coldbrew', title: 'Private Island' }),
        track({
          uri: 'spotify:track:4oRSRY1YcdA8Hy1NYy89Sl',
          title: 'Private Island',
          subtitle: 'duplicate',
        }),
        track({
          uri: 'spotify:local:Artist:Album:Title:120',
          title: 'Desk recording',
          subtitle: 'Larry',
          entityType: 'local',
          isPlayable: false,
          playabilityReason: 'UNAVAILABLE',
        }),
        track({
          uri: 'spotify:episode:5gv1jGW2hLIANsHVQppB8K',
          title: 'A podcast',
          subtitle: 'Show',
          entityType: 'episode',
        }),
        track({
          uri: 'spotify:track:0rET1UtxN9tiQsCTUp4dnV',
          title: 'Back To You',
          subtitle: 'Altro',
          isPlayable: false,
          playabilityReason: 'COUNTRY_RESTRICTED',
        }),
        track({
          uri: 'spotify:track:5gv1jGW2hLIANsHVQppB8K',
          title: 'Terra',
          subtitle: 'PALASTIC',
        }),
      ])
    )

    assert.deepEqual(parsed.tracks, [
      { id: '4oRSRY1YcdA8Hy1NYy89Sl', name: 'Private Island', artist: 'MÒZÂMBÎQÚE, coldbrew' },
      { id: '5gv1jGW2hLIANsHVQppB8K', name: 'Terra', artist: 'PALASTIC' },
    ])
    assert.deepEqual(
      parsed.skipped.map((item) => item.reason),
      ['duplicate', 'local', 'not-a-track', 'COUNTRY_RESTRICTED']
    )
  })

  it('refuses a trackList that does not match the rendered rows', () => {
    assert.throws(
      () => tracksFromEmbedHtml(embedHtml([track({})], { rows: 0 })),
      /partial snapshot/
    )
  })

  it('formats the checked-in one-line track layout', () => {
    const tracks: PlaylistTrackRecord[] = [
      { id: '4oRSRY1YcdA8Hy1NYy89Sl', name: "Don't Let Me Go", artist: 'Lane 8, Arctic Lake' },
    ]
    assert.equal(
      formatPlaylistTracks(tracks),
      '[\n  { "id": "4oRSRY1YcdA8Hy1NYy89Sl", "name": "Don\'t Let Me Go", "artist": "Lane 8, Arctic Lake" }\n]\n'
    )
  })

  it('reports additions against the previous file and why a skipped track disappeared', () => {
    const previous = [
      { id: '4oRSRY1YcdA8Hy1NYy89Sl', name: 'Old Friend', artist: 'Bjarne Hendrik' },
      { id: '0rET1UtxN9tiQsCTUp4dnV', name: 'Back To You', artist: 'Altro' },
    ]
    const next = [
      { id: '4oRSRY1YcdA8Hy1NYy89Sl', name: 'Old Friend', artist: 'Bjarne Hendrik' },
      { id: '5gv1jGW2hLIANsHVQppB8K', name: 'Terra', artist: 'PALASTIC' },
    ]
    const diff = diffPlaylistTracks(previous, next)
    const report = formatRefreshReport({
      playlistName: 'Prima Visual',
      playlistId: PLAYLIST_ID,
      previousCount: previous.length,
      tracks: next,
      diff,
      skipped: [
        {
          id: '0rET1UtxN9tiQsCTUp4dnV',
          name: 'Back To You',
          artist: 'Altro',
          reason: 'COUNTRY_RESTRICTED',
        },
      ],
    })
    assert.match(report, /Added: 1/)
    assert.match(report, /Removed: 1/)
    assert.match(report, /Back To You — Altro \(still on the playlist; embed skipped it as COUNTRY_RESTRICTED\)/)
    assert.match(report, /Terra — PALASTIC/)
  })

  it('checked-in tracks are unique Spotify ids', () => {
    const tracks = JSON.parse(
      readFileSync(new URL('../data/playlist-tracks.json', import.meta.url), 'utf8')
    ) as PlaylistTrackRecord[]
    assert.ok(tracks.length >= 30)
    const ids = tracks.map((item) => item.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const item of tracks) {
      assert.match(item.id, /^[A-Za-z0-9]{22}$/)
      assert.ok(item.name.length > 0)
      assert.equal(typeof item.artist, 'string')
    }
  })
})

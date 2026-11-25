// Rebuild data/playlist-tracks.json from the public Spotify embed page.
//
//   npm run refresh:playlist
//   npm run refresh:playlist -- 6tk5vOlKor3dioJJPXAhBj
//   npm run refresh:playlist -- https://open.spotify.com/playlist/6tk5vOlKor3dioJJPXAhBj
//
// Why the embed page, and not the Web API, is documented in lib/spotify.ts.
// Playability is whatever country Spotify assigns this machine. The previous
// sync used market=US; run this from the US so country-restricted tracks match
// what the brief form's embeds can play.

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatPlaylistTracks,
  formatRefreshReport,
  parsePlaylistRef,
  tracksFromEmbedHtml,
  diffPlaylistTracks,
  type PlaylistTrackRecord,
} from '../lib/playlist-embed'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT_PATH = join(ROOT, 'data', 'playlist-tracks.json')

function playlistArg(argv: string[]): string {
  const args = argv.filter((arg) => arg !== '--')
  const flag = args.indexOf('--playlist')
  if (flag !== -1) {
    const value = args[flag + 1]
    if (!value || value.startsWith('--')) throw new Error('Missing value for --playlist')
    return parsePlaylistRef(value)
  }
  const positional = args.filter((arg) => !arg.startsWith('--'))
  if (positional.length > 1) throw new Error('Pass a single playlist id or URL')
  return parsePlaylistRef(positional[0])
}

function readExisting(path: string): PlaylistTrackRecord[] {
  const data = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!Array.isArray(data)) throw new Error(`${path} is not a track array`)
  return data.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${path} entry ${index} is not an object`)
    }
    const track = entry as Partial<PlaylistTrackRecord>
    if (
      typeof track.id !== 'string' ||
      typeof track.name !== 'string' ||
      typeof track.artist !== 'string'
    ) {
      throw new Error(`${path} entry ${index} is missing id, name, or artist`)
    }
    return { id: track.id, name: track.name, artist: track.artist }
  })
}

async function fetchEmbed(playlistId: string): Promise<string> {
  const url = `https://open.spotify.com/embed/playlist/${playlistId}`
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (compatible; PrimaVisualPlaylistRefresh/1.0; +https://github.com/larry901/prima-visual-brief)',
    },
    redirect: 'follow',
  })
  if (!response.ok) {
    throw new Error(`Spotify embed request failed: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

async function main() {
  const playlistId = playlistArg(process.argv.slice(2))
  const html = await fetchEmbed(playlistId)
  const parsed = tracksFromEmbedHtml(html, playlistId)
  if (parsed.tracks.length === 0) {
    throw new Error('No playable tracks in the embed. Existing file was not changed.')
  }

  const previous = readExisting(OUT_PATH)
  const diff = diffPlaylistTracks(previous, parsed.tracks)
  const nextText = formatPlaylistTracks(parsed.tracks)
  const previousText = readFileSync(OUT_PATH, 'utf8')
  if (nextText !== previousText) {
    const temporary = `${OUT_PATH}.tmp`
    writeFileSync(temporary, nextText)
    renameSync(temporary, OUT_PATH)
  }

  process.stdout.write(
    formatRefreshReport({
      playlistName: parsed.playlistName,
      playlistId: parsed.playlistId,
      previousCount: previous.length,
      tracks: parsed.tracks,
      diff,
      skipped: parsed.skipped,
    })
  )
}

const invokedPath = process.argv[1] ? join(process.cwd(), process.argv[1]) : ''
const modulePath = fileURLToPath(import.meta.url)
if (invokedPath === modulePath || process.argv[1]?.endsWith('refresh-playlist.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

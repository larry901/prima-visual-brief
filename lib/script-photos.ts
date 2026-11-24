/** Reference photos attached to one video section's script. */

export const SCRIPT_PHOTO_LIMIT = 8
export const SCRIPT_PHOTO_MAX_BYTES = 8 * 1024 * 1024
export const SCRIPT_PHOTO_MAX_EDGE = 2560
export const SCRIPT_PHOTO_PREFIX = 'briefs/script-references/'

export const SCRIPT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type ScriptPhotoType = (typeof SCRIPT_PHOTO_TYPES)[number]

const TYPE_SET = new Set<string>(SCRIPT_PHOTO_TYPES)

export interface ScriptPhoto {
  url: string
  pathname: string
  name: string
  contentType: ScriptPhotoType
}

const BLOB_HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/
const STORED_PATH = /^briefs\/script-references\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(jpg|jpeg|png|webp|gif)$/
const UPLOAD_PATH = /^briefs\/script-references\/[a-z0-9][a-z0-9._-]{0,60}\.(jpg|jpeg|png|webp|gif)$/

export function isScriptPhotoUploadPath(pathname: string): boolean {
  return UPLOAD_PATH.test(pathname)
}

export function scriptPhotoUploadPath(filename: string, contentType: string): string {
  const ext =
    contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : contentType === 'image/gif' ? 'gif' : 'jpg'
  const base = filename
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${SCRIPT_PHOTO_PREFIX}${base || 'photo'}.${ext}`
}

export function sniffImageType(bytes: Uint8Array): ScriptPhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

/** Major brand inside an ISO BMFF `ftyp` box. Enough to recognize an iPhone HEIC. */
export function looksLikeHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7])
  if (box !== 'ftyp') return false
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
  return ['heic', 'heix', 'hevc', 'heif', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)
}

export function fittedSize(width: number, height: number, maxEdge = SCRIPT_PHOTO_MAX_EDGE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const edge = Math.max(width, height)
  if (edge <= maxEdge) return { width: Math.round(width), height: Math.round(height) }
  const scale = maxEdge / edge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function cleanPhotoName(value: string): string {
  const cleaned = value.replace(/[\r\n\t]+/g, ' ').replace(/[^\w .()'-]+/g, '').trim().slice(0, 80)
  return cleaned || 'Photo'
}

export function parseBlobScriptPhotoUrl(value: string): { url: string; pathname: string } | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) return null
  if (!BLOB_HOST.test(url.hostname)) return null
  let pathname = url.pathname.replace(/^\/+/, '')
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (!STORED_PATH.test(pathname)) return null
  return { url: `${url.origin}/${pathname}`, pathname }
}

function contentTypeFor(value: unknown, pathname: string): ScriptPhotoType {
  if (typeof value === 'string' && TYPE_SET.has(value)) return value as ScriptPhotoType
  if (pathname.endsWith('.png')) return 'image/png'
  if (pathname.endsWith('.webp')) return 'image/webp'
  if (pathname.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

function samePhotos(input: unknown, photos: ScriptPhoto[]): boolean {
  if (!Array.isArray(input) || input.length !== photos.length) return false
  return input.every((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const keys = Object.keys(item as object).sort()
    if (keys.join(',') !== 'contentType,name,pathname,url') return false
    const record = item as Record<string, unknown>
    const photo = photos[index]
    return (
      record.url === photo.url &&
      record.pathname === photo.pathname &&
      record.name === photo.name &&
      record.contentType === photo.contentType
    )
  })
}

export function sanitizeScriptPhotos(input: unknown): ScriptPhoto[] {
  if (!Array.isArray(input)) return []
  const photos: ScriptPhoto[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.url !== 'string') continue
    const parsed = parseBlobScriptPhotoUrl(record.url)
    if (!parsed || seen.has(parsed.url)) continue
    seen.add(parsed.url)
    photos.push({
      url: parsed.url,
      pathname: parsed.pathname,
      name: cleanPhotoName(typeof record.name === 'string' ? record.name : 'Photo'),
      contentType: contentTypeFor(record.contentType, parsed.pathname),
    })
    if (photos.length >= SCRIPT_PHOTO_LIMIT) break
  }
  return photos
}

export function scriptPhotosFromDetail(detail: unknown): ScriptPhoto[] {
  if (!detail || typeof detail !== 'object') return []
  return sanitizeScriptPhotos((detail as { scriptPhotos?: unknown }).scriptPhotos)
}

/**
 * Keep every existing video-section field. Photos are optional.
 * A brief saved before photos existed round-trips without a new key.
 */
export function sanitizeVideoDetails(input: unknown): Record<string, Record<string, unknown>> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Record<string, Record<string, unknown>> = {}
  for (const [type, detail] of Object.entries(input as Record<string, unknown>)) {
    if (!type || type === '__proto__' || type === 'constructor' || type === 'prototype') continue
    if (type.length > 200) continue
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) continue
    const copy: Record<string, unknown> = { ...(detail as Record<string, unknown>) }
    const photos = sanitizeScriptPhotos(copy.scriptPhotos)
    if (photos.length === 0) {
      if ('scriptPhotos' in copy) delete copy.scriptPhotos
    } else if (!samePhotos(copy.scriptPhotos, photos)) {
      copy.scriptPhotos = photos
    }
    out[type] = copy
  }
  return out
}

function detailsObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return detailsObject(JSON.parse(value) as unknown)
    } catch {
      return {}
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function scriptPhotoUrlsFromDetails(value: unknown): string[] {
  const details = detailsObject(value)
  const urls: string[] = []
  for (const detail of Object.values(details)) {
    for (const photo of scriptPhotosFromDetail(detail)) urls.push(photo.url)
  }
  return urls
}

/** Blob URLs that were on the brief and are not in the sanitized replacement. */
export function droppedScriptPhotoUrls(before: unknown, after: unknown): string[] {
  const kept = new Set(scriptPhotoUrlsFromDetails(sanitizeVideoDetails(detailsObject(after))))
  return scriptPhotoUrlsFromDetails(before).filter((url) => !kept.has(url))
}

export function scriptPhotosForApi(videoDetailsJson: string): Record<string, { url: string; name: string }[]> {
  const clean = sanitizeVideoDetails(detailsObject(videoDetailsJson))
  const out: Record<string, { url: string; name: string }[]> = {}
  for (const [type, detail] of Object.entries(clean)) {
    const photos = scriptPhotosFromDetail(detail)
    if (photos.length > 0) out[type] = photos.map((photo) => ({ url: photo.url, name: photo.name }))
  }
  return out
}

export function markdownAlt(name: string): string {
  const cleaned = name.replace(/[\[\]\r\n]/g, ' ').trim()
  return cleaned || 'Reference photo'
}

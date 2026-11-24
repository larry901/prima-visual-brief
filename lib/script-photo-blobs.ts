import { del } from '@vercel/blob'
import { parseBlobScriptPhotoUrl } from './script-photos'

/** Remove Blob objects that a saved brief no longer references. Invalid URLs are ignored. */
export async function deleteUnreferencedScriptPhotos(urls: string[]): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token || urls.length === 0) return
  const safe = urls.filter((url) => parseBlobScriptPhotoUrl(url))
  if (safe.length === 0) return
  try {
    await del(safe, { token })
  } catch (error) {
    console.error('Could not delete removed reference photos', error instanceof Error ? error.message : 'error')
  }
}

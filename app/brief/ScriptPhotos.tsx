'use client'

import { useEffect, useRef, useState } from 'react'
import ScriptPhotoGallery from '@/components/ScriptPhotoGallery'
import {
  SCRIPT_PHOTO_LIMIT,
  cleanPhotoName,
  parseBlobScriptPhotoUrl,
  scriptPhotoUploadPath,
  type ScriptPhoto,
} from '@/lib/script-photos'
import { prepareScriptPhoto } from './prepare-script-photo'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif'

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  return body && typeof body.error === 'string' ? body.error : fallback
}

async function ensureUploadGrant(): Promise<string | null> {
  const res = await fetch('/api/upload-grant', { method: 'POST' })
  if (res.ok) return null
  return readError(res, 'Photos can’t be uploaded right now.')
}

async function requestClientToken(pathname: string): Promise<{ token: string } | { error: string }> {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: { pathname, multipart: false, clientPayload: null },
    }),
  })
  if (!res.ok) return { error: await readError(res, 'That photo could not be uploaded.') }
  const body = (await res.json().catch(() => null)) as { clientToken?: unknown } | null
  if (!body || typeof body.clientToken !== 'string') return { error: 'That photo could not be uploaded.' }
  return { token: body.clientToken }
}

async function uploadPrepared(file: File, originalName: string): Promise<{ photo: ScriptPhoto } | { error: string }> {
  const contentType = file.type || 'image/jpeg'
  const pathname = scriptPhotoUploadPath(originalName, contentType)
  let issued = await requestClientToken(pathname)
  if ('error' in issued && issued.error.includes('Refresh the page')) {
    const grantError = await ensureUploadGrant()
    if (grantError) return { error: grantError }
    issued = await requestClientToken(pathname)
  }
  if ('error' in issued) return issued
  const { put } = await import('@vercel/blob/client')
  const blob = await put(pathname, file, {
    access: 'public',
    token: issued.token,
    contentType,
  })
  const parsed = parseBlobScriptPhotoUrl(blob.url)
  if (!parsed) return { error: 'That photo could not be uploaded.' }
  return {
    photo: {
      url: parsed.url,
      pathname: parsed.pathname,
      name: cleanPhotoName(originalName),
      contentType: contentType === 'image/png' || contentType === 'image/webp' || contentType === 'image/gif' ? contentType : 'image/jpeg',
    },
  }
}

export default function ScriptPhotos({
  photos,
  onChange,
  onUploadingChange,
}: {
  photos: ScriptPhoto[]
  onChange: (photos: ScriptPhoto[]) => void
  onUploadingChange?: (uploading: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef(photos)
  photosRef.current = photos
  const savedUrls = useRef(new Set(photos.map((photo) => photo.url)))
  const onUploadingRef = useRef(onUploadingChange)
  onUploadingRef.current = onUploadingChange
  const [uploading, setUploadingState] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => onUploadingRef.current?.(false), [])

  const setUploading = (next: boolean) => {
    setUploadingState(next)
    onUploadingRef.current?.(next)
  }

  const remove = (photo: ScriptPhoto) => {
    const next = photosRef.current.filter((item) => item.url !== photo.url)
    photosRef.current = next
    onChange(next)
    if (!savedUrls.current.has(photo.url)) {
      void (async () => {
        await fetch('/api/upload-grant', { method: 'POST' })
        await fetch('/api/upload', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: photo.url }),
        })
      })()
    }
  }

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const room = SCRIPT_PHOTO_LIMIT - photosRef.current.length
    if (room <= 0) {
      setError('This video already has 8 photos. Remove one to add another.')
      return
    }
    const selected = Array.from(list).slice(0, room)
    const skipped = list.length - selected.length
    setError(null)
    setUploading(true)
    const failures: string[] = []
    const ready: { file: File; name: string }[] = []
    try {
      for (const original of selected) {
        const prepared = await prepareScriptPhoto(original)
        if ('error' in prepared) failures.push(`${original.name}: ${prepared.error}`)
        else ready.push({ file: prepared.file, name: original.name })
      }
      if (ready.length > 0) {
        const grantError = await ensureUploadGrant()
        if (grantError) {
          failures.push(grantError)
        } else {
          for (let index = 0; index < ready.length; index += 1) {
            const item = ready[index]
            setStatus(`Uploading ${index + 1} of ${ready.length}…`)
            try {
              const uploaded = await uploadPrepared(item.file, item.name)
              if ('error' in uploaded) {
                failures.push(`${item.name}: ${uploaded.error}`)
                continue
              }
              const next = [...photosRef.current, uploaded.photo].slice(0, SCRIPT_PHOTO_LIMIT)
              photosRef.current = next
              onChange(next)
            } catch {
              failures.push(`${item.name}: That photo could not be uploaded.`)
            }
          }
        }
      }
    } finally {
      setUploading(false)
      setStatus(null)
      if (inputRef.current) inputRef.current.value = ''
    }
    if (skipped > 0) failures.push('Only 8 photos can be attached to this video. Extra files were skipped.')
    setError(failures.length > 0 ? failures.join(' ') : null)
  }

  const atLimit = photos.length >= SCRIPT_PHOTO_LIMIT

  return (
    <div className="mt-3 space-y-3">
      <div>
        <p className="text-sm font-medium text-brand-dark">Reference photos</p>
        <p className="text-xs text-brand-muted mt-1">
          Screenshots or camera-roll photos that belong with this script. Up to 8 images, 8 MB each. iPhone HEIC
          photos are converted when this browser can read them.
        </p>
      </div>
      <ScriptPhotoGallery photos={photos} onRemove={remove} hideLabel />
      <div>
        <button
          type="button"
          className="btn-secondary min-h-11 disabled:opacity-50"
          disabled={uploading || atLimit}
          onClick={() => inputRef.current?.click()}
        >
          {atLimit ? '8 photos added' : 'Add photos'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void addFiles(event.target.files)}
        />
      </div>
      {status ? (
        <p className="text-sm text-brand-muted" aria-live="polite">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

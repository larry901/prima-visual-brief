import {
  SCRIPT_PHOTO_MAX_BYTES,
  SCRIPT_PHOTO_MAX_EDGE,
  fittedSize,
  looksLikeHeic,
  sniffImageType,
  type ScriptPhotoType,
} from '@/lib/script-photos'

export const HEIC_UNSUPPORTED_MESSAGE =
  'This photo is HEIC, and this browser can’t convert it. On iPhone, open the photo, tap Share, then Save to Files as JPEG — or upload a screenshot instead.'

export const PHOTO_TYPE_MESSAGE = 'Use a JPEG, PNG, WebP, or GIF.'

export const PHOTO_SIZE_MESSAGE = 'That photo is over 8 MB. Use a screenshot or a smaller JPEG.'

function extension(contentType: ScriptPhotoType): string {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'image/gif') return 'gif'
  return 'jpg'
}

function fileName(name: string, contentType: ScriptPhotoType): string {
  const base = name.replace(/\.[^.]+$/, '').trim() || 'photo'
  return `${base}.${extension(contentType)}`
}

function isHeic(file: File, head: Uint8Array): boolean {
  const type = file.type.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif' || type === 'image/heic-sequence' || type === 'image/heif-sequence') {
    return true
  }
  if (/\.(heic|heif)$/i.test(file.name)) return true
  return looksLikeHeic(head)
}

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      }
    } catch {
      // Safari can still draw some HEIC files through an Image element.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('undecodable'))
      element.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function renderJpeg(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob | null> {
  const fitted = fittedSize(width, height, SCRIPT_PHOTO_MAX_EDGE)
  if (fitted.width < 1 || fitted.height < 1) return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  canvas.width = fitted.width
  canvas.height = fitted.height
  const context = canvas.getContext('2d')
  if (!context) return Promise.resolve(null)
  context.drawImage(source, 0, 0, fitted.width, fitted.height)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality))
}

async function recompress(file: File): Promise<File | null> {
  let decoded: Decoded
  try {
    decoded = await decode(file)
  } catch {
    return null
  }
  try {
    for (const quality of [0.86, 0.72, 0.6]) {
      const blob = await renderJpeg(decoded.source, decoded.width, decoded.height, quality)
      if (blob && blob.size > 0 && blob.size <= SCRIPT_PHOTO_MAX_BYTES) {
        return new File([blob], fileName(file.name, 'image/jpeg'), { type: 'image/jpeg' })
      }
    }
    return null
  } finally {
    decoded.close()
  }
}

/** Sniff the real image type. Convert HEIC, or shrink an oversized photo, when the browser can decode it. */
export async function prepareScriptPhoto(file: File): Promise<{ file: File } | { error: string }> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  const sniffed = sniffImageType(head)
  if (sniffed) {
    const typed = file.type === sniffed ? file : new File([file], fileName(file.name, sniffed), { type: sniffed })
    if (typed.size <= SCRIPT_PHOTO_MAX_BYTES) return { file: typed }
    const smaller = await recompress(typed)
    return smaller ? { file: smaller } : { error: PHOTO_SIZE_MESSAGE }
  }
  if (isHeic(file, head)) {
    const converted = await recompress(file)
    return converted ? { file: converted } : { error: HEIC_UNSUPPORTED_MESSAGE }
  }
  return { error: PHOTO_TYPE_MESSAGE }
}

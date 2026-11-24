import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { changedBriefFields } from '../lib/brief-logic'
import { referencePhotosHtml } from '../lib/email'
import { buildNotionMarkdown } from '../lib/notion-copy'
import {
  cleanPhotoName,
  droppedScriptPhotoUrls,
  fittedSize,
  looksLikeHeic,
  parseBlobScriptPhotoUrl,
  sanitizeScriptPhotos,
  sanitizeVideoDetails,
  scriptPhotoUploadPath,
  scriptPhotosForApi,
  sniffImageType,
} from '../lib/script-photos'

const photoUrl = 'https://abc123.public.blob.vercel-storage.com/briefs/script-references/kitchen-a1b2c3.jpg'
const photo = {
  url: photoUrl,
  pathname: 'briefs/script-references/kitchen-a1b2c3.jpg',
  name: 'Kitchen',
  contentType: 'image/jpeg' as const,
}

function numberedPhoto(index: number) {
  const pathname = `briefs/script-references/shot-${index}.jpg`
  return {
    url: `https://abc123.public.blob.vercel-storage.com/${pathname}`,
    pathname,
    name: `Shot ${index}`,
    contentType: 'image/jpeg' as const,
  }
}

describe('script photo urls', () => {
  it('keeps a public blob url and drops anything else', () => {
    assert.deepEqual(parseBlobScriptPhotoUrl(photoUrl), {
      url: photoUrl,
      pathname: 'briefs/script-references/kitchen-a1b2c3.jpg',
    })
    assert.equal(parseBlobScriptPhotoUrl('http://abc123.public.blob.vercel-storage.com/briefs/script-references/kitchen.jpg'), null)
    assert.equal(parseBlobScriptPhotoUrl('https://evil.example/briefs/script-references/kitchen.jpg'), null)
    assert.equal(parseBlobScriptPhotoUrl('https://abc123.public.blob.vercel-storage.com.evil.com/briefs/script-references/kitchen.jpg'), null)
    assert.equal(parseBlobScriptPhotoUrl(`${photoUrl}?download=1`), null)
    assert.equal(parseBlobScriptPhotoUrl('https://abc123.public.blob.vercel-storage.com/other/kitchen.jpg'), null)
    assert.equal(parseBlobScriptPhotoUrl('https://abc123.public.blob.vercel-storage.com/briefs/script-references/../secret.jpg'), null)
    assert.equal(parseBlobScriptPhotoUrl('javascript:alert(1)'), null)
  })

  it('builds a safe upload path', () => {
    assert.equal(scriptPhotoUploadPath('My Kitchen (dusk).HEIC', 'image/jpeg'), 'briefs/script-references/my-kitchen-dusk.jpg')
    assert.equal(scriptPhotoUploadPath('!!!', 'image/png'), 'briefs/script-references/photo.png')
    assert.equal(cleanPhotoName('  Line\n<one>  '), 'Line one')
  })
})

describe('script photo bytes', () => {
  it('recognizes jpeg, png, gif, webp, and heic', () => {
    assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg')
    assert.equal(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
    assert.equal(sniffImageType(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), 'image/gif')
    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    assert.equal(sniffImageType(webp), 'image/webp')
    assert.equal(sniffImageType(Uint8Array.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70])), null)
    const heic = new Uint8Array(12)
    heic.set([0x66, 0x74, 0x79, 0x70], 4)
    heic.set([0x68, 0x65, 0x69, 0x63], 8)
    assert.equal(looksLikeHeic(heic), true)
    assert.equal(looksLikeHeic(Uint8Array.from([0xff, 0xd8, 0xff])), false)
  })

  it('fits a phone photo inside the long edge', () => {
    assert.deepEqual(fittedSize(4032, 3024, 2560), { width: 2560, height: 1920 })
    assert.deepEqual(fittedSize(800, 600, 2560), { width: 800, height: 600 })
    assert.deepEqual(fittedSize(0, 10, 2560), { width: 0, height: 0 })
  })
})

describe('saving script photos on a brief', () => {
  it('leaves a brief without photos unchanged', () => {
    const before = { 'Listing Tour': { highlights: 'Oak floors', script: 'Slow pan' } }
    const sanitized = sanitizeVideoDetails(before)
    assert.equal(JSON.stringify(sanitized), JSON.stringify(before))
    assert.equal('scriptPhotos' in sanitized['Listing Tour'], false)
    assert.deepEqual(
      changedBriefFields({ video_details: JSON.stringify(before) }, { video_details: JSON.stringify(sanitized) }),
      [],
    )
    assert.deepEqual(scriptPhotosForApi(JSON.stringify(before)), {})
    assert.equal(referencePhotosHtml(before['Listing Tour']), '')
  })

  it('keeps eight blob photos and drops the rest', () => {
    const photos = Array.from({ length: 9 }, (_, index) => numberedPhoto(index + 1))
    photos.push(numberedPhoto(1))
    photos.push({ ...numberedPhoto(2), url: 'https://evil.example/a.jpg', name: '<script>' })
    const kept = sanitizeScriptPhotos(photos)
    assert.equal(kept.length, 8)
    assert.equal(kept[0].url, numberedPhoto(1).url)
    assert.equal(kept.some((item) => item.url.includes('evil.example')), false)

    const withPhotos = sanitizeVideoDetails({
      'Listing Tour': { script: 'Slow pan', scriptPhotos: [photo, { url: 'not a url', name: 'nope' }] },
    })
    assert.deepEqual(withPhotos['Listing Tour'].scriptPhotos, [photo])
    assert.deepEqual(changedBriefFields(
      { video_details: '{"Listing Tour":{"script":"Slow pan"}}' },
      { video_details: JSON.stringify(withPhotos) },
    ), ['Video details'])
  })

  it('names only blob urls that a later edit removed', () => {
    const before = { 'Listing Tour': { script: 'Slow pan', scriptPhotos: [photo, numberedPhoto(2)] } }
    const after = { 'Listing Tour': { script: 'Slow pan', scriptPhotos: [photo] } }
    assert.deepEqual(droppedScriptPhotoUrls(JSON.stringify(before), JSON.stringify(after)), [numberedPhoto(2).url])
    assert.deepEqual(droppedScriptPhotoUrls(JSON.stringify(before), JSON.stringify(before)), [])
    assert.deepEqual(droppedScriptPhotoUrls('{"Listing Tour":{"script":"Hi"}}', '{"Listing Tour":{"script":"Hi"}}'), [])
  })
})

describe('notion and email exposure', () => {
  const base = {
    agentName: 'Maya Chen',
    propertyAddress: '12 Oak St',
    shootDate: '2026-11-14T18:00:00.000Z',
    submittedAt: '2026-11-01T18:00:00.000Z',
    videoTypes: ['Listing Tour'],
    driveLink: null,
    assetNotes: null,
  }

  it('puts a public image in the video section copy and hides a non-blob url', () => {
    const withPhoto = buildNotionMarkdown({
      ...base,
      videoType: 'Listing Tour',
      videoDetails: { 'Listing Tour': { script: 'Slow pan', scriptPhotos: [photo] } },
    })
    assert.match(withPhoto, /!\[Kitchen\]\(https:\/\/abc123\.public\.blob\.vercel-storage\.com\/briefs\/script-references\/kitchen-a1b2c3\.jpg\)/)
    assert.match(withPhoto, /\*\*Vision:\*\*\nSlow pan/)

    const without = buildNotionMarkdown({
      ...base,
      videoDetails: { 'Listing Tour': { script: 'Slow pan' } },
    })
    assert.equal(without.includes('Reference photos'), false)
    assert.match(without, /Slow pan/)

    const hostile = buildNotionMarkdown({
      ...base,
      videoType: 'Listing Tour',
      videoDetails: {
        'Listing Tour': { script: 'Slow pan', scriptPhotos: [{ url: 'https://evil.example/x.jpg', name: 'x' }] },
      },
    })
    assert.equal(hostile.includes('evil.example'), false)
  })

  it('exposes the same url in the dashboard detail shape and escapes the email link', () => {
    const api = scriptPhotosForApi(JSON.stringify({ 'Listing Tour': { script: 'Slow pan', scriptPhotos: [photo] } }))
    assert.deepEqual(api, { 'Listing Tour': [{ url: photoUrl, name: 'Kitchen' }] })
    const html = referencePhotosHtml({
      scriptPhotos: [{ ...photo, name: 'Kitchen <dusk>' }],
    })
    assert.match(html, new RegExp(`href="${photoUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
    assert.match(html, /Kitchen dusk/)
    assert.equal(html.includes('<dusk>'), false)
    assert.equal(html.includes('<script'), false)
  })
})

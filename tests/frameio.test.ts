import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFrameioUrl } from '../lib/portal/clients'

describe('one Frame.io link', () => {
  it('keeps a single https URL', () => {
    assert.equal(readFrameioUrl('https://app.frame.io/reviews/demo'), 'https://app.frame.io/reviews/demo')
    assert.equal(readFrameioUrl('  '), null)
    assert.equal(readFrameioUrl('http://app.frame.io/reviews/demo'), null)
  })

  it('keeps the first URL from a legacy list of labeled links', () => {
    const legacy = JSON.stringify([
      { label: 'Listing film', url: 'https://app.frame.io/reviews/first' },
      { label: 'Brand reel', url: 'https://app.frame.io/reviews/second' },
    ])
    assert.equal(readFrameioUrl(legacy), 'https://app.frame.io/reviews/first')
    assert.equal(readFrameioUrl([]), null)
    assert.equal(readFrameioUrl('[]'), null)
  })
})

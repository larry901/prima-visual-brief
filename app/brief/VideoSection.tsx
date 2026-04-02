'use client'
import TagPicker from './TagPicker'
import InspirationLinks from './InspirationLinks'

const MUSIC_VIBES = [
  'Cinematic / Orchestral',
  'Modern Luxury',
  'Chill / Lo-fi',
  'Upbeat / Energetic',
  'Acoustic / Warm',
  'R&B / Soul',
  'No Music',
]

const TONE_OPTIONS = [
  'Professional / Polished',
  'Warm / Conversational',
  'Bold / Confident',
  'Luxurious / Aspirational',
]

export interface VideoDetailState {
  highlights: string
  avoid: string
  musicVibes: string[]
  referenceArtist: string
  inspirationLinks: string[]
  inspirationThoughts: string
  script: string
  toneOfVoice: string
}

interface VideoSectionProps {
  type: string
  detail: VideoDetailState
  onChange: (detail: VideoDetailState) => void
}

export default function VideoSection({ type, detail, onChange }: VideoSectionProps) {
  const update = (field: keyof VideoDetailState, value: string | string[]) => {
    onChange({ ...detail, [field]: value })
  }

  return (
    <div className="space-y-5 pt-2">
      <div>
        <label className="block text-sm font-medium mb-1.5">Important features to highlight</label>
        <textarea
          value={detail.highlights}
          onChange={(e) => update('highlights', e.target.value)}
          rows={3}
          placeholder="e.g. Open-concept kitchen, floor-to-ceiling windows, backyard pool..."
          className="input resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">What to avoid or downplay</label>
        <input
          type="text"
          value={detail.avoid}
          onChange={(e) => update('avoid', e.target.value)}
          placeholder="e.g. Neighbor's fence, small guest bathroom..."
          className="input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Music vibe</label>
        <TagPicker
          options={MUSIC_VIBES}
          selected={detail.musicVibes}
          onChange={(v) => update('musicVibes', v)}
          multi={true}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">Reference artist or song</label>
        <input
          type="text"
          value={detail.referenceArtist}
          onChange={(e) => update('referenceArtist', e.target.value)}
          placeholder="e.g. Hans Zimmer, Norah Jones, 'Put It All on Me' by Ed Sheeran..."
          className="input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">Inspiration links</label>
        <InspirationLinks
          links={detail.inspirationLinks}
          onChange={(v) => update('inspirationLinks', v)}
        />
      </div>
      {detail.inspirationLinks.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1.5">What do you love about these examples?</label>
          <textarea
            value={detail.inspirationThoughts}
            onChange={(e) => update('inspirationThoughts', e.target.value)}
            rows={2}
            placeholder="e.g. Love the pacing, the way it transitions between rooms..."
            className="input resize-none"
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium mb-1.5">Script / talking points</label>
        <textarea
          value={detail.script}
          onChange={(e) => update('script', e.target.value)}
          rows={4}
          placeholder="Optional: paste or write your script, bullet points, or key talking points for this video..."
          className="input resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Tone of voice</label>
        <TagPicker
          options={TONE_OPTIONS}
          selected={detail.toneOfVoice ? [detail.toneOfVoice] : []}
          onChange={(v) => update('toneOfVoice', v[0] || '')}
          multi={false}
        />
      </div>
    </div>
  )
}

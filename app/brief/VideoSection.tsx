'use client'
import InspirationLinks from './InspirationLinks'
import SuggestedSongs, { TrackRef } from './SuggestedSongs'

export interface VideoDetailState {
  highlights: string
  avoid: string
  selectedTracks: TrackRef[]
  referenceArtist: string
  inspirationLinks: string[]
  inspirationThoughts: string
  script: string
}

interface VideoSectionProps {
  type: string
  detail: VideoDetailState
  onChange: (detail: VideoDetailState) => void
}

export default function VideoSection({ type, detail, onChange }: VideoSectionProps) {
  const update = <K extends keyof VideoDetailState>(field: K, value: VideoDetailState[K]) => {
    onChange({ ...detail, [field]: value })
  }

  return (
    <div className="space-y-5 pt-2">
      {/* PRIMARY: Vision / Script — placed first, visually emphasized, required */}
      <div className="-mx-6 -mt-8 px-6 pt-6 pb-6 bg-brand-dark/[0.03] border-y-2 border-brand-dark/10">
        <div className="flex items-baseline justify-between mb-1.5">
          <label className="block text-base font-semibold text-brand-dark">
            Your vision for this video <span className="text-red-500">*</span>
          </label>
          <span className="text-[10px] uppercase tracking-widest font-semibold text-brand-dark/60">
            Most important
          </span>
        </div>
        <p className="text-xs text-brand-muted mb-3">
          The more detail you give us here, the closer the first cut will be to your vision &mdash;
          and the fewer revision rounds it&apos;ll take to get there.
        </p>
        <textarea
          required
          value={detail.script}
          onChange={(e) => update('script', e.target.value)}
          rows={9}
          placeholder={`Tell us everything you can picture for this video. For example:

• The story you want to tell — what should viewers feel or take away?
• Pacing — slow & cinematic, quick cuts, building energy?
• Specific shots, moments, or rooms that must be included
• A script, voiceover lines, or talking points if you have them
• Anything else that's in your head about how this should look or feel`}
          className="input resize-y text-sm leading-relaxed bg-white"
        />
      </div>

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

      {/* Reference songs — Spotify-backed picker */}
      <div>
        <label className="block text-sm font-medium mb-2">Reference songs</label>
        <SuggestedSongs
          selected={detail.selectedTracks}
          onChange={(v) => update('selectedTracks', v)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">Reference artist or song (not in the list above?)</label>
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
    </div>
  )
}

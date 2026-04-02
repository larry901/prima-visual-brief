'use client'
import { useState } from 'react'
import VideoSection, { VideoDetailState } from './VideoSection'

const VIDEO_TYPES = [
  'Listing Tour',
  'Agent Intro',
  'Neighborhood Tour',
  'Just Listed / Just Sold',
  'Custom',
]

const defaultVideoDetail = (): VideoDetailState => ({
  highlights: '',
  avoid: '',
  musicVibes: [],
  referenceArtist: '',
  inspirationLinks: [],
  inspirationThoughts: '',
  script: '',
  toneOfVoice: '',
})

export default function BriefForm() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Section 1
  const [agentName, setAgentName] = useState('')
  const [propertyAddress, setPropertyAddress] = useState('')
  const [shootDate, setShootDate] = useState('')

  // Section 2
  const [agentOnSite, setAgentOnSite] = useState('')
  const [gateCode, setGateCode] = useState('')
  const [lockboxCode, setLockboxCode] = useState('')
  const [accessNotes, setAccessNotes] = useState('')

  // Section 3
  const [selectedVideoTypes, setSelectedVideoTypes] = useState<string[]>([])
  const [videoDetails, setVideoDetails] = useState<Record<string, VideoDetailState>>({})

  // Section 4
  const [driveLink, setDriveLink] = useState('')
  const [assetNotes, setAssetNotes] = useState('')

  const toggleVideoType = (type: string) => {
    if (selectedVideoTypes.includes(type)) {
      setSelectedVideoTypes(selectedVideoTypes.filter((t) => t !== type))
    } else {
      setSelectedVideoTypes([...selectedVideoTypes, type])
      if (!videoDetails[type]) {
        setVideoDetails({ ...videoDetails, [type]: defaultVideoDetail() })
      }
    }
  }

  const updateVideoDetail = (type: string, detail: VideoDetailState) => {
    setVideoDetails({ ...videoDetails, [type]: detail })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/submit-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName,
          propertyAddress,
          shootDate,
          agentOnSite,
          gateCode,
          lockboxCode,
          accessNotes,
          videoTypes: selectedVideoTypes,
          videoDetails,
          driveLink,
          assetNotes,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Submission failed')
      }

      setSubmitted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-brand-dark rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-semibold mb-3">Brief submitted!</h1>
          <p className="text-brand-muted text-lg">We&apos;ll see you at the shoot.</p>
          <p className="text-brand-muted text-sm mt-4">
            A copy has been sent to clients@primavisual.io
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <header className="bg-white border-b border-brand-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="font-display text-xl font-semibold tracking-tight">Prima Visual</div>
          <div className="text-xs text-brand-muted">Complete 24 hrs before shoot</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 pb-20">
        {/* Page title */}
        <div className="mb-10">
          <h1 className="font-display text-4xl font-semibold mb-2">Pre-Shoot Creative Brief</h1>
          <p className="text-brand-muted">
            Help us bring your vision to life. Complete this form at least 24 hours before your shoot.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Shoot Info */}
          <section className="card p-6 space-y-4">
            <div className="section-label">01 — Shoot Info</div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Agent name <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="John Agent"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Property address <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
                placeholder="123 Main St, Beverly Hills, CA 90210"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Shoot date <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="date"
                value={shootDate}
                onChange={(e) => setShootDate(e.target.value)}
                className="input"
              />
            </div>
          </section>

          {/* Section 2: Access Info */}
          <section className="card p-6 space-y-4">
            <div className="section-label">02 — Access Info</div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Will the agent be on site? <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={agentOnSite}
                onChange={(e) => setAgentOnSite(e.target.value)}
                className="input"
              >
                <option value="">Select one&hellip;</option>
                <option value="Yes, I'll be there">Yes, I&apos;ll be there</option>
                <option value="No — lockbox access">No &mdash; lockbox access</option>
                <option value="Someone else will be there">Someone else will be there</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Gate code</label>
                <input
                  type="text"
                  value={gateCode}
                  onChange={(e) => setGateCode(e.target.value)}
                  placeholder="e.g. #1234"
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Lockbox / combo code</label>
                <input
                  type="text"
                  value={lockboxCode}
                  onChange={(e) => setLockboxCode(e.target.value)}
                  placeholder="e.g. 5678"
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Other access notes</label>
              <input
                type="text"
                value={accessNotes}
                onChange={(e) => setAccessNotes(e.target.value)}
                placeholder="e.g. Park on the street, ring doorbell..."
                className="input"
              />
            </div>
          </section>

          {/* Section 3: Videos */}
          <section className="space-y-4">
            <div className="card p-6">
              <div className="section-label">03 — Videos</div>
              <p className="text-sm text-brand-muted mb-4">Select all video types that apply to your shoot.</p>
              <div className="flex flex-wrap gap-2">
                {VIDEO_TYPES.map((type) => {
                  const active = selectedVideoTypes.includes(type)
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleVideoType(type)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                        active
                          ? 'bg-brand-dark text-white border-brand-dark'
                          : 'bg-gray-100 text-brand-dark border-transparent hover:border-brand-border'
                      }`}
                    >
                      {type}
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedVideoTypes.map((type) => (
              <div key={type} className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-brand-border bg-gray-50">
                  <h3 className="font-display text-lg font-medium">{type}</h3>
                </div>
                <div className="p-6">
                  <VideoSection
                    type={type}
                    detail={videoDetails[type] || defaultVideoDetail()}
                    onChange={(d) => updateVideoDetail(type, d)}
                  />
                </div>
              </div>
            ))}
          </section>

          {/* Section 4: Files & Assets */}
          <section className="card p-6 space-y-4">
            <div className="section-label">04 — Files & Assets</div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Dropbox / Google Drive link</label>
              <input
                type="url"
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="input"
              />
              <p className="text-xs text-brand-muted mt-1">For large files or folders</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Asset notes</label>
              <textarea
                value={assetNotes}
                onChange={(e) => setAssetNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Use the white logo version, Render #3 is the preferred kitchen angle..."
                className="input resize-none"
              />
              <p className="text-xs text-brand-muted mt-1">Anything we should know about these files?</p>
            </div>
          </section>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting\u2026' : 'Submit Creative Brief'}
          </button>
        </form>
      </div>
    </div>
  )
}

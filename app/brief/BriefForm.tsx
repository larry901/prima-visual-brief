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
  selectedTracks: [],
  referenceArtist: '',
  inspirationLinks: [],
  inspirationThoughts: '',
  script: '',
})

export default function BriefForm({
  initialAgentName = '',
  initialEmail = '',
  initialShootDate = '',
  prefill,
  edit,
  backHref,
}: {
  initialAgentName?: string
  initialEmail?: string
  initialShootDate?: string
  prefill?: {
    agentName?: string
    email?: string
    shootDate?: string
    propertyAddress?: string
    agentOnSite?: string
    gateCode?: string
    lockboxCode?: string
    accessNotes?: string
    videoTypes?: string[]
    videoDetails?: Record<string, VideoDetailState>
    driveLink?: string
    assetNotes?: string
  }
  edit?: { id: number; token?: string }
  backHref?: string
} = {}) {
  const [submitted, setSubmitted] = useState(false)
  const [editPath, setEditPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [agentName, setAgentName] = useState(prefill?.agentName ?? initialAgentName)
  const [propertyAddress, setPropertyAddress] = useState(prefill?.propertyAddress ?? '')
  const [shootDate, setShootDate] = useState(prefill?.shootDate ?? initialShootDate)
  const [agentOnSite, setAgentOnSite] = useState(prefill?.agentOnSite ?? '')
  const [gateCode, setGateCode] = useState(prefill?.gateCode ?? '')
  const [lockboxCode, setLockboxCode] = useState(prefill?.lockboxCode ?? '')
  const [accessNotes, setAccessNotes] = useState(prefill?.accessNotes ?? '')
  const [selectedVideoTypes, setSelectedVideoTypes] = useState<string[]>(prefill?.videoTypes ?? [])
  const [videoDetails, setVideoDetails] = useState<Record<string, VideoDetailState>>(prefill?.videoDetails ?? {})
  const [driveLink, setDriveLink] = useState(prefill?.driveLink ?? '')
  const [assetNotes, setAssetNotes] = useState(prefill?.assetNotes ?? '')
  const email = prefill?.email ?? initialEmail

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
    setError(null)

    if (selectedVideoTypes.length === 0) {
      setError('Please select at least one video type in Section 3 before submitting.')
      // Scroll the video types card into view so the user sees what's missing.
      document.getElementById('video-types-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setLoading(true)

    try {
      const res = await fetch(edit ? `/api/briefs/${edit.id}` : '/api/submit-brief', {
        method: edit ? 'PATCH' : 'POST',
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
          clientEmail: email,
          editToken: edit?.token,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Submission failed')
      }
      const data = await res.json()
      if (typeof data.editPath === 'string') setEditPath(data.editPath)
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
          <h1 className="font-display text-3xl font-semibold mb-3">{edit ? 'Brief updated' : 'Brief submitted!'}</h1>
          <p className="text-brand-muted text-lg">We&apos;ll see you at the shoot.</p>
          <p className="text-brand-muted text-sm mt-4">
            {edit ? 'Larry has been notified of your changes.' : 'A copy has been sent to clients@primavisual.io'}
          </p>
          {editPath && (
            <a href={editPath} className="inline-block mt-6 btn-primary">
              Edit this brief
            </a>
          )}
          {backHref && (
            <a href={backHref} className="block mt-4 text-sm text-brand-muted">
              Back to your portal
            </a>
          )}
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
          <div className="text-xs text-brand-muted">{edit ? 'Editing your brief' : 'Complete 24 hrs before shoot'}</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 pb-20">
        {/* Page title */}
        <div className="mb-10">
          {backHref && (
            <a href={backHref} className="text-sm text-brand-muted hover:text-brand-dark inline-block mb-4">
              &larr; Back
            </a>
          )}
          <h1 className="font-display text-4xl font-semibold mb-2">{edit ? 'Edit your brief' : 'Pre-Shoot Creative Brief'}</h1>
          <p className="text-brand-muted">
            {edit
              ? 'Updates save over this submission. You can edit until the shoot starts.'
              : 'Help us bring your vision to life. Complete this form at least 24 hours before your shoot.'}
          </p>
          {email && (
            <p className="text-sm text-brand-muted mt-3">
              Prefilled for {email}
              {shootDate ? ` · shoot ${shootDate}` : ''}.
            </p>
          )}
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
                placeholder="1426 Cortlandt St, Houston, TX 77008"
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
            <div id="video-types-card" className="card p-6 scroll-mt-24">
              <div className="section-label">
                03 — Videos <span className="text-red-500 normal-case">*</span>
              </div>
              <p className="text-sm text-brand-muted mb-4">
                Select all video types that apply to your shoot &mdash; at least one is required.
              </p>
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
            {loading ? 'Saving\u2026' : edit ? 'Save changes' : 'Submit Creative Brief'}
          </button>
        </form>
      </div>
    </div>
  )
}

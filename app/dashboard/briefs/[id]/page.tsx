import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { getBriefById, VideoDetail } from '@/lib/db'
import Link from 'next/link'
import Image from 'next/image'
import SpotifyTracks from '@/app/dashboard/SpotifyTracks'
import LogoutButton from '@/app/dashboard/LogoutButton'

function isAuthenticated() {
  const cookieStore = cookies()
  return cookieStore.get('prima_session')?.value === 'authenticated'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const MUSIC_LABEL: Record<string, string> = {
  'Cinematic / Orchestral': '🎼',
  'Modern Luxury': '✨',
  'Chill / Lo-fi': '🎧',
  'Upbeat / Energetic': '⚡',
  'Acoustic / Warm': '🎸',
  'R&B / Soul': '🎵',
  'No Music': '🔇',
}

function isImagePath(p: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(p)
}

export default async function BriefDetailPage({ params }: { params: { id: string } }) {
  if (!isAuthenticated()) redirect('/dashboard')

  const brief = await getBriefById(Number(params.id))
  if (!brief) notFound()

  const videoTypes: string[] = JSON.parse(brief.video_types || '[]')
  const videoDetails: Record<string, VideoDetail> = JSON.parse(brief.video_details || '{}')
  const filePaths: string[] = JSON.parse(brief.file_paths || '[]')

  return (
    <div className="min-h-screen bg-brand-bg">
      <header className="bg-white border-b border-brand-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="font-display text-xl font-semibold">Prima Visual</div>
          <LogoutButton />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 pb-20 space-y-8">
        <div>
          <Link
            href="/dashboard/briefs"
            className="text-sm text-brand-muted hover:text-brand-dark inline-flex items-center gap-1 mb-4"
          >
            &larr; Back to all briefs
          </Link>
          <h1 className="font-display text-3xl font-semibold">{brief.client_name}</h1>
          <p className="text-brand-muted mt-1">{brief.property_address}</p>
          <p className="text-xs text-brand-muted mt-1">
            Submitted {formatDate(brief.submitted_at)}
          </p>
        </div>

        {/* Shoot Info */}
        <section className="card p-6">
          <div className="section-label">Shoot Info</div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-brand-muted">Client</dt>
              <dd className="font-medium mt-0.5">{brief.client_name}</dd>
            </div>
            <div>
              <dt className="text-brand-muted">Agent</dt>
              <dd className="font-medium mt-0.5">{brief.agent_name}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-brand-muted">Property</dt>
              <dd className="font-medium mt-0.5">{brief.property_address}</dd>
            </div>
            <div>
              <dt className="text-brand-muted">Shoot Date</dt>
              <dd className="font-medium mt-0.5">{formatDate(brief.shoot_date)}</dd>
            </div>
          </dl>
        </section>

        {/* Access Info */}
        <section className="card p-6">
          <div className="section-label">Access Info</div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div className="col-span-2">
              <dt className="text-brand-muted">Agent on site?</dt>
              <dd className="font-medium mt-0.5">{brief.agent_on_site}</dd>
            </div>
            {brief.gate_code && (
              <div>
                <dt className="text-brand-muted">Gate Code</dt>
                <dd className="font-medium mt-0.5 font-mono">{brief.gate_code}</dd>
              </div>
            )}
            {brief.lockbox_code && (
              <div>
                <dt className="text-brand-muted">Lockbox Code</dt>
                <dd className="font-medium mt-0.5 font-mono">{brief.lockbox_code}</dd>
              </div>
            )}
            {brief.access_notes && (
              <div className="col-span-2">
                <dt className="text-brand-muted">Access Notes</dt>
                <dd className="font-medium mt-0.5">{brief.access_notes}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Video Sections */}
        {videoTypes.length > 0 && (
          <section className="space-y-6">
            <div className="section-label px-0">Video Sections</div>
            {videoTypes.map((type) => {
              const detail = videoDetails[type] || ({} as Partial<VideoDetail>)
              const hasMusic =
                detail.musicVibes &&
                detail.musicVibes.length > 0 &&
                !(detail.musicVibes.length === 1 && detail.musicVibes[0] === 'No Music')
              return (
                <div key={type} className="card overflow-hidden">
                  <div className="px-6 py-4 border-b border-brand-border bg-gray-50">
                    <h3 className="font-display text-lg font-medium">{type}</h3>
                  </div>
                  <div className="p-6 space-y-6">
                    <dl className="space-y-4 text-sm">
                      {detail.highlights && (
                        <div>
                          <dt className="text-brand-muted mb-1">Features to highlight</dt>
                          <dd className="font-medium whitespace-pre-wrap">{detail.highlights}</dd>
                        </div>
                      )}
                      {detail.avoid && (
                        <div>
                          <dt className="text-brand-muted mb-1">Avoid / downplay</dt>
                          <dd className="font-medium">{detail.avoid}</dd>
                        </div>
                      )}
                      {detail.musicVibes && detail.musicVibes.length > 0 && (
                        <div>
                          <dt className="text-brand-muted mb-2">Music vibe</dt>
                          <dd className="flex flex-wrap gap-1.5">
                            {detail.musicVibes.map((v) => (
                              <span
                                key={v}
                                className="bg-gray-100 text-brand-dark text-xs px-2.5 py-1 rounded-full"
                              >
                                {MUSIC_LABEL[v] || ''} {v}
                              </span>
                            ))}
                          </dd>
                        </div>
                      )}
                      {detail.referenceArtist && (
                        <div>
                          <dt className="text-brand-muted mb-1">Reference artist / song</dt>
                          <dd className="font-medium">{detail.referenceArtist}</dd>
                        </div>
                      )}
                      {detail.inspirationLinks && detail.inspirationLinks.length > 0 && (
                        <div>
                          <dt className="text-brand-muted mb-1">Inspiration links</dt>
                          <dd className="space-y-1">
                            {detail.inspirationLinks.map((link, i) => (
                              <a
                                key={i}
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-brand-dark underline text-sm truncate hover:text-brand-muted"
                              >
                                {link}
                              </a>
                            ))}
                          </dd>
                        </div>
                      )}
                      {detail.inspirationThoughts && (
                        <div>
                          <dt className="text-brand-muted mb-1">What they love about examples</dt>
                          <dd className="font-medium whitespace-pre-wrap">
                            {detail.inspirationThoughts}
                          </dd>
                        </div>
                      )}
                      {detail.script && (
                        <div>
                          <dt className="text-brand-muted mb-1">Script / talking points</dt>
                          <dd className="font-medium whitespace-pre-wrap bg-gray-50 rounded-lg p-3 text-sm">
                            {detail.script}
                          </dd>
                        </div>
                      )}
                      {detail.toneOfVoice && (
                        <div>
                          <dt className="text-brand-muted mb-1">Tone of voice</dt>
                          <dd>
                            <span className="bg-gray-100 text-brand-dark text-xs px-2.5 py-1 rounded-full">
                              {detail.toneOfVoice}
                            </span>
                          </dd>
                        </div>
                      )}
                    </dl>

                    {/* Spotify Suggestions */}
                    {hasMusic && (
                      <div className="pt-4 border-t border-brand-border">
                        <div className="text-sm font-medium mb-3">Suggested Tracks</div>
                        <SpotifyTracks vibes={detail.musicVibes || []} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {/* Files & Assets */}
        <section className="card p-6">
          <div className="section-label">Files & Assets</div>

          {filePaths.length > 0 ? (
            <div className="mb-4">
              <p className="text-sm font-medium mb-3">Uploaded Files</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filePaths.map((filePath, i) => {
                  if (isImagePath(filePath)) {
                    return (
                      <a
                        key={i}
                        href={filePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block rounded-lg overflow-hidden border border-brand-border hover:shadow-md transition-shadow"
                      >
                        {/* Use next/image for local images, fallback for external */}
                        {filePath.startsWith('/') ? (
                          <Image
                            src={filePath}
                            alt={`Upload ${i + 1}`}
                            width={300}
                            height={128}
                            className="w-full h-32 object-cover"
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={filePath}
                            alt={`Upload ${i + 1}`}
                            className="w-full h-32 object-cover"
                          />
                        )}
                      </a>
                    )
                  }
                  const filename = filePath.split('/').pop() || filePath
                  return (
                    <a
                      key={i}
                      href={filePath}
                      download
                      className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 text-sm hover:bg-gray-100 transition-colors border border-brand-border"
                    >
                      <span className="text-lg">&#128196;</span>
                      <span className="truncate text-xs">{filename}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-brand-muted mb-4">No files uploaded.</p>
          )}

          {brief.drive_link && (
            <div className="mb-4">
              <p className="text-sm font-medium mb-2">Drive Link</p>
              <a
                href={brief.drive_link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-2 text-sm"
              >
                Open in Drive &nearr;
              </a>
            </div>
          )}

          {brief.asset_notes && (
            <div>
              <p className="text-sm font-medium mb-1">Asset Notes</p>
              <p className="text-sm text-brand-muted whitespace-pre-wrap">{brief.asset_notes}</p>
            </div>
          )}

          {!filePaths.length && !brief.drive_link && !brief.asset_notes && (
            <p className="text-sm text-brand-muted">No assets provided.</p>
          )}
        </section>
      </div>
    </div>
  )
}

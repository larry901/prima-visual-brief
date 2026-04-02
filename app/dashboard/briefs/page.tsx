import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAllBriefs } from '@/lib/db'
import Link from 'next/link'
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

export default function BriefsListPage() {
  if (!isAuthenticated()) redirect('/dashboard')

  const briefs = getAllBriefs()

  return (
    <div className="min-h-screen bg-brand-bg">
      <header className="bg-white border-b border-brand-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="font-display text-xl font-semibold">Prima Visual &mdash; Briefs</div>
          <LogoutButton />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-3xl font-semibold">All Briefs</h1>
          <span className="text-brand-muted text-sm">
            {briefs.length} submission{briefs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {briefs.length === 0 ? (
          <div className="card p-12 text-center text-brand-muted">
            <p className="text-lg">No briefs submitted yet.</p>
            <p className="text-sm mt-2">Share the brief form link with clients to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {briefs.map((brief) => {
              const videoTypes: string[] = JSON.parse(brief.video_types || '[]')
              return (
                <Link
                  key={brief.id}
                  href={`/dashboard/briefs/${brief.id}`}
                  className="card p-5 flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-md transition-shadow group block"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div>
                        <p className="font-medium group-hover:text-brand-dark">
                          {brief.client_name}
                        </p>
                        <p className="text-sm text-brand-muted truncate">{brief.property_address}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm flex-shrink-0">
                    <div className="text-brand-muted">
                      Shoot:{' '}
                      <span className="text-brand-dark font-medium">
                        {formatDate(brief.shoot_date)}
                      </span>
                    </div>
                    {videoTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {videoTypes.map((type) => (
                          <span
                            key={type}
                            className="bg-gray-100 text-brand-dark text-xs px-2 py-0.5 rounded-full"
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-brand-muted text-xs">{formatDate(brief.submitted_at)}</div>
                    <div className="text-brand-dark text-lg">&rarr;</div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

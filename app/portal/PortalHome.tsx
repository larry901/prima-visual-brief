import Countdown from './Countdown'
import SignOutButton from './SignOutButton'
import type { PortalView } from '@/lib/portal/view'

export default function PortalHome({ view }: { view: PortalView }) {
  const firstName = view.name.split(/\s+/)[0] || view.name
  const needsBrief = view.upcoming.some((appointment) => appointment.needsBrief)

  return (
    <main className="portal-shell">
      <header className="portal-top">
        <p className="portal-wordmark">Prima Visual</p>
        <SignOutButton />
      </header>

      <div className="portal-layout">
        <section className="portal-column">
          <p className="portal-kicker">Client portal</p>
          <h1>{firstName}</h1>
          {view.company && <p className="portal-company">{view.company}</p>}

          {needsBrief && (
            <a className="portal-banner" href={view.nextShoot?.needsBrief ? view.nextShoot.briefHref : view.briefHref}>
              <span className="portal-kicker">Before the shoot</span>
              <strong>Fill out your creative brief</strong>
              <span>The crew needs it at least 24 hours ahead.</span>
            </a>
          )}

          {view.showPlan && (
            <>
              <div className="portal-stats">
                <article>
                  <p className="portal-kicker">Plan</p>
                  <p className="portal-stat">{view.planSize}</p>
                  <p className="portal-stat-label">shoots / month</p>
                </article>
                <article>
                  <p className="portal-kicker">This cycle</p>
                  <p className="portal-stat">{view.remaining}</p>
                  <p className="portal-stat-label">
                    {view.remaining === 1 ? 'shoot left' : 'shoots left'}
                    {view.used > 0 ? ` · ${view.used} booked` : ''}
                  </p>
                </article>
              </div>
              <p className="portal-renewal">
                Next renewal <strong>{view.renewalLabel}</strong>
                <span> Cycle opened {view.cycleStartLabel}. Unused shoots don&apos;t roll over.</span>
              </p>
            </>
          )}

          <section className="portal-block" aria-labelledby="next-shoot-heading">
            <h2 id="next-shoot-heading">Next shoot</h2>
            {view.nextShoot ? (
              <>
                <p className="portal-shoot-type">{view.nextShoot.type}</p>
                <p className="portal-shoot-when">{view.nextShoot.label}</p>
                <Countdown targetIso={view.nextShoot.startAt} />
                {view.nextShoot.needsBrief && (
                  <a className="portal-btn portal-btn-link" href={view.nextShoot.briefHref}>
                    Fill out your brief
                  </a>
                )}
              </>
            ) : (
              <div className="portal-empty">
                <p>Nothing on the calendar.</p>
                <p>When your next shoot is booked, the countdown shows up here.</p>
              </div>
            )}
          </section>

          {view.upcoming.length > 0 && (
            <section className="portal-block" aria-labelledby="upcoming-heading">
              <h2 id="upcoming-heading">Upcoming</h2>
              <ul className="portal-list">
                {view.upcoming.map((appointment) => (
                  <li key={appointment.id}>
                    <div>
                      <p className="portal-shoot-type">{appointment.type}</p>
                      <p>{appointment.label}</p>
                      {view.showPlan && !appointment.countsTowardPlan && (
                        <p className="portal-muted">Doesn&apos;t count toward the monthly shoots.</p>
                      )}
                    </div>
                    {appointment.needsBrief && (
                      <a href={appointment.briefHref}>Brief</a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="portal-block" aria-labelledby="videos-heading">
            <h2 id="videos-heading">Your videos</h2>
            {view.videos.length === 0 ? (
              <div className="portal-empty">
                <p>Films land here once they&apos;re delivered.</p>
              </div>
            ) : (
              <ul className="portal-videos">
                {view.videos.map((video) => (
                  <li key={video.url}>
                    <a href={video.url} target="_blank" rel="noopener noreferrer">
                      <span>{video.label}</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>

        <section className="portal-column" aria-labelledby="book-heading">
          <div className="portal-block portal-book">
            <h2 id="book-heading">Book a shoot</h2>
            {view.bookingUrl ? (
              <>
                <p className="portal-lede">
                  Your name and email are already filled in. Pick a time, then send the brief so production has it before the crew arrives.
                </p>
                <iframe
                  className="portal-frame"
                  src={view.bookingUrl}
                  title="Book a Prima Visual shoot"
                />
                <div className="portal-actions">
                  <a className="portal-text-link" href={view.bookingUrl} target="_blank" rel="noopener noreferrer">
                    Open the scheduler in a new tab
                  </a>
                  <a className="portal-btn" href={view.briefHref}>
                    Fill out your brief
                  </a>
                </div>
                <p className="portal-muted">
                  Booking and the brief are separate. After you choose a time, use the button above — it carries your name, email, and the next shoot date when one is already on the calendar.
                </p>
              </>
            ) : (
              <>
                <div className="portal-empty">
                  <p>Contact us to schedule</p>
                  <p>Your private booking link isn&apos;t on file yet. Email clients@primavisual.io and we&apos;ll set it up.</p>
                </div>
                <a className="portal-btn portal-btn-link" href={view.briefHref}>
                  Fill out your brief
                </a>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

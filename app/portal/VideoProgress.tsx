'use client'

import type { MouseEvent } from 'react'
import { CLIENT_STAGES, stageIndex, stageLinksToVideos, type VideoProgressItem } from '@/lib/portal/video-progress'

function scrollToVideos(event: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById('videos')
  if (!target) return
  event.preventDefault()
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function VideoProgress({ videos }: { videos: VideoProgressItem[] }) {
  return (
    <section className="portal-block" id="video-progress" aria-labelledby="video-progress-heading">
      <p className="portal-kicker">Your edits</p>
      <h2 id="video-progress-heading">Video progress</h2>
      {videos.length === 0 ? (
        <div className="portal-empty">
          <p>Nothing in progress right now.</p>
          <p>When a video is in the queue, its stage shows up here.</p>
        </div>
      ) : (
        <ul className="portal-progress-list">
          {videos.map((video, index) => {
            const current = stageIndex(video.stage)
            return (
              <li key={`${video.name}-${video.stage}-${video.shotLabel ?? 'undated'}-${index}`} className="portal-progress-card">
                <p className="portal-film-label">{video.name}</p>
                {video.shotLabel && <p className="portal-progress-meta">Shot {video.shotLabel}</p>}
                {video.expectedLabel && <p className="portal-progress-meta">Expected {video.expectedLabel}</p>}
                <ol className="portal-progress-track" aria-label={`${video.name} edit stage`}>
                  {CLIENT_STAGES.map((stage, step) => {
                    const state = step < current ? 'done' : step === current ? 'current' : 'upcoming'
                    return (
                      <li
                        key={stage}
                        className={`portal-progress-step is-${state}`}
                        aria-current={state === 'current' ? 'step' : undefined}
                      >
                        <span className="portal-progress-bar" />
                        <span className="portal-progress-label">{stage}</span>
                      </li>
                    )
                  })}
                </ol>
                {stageLinksToVideos(video.stage) && (
                  <p className="portal-progress-watch">
                    Watch this cut in <a href="#videos" onClick={scrollToVideos}>View your Videos</a>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

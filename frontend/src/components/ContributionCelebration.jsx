import { useState } from 'react'

import { copyShareText, openFacebookPost, sharePreviewUrl, shareWithNative } from '../lib/socialShare'

function buildShareText(celebration) {
  const site = 'chirinivatan.com'
  if (celebration.count && celebration.isMilestone) {
    return `I just reached a milestone on Chirin Ivatan — ${celebration.count} contributions submitted to the Ivatan Cultural Digital Archive! Every entry preserves the language and folklore of Batanes for future generations. Join us at ${site}`
  }
  return `I just contributed to the Chirin Ivatan archive — preserving Ivatan language and folklore for future generations. Join us at ${site}`
}

async function shareAchievement(platform, celebration, setShareStatus) {
  const text = buildShareText(celebration)
  const url = 'https://chirinivatan.com'

  if (platform === 'facebook') {
    const previewUrl = sharePreviewUrl({
      title: celebration.title || 'Chirin Ivatan',
      description: text,
      image: '/og-image.jpg',
      target: url,
    })
    openFacebookPost(previewUrl)
    await copyShareText({ text, url })
    setShareStatus(
      'Facebook opened a publishable post. The caption/link was copied if your browser allowed it.',
    )
    return
  }

  const shared = await shareWithNative({ title: celebration.title, text, url })
  if (shared) return

  const copied = await copyShareText({ text, url })
  setShareStatus(copied ? 'Share text copied.' : 'Unable to prepare sharing right now.')
  if (platform === 'instagram' && copied) {
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
  }
}

export default function ContributionCelebration({ celebration, onClose }) {
  const [shareStatus, setShareStatus] = useState('')
  if (!celebration) return null

  return (
    <div className="celebration-backdrop" role="presentation">
      <section
        className={celebration.isMilestone ? 'celebration-modal milestone' : 'celebration-modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        aria-describedby="celebration-message"
      >
        <div className="celebration-burst" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="profile-kicker">{celebration.eyebrow}</p>
        <h2 id="celebration-title">{celebration.title}</h2>
        <p id="celebration-message">{celebration.message}</p>
        <div className="celebration-stats" aria-label="Contribution celebration details">
          <span>{celebration.badge}</span>
          {celebration.count ? <span>{celebration.count} submitted</span> : null}
        </div>
        <div className="celebration-actions">
          {celebration.isMilestone && (
            <div
              className="share-action-row celebration-share-actions"
              aria-label="Achievement sharing options"
            >
              <button
                type="button"
                className="badge-share-icon-btn"
                title="Share on Facebook"
                onClick={() => shareAchievement('facebook', celebration, setShareStatus)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
                  <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
                </svg>
              </button>
              <button
                type="button"
                className="badge-share-icon-btn"
                title="Share on Instagram"
                onClick={() => shareAchievement('instagram', celebration, setShareStatus)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" aria-hidden="true">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </button>
              <button
                type="button"
                className="badge-share-icon-btn"
                title="Share"
                onClick={() => shareAchievement('native', celebration, setShareStatus)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>
            </div>
          )}
          {shareStatus && (
            <p className="celebration-share-status" role="status">
              {shareStatus}
            </p>
          )}
          <button onClick={onClose}>Continue</button>
        </div>
      </section>
    </div>
  )
}

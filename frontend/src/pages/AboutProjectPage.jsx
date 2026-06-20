import { useEffect, useState } from 'react'

import brandLogo from '../assets/brand/chirin-ivatan-logo.png'
import { apiRequest } from '../lib/api'
import { normalizeSiteContent, DEFAULT_SITE_CONTENT } from '../lib/siteContent'

function Paragraphs({ rows }) {
  if (!rows?.length) return null
  return rows.map((row, index) => <p key={`paragraph-${index}`}>{row}</p>)
}

function partnerInitials(name) {
  const words = String(name || 'Supporting Organization')
    .split(/\s+/)
    .filter(Boolean)
  return words.length > 1
    ? words
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase()
    : (words[0] || 'Supporting Organization').slice(0, 2).toUpperCase()
}

export default function AboutProjectPage() {
  const [content, setContent] = useState(DEFAULT_SITE_CONTENT)

  useEffect(() => {
    let ignore = false
    apiRequest('/api/site-content')
      .then((payload) => {
        if (!ignore) setContent(normalizeSiteContent(payload))
      })
      .catch(() => {
        if (!ignore) setContent(DEFAULT_SITE_CONTENT)
      })
    return () => {
      ignore = true
    }
  }, [])

  return (
    <section className="about-frame">
      <header className="about-hero">
        <h1>{content.about_heading || 'About the project'}</h1>
      </header>

      <section className="about-intro">
        <div className="about-intro-top">
          <div className="about-intro-illustration-wrap">
            <div className="about-intro-illustration">
              <img src={content.brand_logo_url || brandLogo} alt={`${content.brand_name} logo`} />
            </div>
          </div>
          <div className="about-intro-leads">
            {content.about_intro_paragraphs.map((row, index) => (
              <p key={`about-lead-${index}`} className="about-intro-lead">
                {row}
              </p>
            ))}
          </div>
        </div>
        <div className="about-intro-copy">
          <Paragraphs rows={content.about_body_paragraphs} />
        </div>
      </section>

      {content.about_rationale_paragraphs.length > 0 && (
        <section className="about-section">
          <h2>Rationale</h2>
          <Paragraphs rows={content.about_rationale_paragraphs} />
        </section>
      )}

      {content.about_future_paragraphs.length > 0 && (
        <section className="about-section">
          <h2>Future Directions</h2>
          <Paragraphs rows={content.about_future_paragraphs} />
        </section>
      )}

      {content.about_final_quote && (
        <section className="about-final">
          <p className="about-final-text">{content.about_final_quote}</p>
        </section>
      )}

      {content.partner_details.length > 0 && (
        <section className="about-section about-partner-section">
          <h2>Supporting Organizations</h2>
          <div className="partner-grid about-partner-grid">
            {content.partner_details.map((partner, index) => (
              <a
                key={`partner-${index}`}
                className="partner-logo about-partner-logo"
                href={partner.url || undefined}
                target={partner.url ? '_blank' : undefined}
                rel={partner.url ? 'noreferrer' : undefined}
              >
                {partner.logo_url ? (
                  <img className="partner-logo-image" src={partner.logo_url} alt="" />
                ) : (
                  <span className="partner-logo-mark" aria-hidden="true">
                    {partnerInitials(partner.name)}
                  </span>
                )}
                <span className="partner-agency-name">{partner.name || 'Supporting Organization'}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

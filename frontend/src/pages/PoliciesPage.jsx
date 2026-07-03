import { useEffect, useState } from 'react'

import { apiRequest } from '../lib/api'
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from '../lib/siteContent'

const POLICY_SECTIONS = [
  {
    id: 'terms',
    eyebrow: 'Account Use',
    title: 'Terms & Conditions',
    key: 'terms_conditions_paragraphs',
  },
  {
    id: 'privacy',
    eyebrow: 'Data Care',
    title: 'Privacy Policy',
    key: 'privacy_notice_paragraphs',
  },
  {
    id: 'stewardship',
    eyebrow: 'Community Roles',
    title: 'Contributor & Stewardship Policy',
    key: 'contributor_stewardship_policy_paragraphs',
  },
  {
    id: 'media',
    eyebrow: 'Uploads',
    title: 'Media Upload Policy',
    key: 'media_upload_policy_paragraphs',
  },
  {
    id: 'security',
    eyebrow: 'Protection',
    title: 'Information Security Policy',
    key: 'information_security_policy_paragraphs',
  },
]

export default function PoliciesPage() {
  const [siteContent, setSiteContent] = useState(DEFAULT_SITE_CONTENT)

  useEffect(() => {
    apiRequest('/api/site-content')
      .then((payload) => setSiteContent(normalizeSiteContent(payload)))
      .catch(() => setSiteContent(DEFAULT_SITE_CONTENT))
  }, [])

  return (
    <section className="policies-page">
      <div className="policies-shell">
        <div className="section-heading policies-heading">
          <div>
            <p className="profile-kicker">Governance</p>
            <h1>Policies & Consent</h1>
            <p className="muted">
              These policies explain how Chirin Ivatan protects accounts, media, and cultural contributions
              while inviting responsible community stewardship.
            </p>
          </div>
        </div>

        <nav className="policies-jump-list" aria-label="Policy sections">
          {POLICY_SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </nav>

        <div className="policies-stack">
          {POLICY_SECTIONS.map((section) => {
            const paragraphs = siteContent[section.key] || []
            return (
              <article className="policy-section-card" id={section.id} key={section.id}>
                <p className="profile-kicker">{section.eyebrow}</p>
                <h2>{section.title}</h2>
                <div className="policy-section-copy">
                  {paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

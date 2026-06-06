import { useEffect, useState } from 'react'

import { apiRequest } from '../lib/api'
import { ALL_FAQ_ROLES, DEFAULT_FAQ_SECTIONS, DICTIONARY_FIELD_GUIDES } from '../lib/faqContent'
import { normalizeSiteContent } from '../lib/siteContent'

const HIDDEN_FAQ_INTROS = new Set([
  'Use Chirin Ivatan as a public cultural reference. Visitors can read approved dictionary entries, browse folklore, learn about the project, and discover community contributors without needing an account.',
])

const ROLE_LABELS = {
  admin: 'Admin',
  consultant: 'Consultant',
  contributor: 'Contributor',
  reviewer: 'Reviewer',
  visitor: 'Visitor',
}

function userRole(currentUser) {
  const groups = currentUser?.groups || []
  if (currentUser?.is_superuser || groups.includes('Admin')) return 'admin'
  if (groups.includes('Consultant')) return 'consultant'
  if (groups.includes('Reviewer')) return 'reviewer'
  if (groups.includes('Contributor')) return 'contributor'
  return 'visitor'
}

function visibleGroupsForRole(role, sections) {
  const effectiveRole = role === 'consultant' ? 'reviewer' : role
  return sections.filter((section) => {
    const roles = Array.isArray(section.roles) && section.roles.length ? section.roles : ALL_FAQ_ROLES
    return roles.includes(effectiveRole)
  })
}

function Answer({ item }) {
  return (
    <div className="faq-answer">
      {item.a && <p>{item.a}</p>}
      {item.intro && <p>{item.intro}</p>}
      {item.bullets && (
        <ul>
          {item.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
      {item.outro && <p>{item.outro}</p>}
      {item.image_url && (
        <figure className="faq-answer-media">
          <img src={item.image_url} alt={item.image_alt || ''} loading="lazy" />
          {item.image_alt && <figcaption>{item.image_alt}</figcaption>}
        </figure>
      )}
    </div>
  )
}

function GuideCard({ guide }) {
  return (
    <article id={guide.id} className="faq-guide-card">
      <h3>{guide.title}</h3>
      <p>{guide.intro}</p>
      <h4>What to Include</h4>
      <ul>
        {guide.include.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h4>What to Avoid</h4>
      <ul>
        {guide.avoid.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="faq-guide-example">{guide.example}</p>
    </article>
  )
}

export default function FaqPage({ currentUser }) {
  const role = userRole(currentUser)
  const [faqSections, setFaqSections] = useState(DEFAULT_FAQ_SECTIONS)
  const [loadingContent, setLoadingContent] = useState(true)
  const groups = visibleGroupsForRole(role, faqSections)
  const showContributorGuides =
    currentUser?.is_authenticated || role === 'contributor' || role === 'reviewer' || role === 'consultant' || role === 'admin'

  useEffect(() => {
    apiRequest('/api/site-content')
      .then((payload) => {
        const content = normalizeSiteContent(payload)
        setFaqSections(content.faq_sections.length ? content.faq_sections : DEFAULT_FAQ_SECTIONS)
      })
      .catch(() => setFaqSections(DEFAULT_FAQ_SECTIONS))
      .finally(() => setLoadingContent(false))
  }, [])

  useEffect(() => {
    function scrollToHashTarget() {
      const hash = window.location.hash.replace('#', '')
      if (!hash) return

      window.requestAnimationFrame(() => {
        const target = document.getElementById(hash)
        if (target) {
          target.scrollIntoView({ block: 'start' })
        }
      })
    }

    scrollToHashTarget()
    window.addEventListener('hashchange', scrollToHashTarget)
    return () => window.removeEventListener('hashchange', scrollToHashTarget)
  }, [groups.length, faqSections.length])

  return (
    <section className="faq-page">
      <header className="faq-hero">
        <div>
          <p className="profile-kicker">Help Center</p>
          <h1>FAQs and Guides</h1>
          <p className="faq-hero-copy">
            Find quick answers by role, then open only the details you need.
          </p>
        </div>
        <div className="faq-hero-meta" aria-label="FAQ view summary">
          <span>{ROLE_LABELS[role]} View</span>
          {loadingContent && <span>Updating...</span>}
        </div>
      </header>

      <div className="faq-layout">
        <aside className="faq-sidebar">
          <p>Sections</p>
          <nav className="faq-toc" aria-label="FAQ sections">
            {groups.map((group) => (
              <a key={group.id} href={`#${group.id}`}>
                <span>{group.title}</span>
              </a>
            ))}
            {showContributorGuides && (
              <a href="#dictionary-field-guides">
                <span>Dictionary Field Guides</span>
              </a>
            )}
          </nav>
        </aside>

        <div className="faq-main">
          <div className="faq-group-list">
            {groups.map((group) => (
              <section key={group.id} id={group.id} className="faq-group">
                <div className="faq-group-heading">
                  <div>
                    <h2>{group.title}</h2>
                  </div>
                </div>
                {group.intro && !HIDDEN_FAQ_INTROS.has(group.intro) && <p className="faq-group-intro">{group.intro}</p>}
                <div className="faq-items">
                  {group.items.map((item) => (
                    <details key={item.q} className="faq-item">
                      <summary>{item.q}</summary>
                      <Answer item={item} />
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {showContributorGuides && (
            <section id="dictionary-field-guides" className="faq-group faq-guide-section">
              <div className="faq-group-heading">
                <div>
                  <p className="profile-kicker">Contributor Reference</p>
                  <h2>Dictionary Field Guides</h2>
                </div>
              </div>
              <p className="faq-group-intro">
                These guides explain the fields that often confuse first-time contributors. Builder Learn More links open this
                section directly.
              </p>
              <div className="faq-guide-grid">
                {DICTIONARY_FIELD_GUIDES.map((guide) => (
                  <GuideCard key={guide.id} guide={guide} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  )
}

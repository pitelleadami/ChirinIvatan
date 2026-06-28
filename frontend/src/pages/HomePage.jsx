import { useEffect, useState } from 'react'

import brandLogo from '../assets/brand/chirin-ivatan-logo.png'
import heroVillageImage from '../assets/landing/ivatan-village-hero.jpg'
import { apiRequest } from '../lib/api'
import { capitalizeFirst, normalizeHeadword } from '../lib/dictionaryText'
import { folkloreTaxonomyLabel } from '../lib/folkloreTaxonomy'
import { compactLeaderboardName } from '../lib/leaderboardDisplay'
import { getMunicipalityFlag } from '../lib/municipalityFlags'
import { ROUTES, navigate } from '../lib/router'
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from '../lib/siteContent'

const HOME_LATEST_FOLKLORE_LIMIT = 2

function contributorLabel(row) {
  return compactLeaderboardName(row.display_name || row.full_name || row.username)
}

function shortenText(value, limit = 76) {
  if (!value) return ''
  return value.length > limit ? `${value.slice(0, limit).trim()}...` : value
}

function formatPublicDate(value) {
  if (!value) return 'Recently added'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently added'
  return `Added ${new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date)}`
}

function hasMeaning(row) {
  const meaning = row.meaning?.trim()
  return meaning && meaning.toLowerCase() !== 'meaning not provided yet'
}

// Mother terms (or standalone terms with no variant group) are prioritized in the Latest preview.
function isMotherTerm(row) {
  return Boolean(row.is_mother) || !row.variant_group_id
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function withCompetitionRank(rows, valueKey = 'value') {
  const sorted = [...rows].sort((a, b) => toNumber(b[valueKey]) - toNumber(a[valueKey]))
  let previousValue = null
  let previousRank = 0
  return sorted.map((row, index) => {
    const currentValue = toNumber(row[valueKey])
    const rank = currentValue === previousValue ? previousRank : index + 1
    previousValue = currentValue
    previousRank = rank
    return { ...row, rank }
  })
}

function openDictionaryEntry(row) {
  if (row.entry_id) {
    navigate(`${ROUTES.dictionaryView}?entry_id=${encodeURIComponent(row.entry_id)}`)
    return
  }

  navigate(`${ROUTES.dictionaryView}?q=${encodeURIComponent(row.term || '')}`)
}

function openFolkloreEntry(row) {
  if (row.entry_id) {
    navigate(`${ROUTES.folkloreView}?entry_id=${encodeURIComponent(row.entry_id)}`)
    return
  }

  navigate(ROUTES.folkloreView)
}

function LandingFooter({ content }) {
  return (
    <footer className="site-footer landing-site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-left">{content.footer_left_text}</span>
        <span className="site-footer-center">
          <em>{content.footer_center_text}</em>
        </span>
        <span className="site-footer-right">{content.footer_right_text}</span>
        <span className="site-footer-mobile">
          {[content.footer_left_text, content.footer_center_text, content.footer_right_text]
            .filter(Boolean)
            .join(' ')}
        </span>
      </div>
    </footer>
  )
}

export default function HomePage({ currentUser = {} }) {
  const [globalRows, setGlobalRows] = useState([])
  const [topMunicipality, setTopMunicipality] = useState(null)
  const [dictionaryRows, setDictionaryRows] = useState([])
  const [folkloreRows, setFolkloreRows] = useState([])
  const [siteContent, setSiteContent] = useState(DEFAULT_SITE_CONTENT)
  const [archiveCounts, setArchiveCounts] = useState({ dictionaryLive: 0, folkloreLive: 0 })
  const [leaderMunicipality, setLeaderMunicipality] = useState('All')
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())
  const currentMonthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
  }).format(new Date())

  useEffect(() => {
    async function loadHomepageData() {
      try {
        const globalPayload = await apiRequest('/api/leaderboard/global?metric=combined&period=monthly')
        setGlobalRows(globalPayload.rows || [])
      } catch {
        setGlobalRows([])
      }

      try {
        const municipalityWinners = await apiRequest('/api/leaderboard/municipality-winners')
        const row = (municipalityWinners.rows || [])[0] || null
        setTopMunicipality(row)
      } catch {
        setTopMunicipality(null)
      }

      try {
        const dictionaryPayload = await apiRequest('/api/dictionary/entries?limit=20')
        setDictionaryRows(dictionaryPayload.rows || [])
        setArchiveCounts((current) => ({
          ...current,
          dictionaryLive: dictionaryPayload.counts?.visible_total ?? dictionaryPayload.counts?.approved ?? 0,
        }))
      } catch {
        setDictionaryRows([])
        setArchiveCounts((current) => ({
          ...current,
          dictionaryLive: 0,
        }))
      }

      try {
        const folklorePayload = await apiRequest('/api/folklore/entries')
        setFolkloreRows((folklorePayload.rows || []).slice(0, HOME_LATEST_FOLKLORE_LIMIT))
        setArchiveCounts((current) => ({
          ...current,
          folkloreLive: folklorePayload.counts?.visible_total ?? folklorePayload.counts?.approved ?? 0,
        }))
      } catch {
        setFolkloreRows([])
        setArchiveCounts((current) => ({
          ...current,
          folkloreLive: 0,
        }))
      }

      try {
        const siteContentPayload = await apiRequest('/api/site-content')
        setSiteContent(normalizeSiteContent(siteContentPayload))
      } catch {
        setSiteContent(DEFAULT_SITE_CONTENT)
      }
    }

    loadHomepageData()
  }, [])

  const rankedRows = withCompetitionRank(globalRows, 'value')
  const municipalityRankRows = withCompetitionRank(
    Object.entries(
      rankedRows.reduce((accumulator, row) => {
        const key = row.municipality || 'Not set'
        accumulator[key] = (accumulator[key] || 0) + toNumber(row.value)
        return accumulator
      }, {}),
    ).map(([municipality, score]) => ({ municipality, score })),
    'score',
  ).slice(0, 6)
  const topMunicipalitySummary = municipalityRankRows[0] || {
    municipality: topMunicipality?.municipality || 'No contributors yet',
    score: toNumber(topMunicipality?.score || topMunicipality?.value),
    rank: 1,
  }
  const municipalityRankList = municipalityRankRows.slice(1)
  const topMunicipalityFlag = getMunicipalityFlag(topMunicipalitySummary.municipality)
  const municipalityOptions = [
    'All',
    ...Array.from(new Set(rankedRows.map((row) => row.municipality).filter(Boolean))).sort(),
  ]
  const filteredRows =
    leaderMunicipality === 'All'
      ? rankedRows
      : rankedRows.filter((row) => row.municipality === leaderMunicipality)
  const topFiveMunicipality = filteredRows.slice(0, 5)
  const latestDictionary = dictionaryRows.filter(hasMeaning).filter(isMotherTerm).slice(0, 3)
  const latestFolklore = folkloreRows.slice(0, HOME_LATEST_FOLKLORE_LIMIT)
  const visibleSupportStatements = siteContent.support_statements.filter(
    (statement) => statement?.quote || statement?.name || statement?.role,
  )
  const visiblePartnerDetails = siteContent.partner_details.filter(
    (partner) => partner?.name || partner?.logo_url || partner?.url,
  )
  const hasClosingContent = visibleSupportStatements.length > 0 || visiblePartnerDetails.length > 0
  const currentUserGroups = currentUser.groups || []
  const isMember = Boolean(
    currentUser.is_authenticated &&
    (currentUser.is_superuser ||
      currentUserGroups.includes('Admin') ||
      currentUserGroups.includes('Reviewer') ||
      currentUserGroups.includes('Contributor')),
  )

  return (
    <div className="home-seamless">
      <section className="visitor-hero" style={{ '--visitor-hero-image': `url(${heroVillageImage})` }}>
        <div className="visitor-hero-overlay">
          <img
            className="visitor-hero-logo"
            src={siteContent.brand_logo_url || brandLogo}
            alt={`${siteContent.brand_name} logo`}
          />
          <h1>{siteContent.brand_name}</h1>
          <p className="visitor-lead">{siteContent.landing_intro_text}</p>
          <p className="visitor-copy">{siteContent.landing_body_text}</p>
          <div className="hero-actions">
            {!isMember && <button onClick={() => navigate(ROUTES.roleCenter)}>Join the Digital Yaru</button>}
            <button className="ghost" onClick={() => navigate(ROUTES.dictionaryView)}>
              Explore the Dictionary
            </button>
            <button className="ghost" onClick={() => navigate(ROUTES.folkloreView)}>
              Explore the Folklore Collection
            </button>
          </div>
        </div>
      </section>

      <section id="yaru-spirit" className="panel home-snapshot">
        <div className="snapshot-intro">
          <div>
            <h2>
              <em>"Built by the Ivatans, for the Ivatans, with the enduring spirit of Yaru."</em>
            </h2>
          </div>
          <article className="archive-count-card archive-count-inline">
            <div className="archive-count-grid">
              <div>
                <p className="stat-value">{archiveCounts.dictionaryLive}</p>
                <p className="stat-label">Dictionary Terms</p>
              </div>
              <div>
                <p className="stat-value">{archiveCounts.folkloreLive}</p>
                <p className="stat-label">Folklore Entries</p>
              </div>
            </div>
            <h3>Total Live Entries as of {todayLabel}</h3>
          </article>
        </div>

        <div className="home-snapshot-grid">
          <div className="home-snapshot-main">
            <article className="panel top-municipality-card">
              <div className="top-municipality-card-left">
                <div className="top-municipality-flag-wrap">
                  {topMunicipalityFlag ? (
                    <img className="municipality-flag" src={topMunicipalityFlag} alt="" />
                  ) : (
                    <span className="municipality-flag" aria-hidden="true">
                      {topMunicipalitySummary.municipality?.slice(0, 1) || 'Y'}
                    </span>
                  )}
                </div>
                <div className="top-municipality-text">
                  <h3>Top Contributor Municipality</h3>
                  <p className="stat-value">{topMunicipalitySummary.municipality}</p>
                  <p className="meta">Score: {topMunicipalitySummary.score}</p>
                </div>
              </div>
              <div className="top-municipality-card-right">
                <ol className="municipality-rank-list">
                  {municipalityRankList.map((row) => {
                    const flag = getMunicipalityFlag(row.municipality)
                    return (
                      <li key={row.municipality} className="municipality-rank-item">
                        <span className="municipality-rank-number">{row.rank}</span>
                        {flag ? (
                          <img className="municipality-flag municipality-flag-small" src={flag} alt="" />
                        ) : (
                          <span className="municipality-flag municipality-flag-small" aria-hidden="true">
                            {row.municipality?.slice(0, 1) || 'M'}
                          </span>
                        )}
                        <span className="municipality-rank-name">{row.municipality}</span>
                        <span className="municipality-rank-score">{row.score}</span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </article>
            <article className="panel leaderboard-panel">
              <div className="section-heading">
                <div>
                  <h3>Top {currentMonthLabel} Contributors</h3>
                </div>
                <div className="field">
                  <label htmlFor="home-municipality-filter">Municipality</label>
                  <select
                    id="home-municipality-filter"
                    value={leaderMunicipality}
                    onChange={(event) => setLeaderMunicipality(event.target.value)}
                  >
                    {municipalityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="table-wrap">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Contributor</th>
                      <th>Municipality</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topFiveMunicipality.length === 0 && (
                      <tr>
                        <td colSpan="4">No contributor rankings yet.</td>
                      </tr>
                    )}
                    {topFiveMunicipality.map((row) => (
                      <tr key={`${row.username}-${row.municipality}`}>
                        <td>{row.rank}</td>
                        <td>
                          <button
                            className="leaderboard-person leaderboard-person-button"
                            onClick={() =>
                              navigate(`${ROUTES.profileView}?username=${encodeURIComponent(row.username)}`)
                            }
                          >
                            {row.profile_photo ? (
                              <img className="leaderboard-avatar" src={row.profile_photo} alt="" />
                            ) : (
                              <span
                                className="leaderboard-avatar leaderboard-avatar-fallback"
                                aria-hidden="true"
                              >
                                {String(row.username || 'CI')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                            )}
                            <span className="leaderboard-person-text">
                              <span>{contributorLabel(row)}</span>
                              <span className="meta">@{row.username}</span>
                            </span>
                          </button>
                        </td>
                        <td>{row.municipality || 'Not set'}</td>
                        <td>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="quiet-link-button leaderboard-panel-link"
                onClick={() => navigate(ROUTES.leaderboards)}
              >
                View Full Leaderboard
              </button>
            </article>
          </div>
          <aside className="visitor-sidepanels latest-entry-column">
            <article className="panel">
              <div className="section-heading">
                <div>
                  <h3>Latest in Dictionary</h3>
                </div>
              </div>
              <div className="card-list">
                {latestDictionary.length === 0 && <p className="muted">No published dictionary terms yet.</p>}
                {latestDictionary.map((row) => (
                  <button
                    key={row.entry_id || row.term}
                    className="queue-card queue-card-link"
                    type="button"
                    onClick={() => openDictionaryEntry(row)}
                  >
                    <div className="latest-entry-card">
                      <div className="latest-entry-text">
                        <div className="queue-header">
                          <strong>{normalizeHeadword(row.term)}</strong>
                        </div>
                        <p className="entry-summary">{shortenText(capitalizeFirst(row.meaning))}</p>
                        <p className="meta">
                          {row.part_of_speech || 'Entry'} · {formatPublicDate(row.created_at)}
                        </p>
                      </div>
                      {row.photo_url && (
                        <img className="latest-entry-thumb" src={row.photo_url} alt="" loading="lazy" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </article>
            <article className="panel">
              <div className="section-heading">
                <div>
                  <h3>Latest in Folklore</h3>
                </div>
              </div>
              <div className="card-list">
                {latestFolklore.length === 0 && <p className="muted">No published folklore entries yet.</p>}
                {latestFolklore.map((row) => (
                  <button
                    key={row.entry_id || row.title}
                    className="queue-card queue-card-link"
                    type="button"
                    onClick={() => openFolkloreEntry(row)}
                  >
                    <div className="latest-entry-card">
                      <div className="latest-entry-text">
                        <div className="queue-header">
                          <strong>{row.title}</strong>
                        </div>
                        <p className="meta">
                          {folkloreTaxonomyLabel(row.category, row.subcategory) || 'Story'} ·{' '}
                          {formatPublicDate(row.created_at)}
                        </p>
                      </div>
                      {row.photo_upload_url && (
                        <img
                          className="latest-entry-thumb"
                          src={row.photo_upload_url}
                          alt=""
                          loading="lazy"
                        />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </article>
          </aside>
        </div>
        {!hasClosingContent && <LandingFooter content={siteContent} />}
      </section>

      {hasClosingContent && (
        <section className="panel home-closing-slide">
          {visibleSupportStatements.length > 0 && (
            <section className="recommendation-section">
              <div className="recommendation-header">
                <h2>Statements of Support</h2>
              </div>
              <div className="recommendation-stack">
                {visibleSupportStatements.map((statement, index) => (
                  <article key={`home-support-${index}`} className="recommendation-card">
                    <span className="recommendation-quote-mark" aria-hidden="true">
                      "
                    </span>
                    {statement.quote && <p className="recommendation-copy">{statement.quote}</p>}
                    {(statement.name || statement.role) && (
                      <p className="recommendation-source">
                        <span className="recommendation-logo" aria-hidden="true">
                          CI
                        </span>
                        {[statement.name, statement.role].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {visiblePartnerDetails.length > 0 && (
            <section className="partner-strip-section">
              <h2>Supporting Organizations</h2>
              <div className="partner-grid">
                {visiblePartnerDetails.map((partner, index) => (
                  <a
                    key={`home-partner-${index}`}
                    className="partner-logo"
                    href={partner.url || undefined}
                    target={partner.url ? '_blank' : undefined}
                    rel={partner.url ? 'noreferrer' : undefined}
                  >
                    {partner.logo_url ? (
                      <img className="partner-logo-image" src={partner.logo_url} alt="" />
                    ) : (
                      <span className="partner-logo-mark" aria-hidden="true">
                        {(partner.name || 'Supporting Organization').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="partner-agency-name">{partner.name || 'Supporting Organization'}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <LandingFooter content={siteContent} />
        </section>
      )}
    </div>
  )
}

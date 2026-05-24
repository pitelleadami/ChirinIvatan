import { useEffect, useState } from 'react'

import SampleProfilePhoto from '../components/SampleProfilePhoto'
import { apiRequest } from '../lib/api'
import { SAMPLE_HOME_GLOBAL_ROWS, getSampleProfileSummary } from '../lib/sampleProfiles'
import { ROUTES, navigate } from '../lib/router'

const SAMPLE_TOP_CONTRIBUTOR = SAMPLE_HOME_GLOBAL_ROWS[0]
const SAMPLE_TOP_MUNICIPALITY = { municipality: 'Ivana', score: 146 }

const SAMPLE_DICTIONARY_ENTRIES = [
  {
    term: 'Chirin',
    municipality: 'Basco',
    status: 'approved',
    meaning: 'language, speech, or spoken expression',
    part_of_speech: 'noun',
    created_at: '2026-05-14T09:20:00+08:00',
  },
  {
    term: 'Yaru',
    municipality: 'Ivana',
    status: 'approved',
    meaning: 'community cooperation or shared labor',
    part_of_speech: 'noun',
    created_at: '2026-05-14T09:12:00+08:00',
  },
  {
    term: 'Mahahad',
    municipality: 'Mahatao',
    status: 'approved_under_review',
    meaning: 'a remembered saying or familiar expression',
    part_of_speech: 'noun',
    created_at: '2026-05-14T08:54:00+08:00',
  },
]

const SAMPLE_FOLKLORE_ENTRIES = [
  {
    title: 'The Wind at Naidi',
    municipality_source: 'Basco',
    status: 'approved',
    category: 'legend',
    created_at: '2026-05-14T08:42:00+08:00',
  },
  {
    title: 'Song of Iraya Cliffs',
    municipality_source: 'Itbayat',
    status: 'approved',
    category: 'laji',
    created_at: '2026-05-13T16:18:00+08:00',
  },
]

const SAMPLE_ARCHIVE_COUNTS = {
  dictionaryApproved: SAMPLE_DICTIONARY_ENTRIES.filter((row) => row.status === 'approved').length,
  folkloreApproved: SAMPLE_FOLKLORE_ENTRIES.filter((row) => row.status === 'approved').length,
}

const SAMPLE_TESTIMONIES = [
  {
    quote:
      'Chirin Ivatan helps us retain oral memory in forms that young learners can revisit without losing local context.',
    author: 'Batanes Cultural Alliance',
  },
  {
    quote:
      'This platform is a meaningful bridge between elders, schools, and digital learners across municipalities.',
    author: 'Provincial Educators Network',
  },
  {
    quote:
      'The archive gives us a practical way to protect words and stories before they fade from everyday use.',
    author: 'Community Youth Volunteer',
  },
]

const SAMPLE_PARTNERS = [
  { initials: 'BSC', name: 'Batanes State College' },
  { initials: 'MCO', name: 'Municipal Culture Office' },
  { initials: 'IYC', name: 'Ivatan Youth Collective' },
]

function sampleProfilePhoto(name) {
  const source = name || 'Chirin Ivatan'
  const total = source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return total % 12
}

function contributorLabel(row) {
  const sampleProfile = getSampleProfileSummary(row.username)
  return sampleProfile?.display_name || row.username
}

function shortenText(value, limit = 76) {
  if (!value) return 'Meaning not provided yet'
  return value.length > limit ? `${value.slice(0, limit).trim()}...` : value
}

function formatContributionDate(value) {
  if (!value) return 'Date not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
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

export default function HomePage() {
  const [globalRows, setGlobalRows] = useState([])
  const [topMunicipality, setTopMunicipality] = useState(null)
  const [dictionaryRows, setDictionaryRows] = useState([])
  const [folkloreRows, setFolkloreRows] = useState([])
  const [archiveCounts, setArchiveCounts] = useState(SAMPLE_ARCHIVE_COUNTS)
  const [leaderMunicipality, setLeaderMunicipality] = useState('All')

  useEffect(() => {
    async function loadHomepageData() {
      try {
        const globalPayload = await apiRequest('/leaderboard/global?metric=combined&period=monthly')
        setGlobalRows(globalPayload.rows || [])
      } catch {
        setGlobalRows([])
      }

      try {
        const municipalityWinners = await apiRequest('/leaderboard/municipality-winners')
        const row = (municipalityWinners.rows || [])[0] || null
        setTopMunicipality(row)
      } catch {
        setTopMunicipality(null)
      }

      try {
        const dictionaryPayload = await apiRequest('/api/dictionary/entries?limit=4')
        setDictionaryRows(dictionaryPayload.rows || [])
        setArchiveCounts((current) => ({
          ...current,
          dictionaryApproved: dictionaryPayload.counts?.approved ?? 0,
        }))
      } catch {
        setDictionaryRows([])
        setArchiveCounts((current) => ({
          ...current,
          dictionaryApproved: SAMPLE_ARCHIVE_COUNTS.dictionaryApproved,
        }))
      }

      try {
        const folklorePayload = await apiRequest('/api/folklore/entries')
        setFolkloreRows((folklorePayload.rows || []).slice(0, 4))
        setArchiveCounts((current) => ({
          ...current,
          folkloreApproved: folklorePayload.counts?.approved ?? 0,
        }))
      } catch {
        setFolkloreRows([])
        setArchiveCounts((current) => ({
          ...current,
          folkloreApproved: SAMPLE_ARCHIVE_COUNTS.folkloreApproved,
        }))
      }
    }

    loadHomepageData()
  }, [])

  const topContributor = globalRows[0] || SAMPLE_TOP_CONTRIBUTOR
  const leadingMunicipality = topMunicipality || SAMPLE_TOP_MUNICIPALITY
  const rankedRows = withCompetitionRank(globalRows.length ? globalRows : SAMPLE_HOME_GLOBAL_ROWS, 'value')
  const municipalityOptions = [
    'All',
    ...Array.from(new Set(rankedRows.map((row) => row.municipality).filter(Boolean))).sort(),
  ]
  const filteredRows = leaderMunicipality === 'All'
    ? rankedRows
    : rankedRows.filter((row) => row.municipality === leaderMunicipality)
  const topEightMunicipality = filteredRows.slice(0, 8)
  const latestDictionary = dictionaryRows.length ? dictionaryRows : SAMPLE_DICTIONARY_ENTRIES
  const latestFolklore = folkloreRows.length ? folkloreRows : SAMPLE_FOLKLORE_ENTRIES

  return (
    <main className="home-seamless">
      <section className="visitor-hero">
        <div className="visitor-hero-overlay">
          <h1>Chirin Ivatan</h1>
          <p className="visitor-lead">
            Chirin Ivatan, from Chirin meaning language and Ivatan meaning of the Ivatans or of Batanes, is an online
            dictionary and folklore archive dedicated to preserving the Ivatan language, stories, and cultural
            heritage in the digital age.
          </p>
          <p className="visitor-copy">
            Developed to safeguard the Ivatan language in the digital age, it welcomes Ivatans and all who wish to
            learn about the language and heritage to join in preserving the words, stories, and living traditions that
            give life to Batanes.
          </p>
          <div className="hero-actions">
            <button onClick={() => navigate(ROUTES.roleCenter)}>Join our digital yaru</button>
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
        <h2>Chirin Ivatan is built by the Ivatans for the Ivatans, with the timeold spirit of Yaru.</h2>

        <div className="home-snapshot-stats">
          <article className="panel stat-panel">
            <button
              className="winner-card-main winner-card-button"
              onClick={() => navigate(`${ROUTES.profileView}?username=${encodeURIComponent(topContributor.username)}`)}
            >
              {topContributor.profile_photo ? (
                <img className="winner-avatar" src={topContributor.profile_photo} alt="" />
              ) : (
                <SampleProfilePhoto
                  className="winner-avatar"
                  index={topContributor.profile_photo_index ?? sampleProfilePhoto(topContributor.username)}
                />
              )}
              <div>
                <p className="stat-value">{contributorLabel(topContributor)}</p>
                <p className="meta">@{topContributor.username}</p>
              </div>
            </button>
            <h3>Top Contributor of the Month</h3>
            <p className="muted">{topContributor.municipality || 'Batanes'} municipality</p>
          </article>
          <article className="panel stat-panel">
            <div className="winner-card-main">
              <span className="municipality-flag" aria-hidden="true">
                &#128681;
              </span>
              <p className="stat-value">{leadingMunicipality.municipality}</p>
            </div>
            <h3>Top Municipality of the Month</h3>
            <p className="muted">Score: {leadingMunicipality.score || leadingMunicipality.value}</p>
          </article>
          <article className="panel stat-panel archive-count-card">
            <div className="archive-count-grid">
              <div>
                <p className="stat-label">Existing Approved Terms</p>
                <p className="stat-value">{archiveCounts.dictionaryApproved}</p>
              </div>
              <div>
                <p className="stat-label">Existing Approved Folklore</p>
                <p className="stat-value">{archiveCounts.folkloreApproved}</p>
              </div>
            </div>
            <button className="ghost" onClick={() => navigate(ROUTES.leaderboards)}>
              Open Leaderboards
            </button>
          </article>
        </div>

        <div className="home-snapshot-grid">
          <article className="panel">
            <div className="section-heading">
              <h3>Top 8 Contributors per Municipality</h3>
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
                    <th>Monthly Value</th>
                  </tr>
                </thead>
                <tbody>
                  {topEightMunicipality.map((row) => (
                    <tr key={`${row.username}-${row.municipality}`}>
                      <td>{row.rank}</td>
                      <td>
                        <button
                          className="leaderboard-person leaderboard-person-button"
                          onClick={() => navigate(`${ROUTES.profileView}?username=${encodeURIComponent(row.username)}`)}
                        >
                          {row.profile_photo ? (
                            <img className="leaderboard-avatar" src={row.profile_photo} alt="" />
                          ) : (
                            <SampleProfilePhoto
                              className="leaderboard-avatar"
                              index={row.profile_photo_index ?? sampleProfilePhoto(row.username)}
                            />
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
          </article>

          <aside className="visitor-sidepanels">
            <article className="panel">
              <div className="section-heading">
                <h3>Latest Approved Dictionary Entries</h3>
                <span className="meta">Approved: {archiveCounts.dictionaryApproved}</span>
              </div>
              <div className="card-list">
                {latestDictionary.map((row) => (
                  <article key={row.entry_id || row.term} className="queue-card">
                    <div className="queue-header">
                      <strong>{row.term}</strong>
                      <span className="badge">{row.status}</span>
                    </div>
                    <p className="entry-summary">{shortenText(row.meaning)}</p>
                    <p className="meta">
                      {row.part_of_speech || 'Word type not set'} | {formatContributionDate(row.created_at)}
                    </p>
                  </article>
                ))}
              </div>
            </article>
            <article className="panel">
              <div className="section-heading">
                <h3>Latest Approved Folklore Entries</h3>
                <span className="meta">Approved: {archiveCounts.folkloreApproved}</span>
              </div>
              <div className="card-list">
                {latestFolklore.map((row) => (
                  <article key={row.entry_id || row.title} className="queue-card">
                    <div className="queue-header">
                      <strong>{row.title}</strong>
                      <span className="badge">{row.status}</span>
                    </div>
                    <p className="meta">
                      {row.category || 'Type not set'} | {formatContributionDate(row.created_at)}
                    </p>
                  </article>
                ))}
              </div>
            </article>
          </aside>
        </div>
      </section>

      <section className="panel home-closing-slide">
        <div>
          <h2>Commendations</h2>
          <div className="testimonial-grid">
            {SAMPLE_TESTIMONIES.map((item) => (
              <article key={item.author} className="step-card">
                <p>{item.quote}</p>
                <p className="muted">{item.author}</p>
              </article>
            ))}
          </div>
        </div>

        <div>
          <h2>Partner Organizations</h2>
          <div className="partner-grid">
            {SAMPLE_PARTNERS.map((partner) => (
              <div key={partner.name} className="partner-logo">
                <span className="partner-logo-mark" aria-hidden="true">
                  {partner.initials}
                </span>
                <span className="partner-agency-name">{partner.name}</span>
              </div>
            ))}
          </div>
        </div>

        <footer className="visitor-footer">
          Copyright © Kristelle Joyce Adami. This work may be shared for non-commercial purposes only.
        </footer>
      </section>
    </main>
  )
}

/*
  LeaderboardPage.jsx

  Public Hall of Stewards:
  - live archive counts
  - contributor rankings
  - municipality standings
  - monthly winner history
*/

import { useEffect, useMemo, useState } from 'react'

import { apiRequest } from '../lib/api'
import { getMunicipalityFlag } from '../lib/municipalityFlags'
import { ROUTES, navigate } from '../lib/router'
import { copyShareText, openSocialShare, shareWithNative } from '../lib/socialShare'

const METRIC_OPTIONS = ['combined', 'dictionary', 'folklore']
const PERIOD_OPTIONS = ['monthly', 'all_time']
const MUNICIPALITIES = ['All', 'Basco', 'Mahatao', 'Ivana', 'Uyugan', 'Sabtang', 'Itbayat']
const RANKED_MUNICIPALITIES = MUNICIPALITIES.filter((item) => item !== 'All')
const EMPTY_ARCHIVE_COUNTS = {
  dictionaryApproved: 0,
  folkloreApproved: 0,
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

function metricLabel(value) {
  if (value === 'dictionary') return 'Dictionary'
  if (value === 'folklore') return 'Folklore'
  return 'Combined'
}

function periodLabel(value) {
  return value === 'all_time' ? 'All Time' : 'Current Month'
}

function contributorName(row) {
  return row.display_name || row.full_name || row.name || row.username || 'Contributor'
}

function municipalityScore(row, metric, period) {
  const metricKey = metric === 'combined' ? 'combined' : metric
  const periodKey = period === 'all_time' ? 'all_time' : 'month'
  return toNumber(row[`${metricKey}_${periodKey}`])
}

export default function LeaderboardPage({ currentUser = {} }) {
  const [metric, setMetric] = useState('combined')
  const [period, setPeriod] = useState('monthly')
  const [municipality, setMunicipality] = useState('All')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shareFeedback, setShareFeedback] = useState('')

  const [globalRows, setGlobalRows] = useState([])
  const [municipalityRows, setMunicipalityRows] = useState([])
  const [municipalityTotals, setMunicipalityTotals] = useState([])
  const [archiveCounts, setArchiveCounts] = useState(EMPTY_ARCHIVE_COUNTS)

  const todayLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  const shownRows = municipality === 'All' ? globalRows : municipalityRows
  const rankedContributorRows = withCompetitionRank(shownRows, 'value').slice(0, 20)
  const isAuthenticated = Boolean(currentUser?.is_authenticated)
  const myUsername = String(currentUser?.username || '').trim()
  const myMunicipality = String(currentUser?.municipality || '').trim()

  const rankedMunicipalities = useMemo(
    () => {
      const totalsByMunicipality = new Map(municipalityTotals.map((row) => [row.municipality, row]))
      return withCompetitionRank(
        RANKED_MUNICIPALITIES.map((municipalityName) => {
          const row = totalsByMunicipality.get(municipalityName) || { municipality: municipalityName }
          return {
            municipality: municipalityName,
            score: municipalityScore(row, metric, period),
            dictionary: period === 'all_time' ? toNumber(row.dictionary_all_time) : toNumber(row.dictionary_month),
            folklore: period === 'all_time' ? toNumber(row.folklore_all_time) : toNumber(row.folklore_month),
          }
        }),
        'score',
      )
    },
    [metric, municipalityTotals, period],
  )

  const winningMunicipality = rankedMunicipalities[0] || {
    municipality: 'Basco',
    score: 0,
    rank: 1,
  }
  const winningFlag = getMunicipalityFlag(winningMunicipality.municipality)
  const myContributorRow = rankedContributorRows.find((row) => row.username === myUsername) || null
  const myMunicipalityRow = rankedMunicipalities.find((row) => row.municipality === myMunicipality) || null

  async function shareRanking(platform, kind) {
    const pageUrl = `${window.location.origin}${ROUTES.leaderboards}`
    const context = `${periodLabel(period)} · ${metricLabel(metric)}`
    const shareTarget = kind === 'municipality' ? myMunicipalityRow : myContributorRow
    if (!shareTarget) return

    const text = kind === 'municipality'
      ? `My municipality (${myMunicipality}) is rank #${shareTarget.rank} on Chirin Ivatan Hall of Stewards (${context}).`
      : `I am rank #${shareTarget.rank} in the Chirin Ivatan Hall of Stewards (${context}) with ${shareTarget.value} points.`

    if (platform === 'native') {
      const shared = await shareWithNative({
        title: 'Hall of Stewards Ranking',
        text,
        url: pageUrl,
      })
      if (shared) setShareFeedback('Share sheet opened.')
      if (!shared) {
        const copied = await copyShareText({ text, url: pageUrl })
        setShareFeedback(copied ? 'Share text copied.' : 'Native sharing is not available on this browser.')
      }
      return
    }

    if (platform === 'copy') {
      const copied = await copyShareText({ text, url: pageUrl })
      setShareFeedback(copied ? 'Share text copied.' : 'Could not copy share text.')
      return
    }

    const opened = openSocialShare(platform, { text, url: pageUrl })
    if (opened) setShareFeedback(platform === 'facebook' ? 'Facebook share window opened.' : 'X share window opened.')
    if (!opened) setShareFeedback('Could not open social share window.')
  }

  async function run(requestFn) {
    setLoading(true)
    setError('')
    try {
      await requestFn()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadArchiveCounts() {
    try {
      const [dictionaryPayload, folklorePayload] = await Promise.all([
        apiRequest('/api/dictionary/entries?limit=1'),
        apiRequest('/api/folklore/entries'),
      ])
      setArchiveCounts({
        dictionaryApproved: dictionaryPayload.counts?.approved ?? 0,
        folkloreApproved: folklorePayload.counts?.approved ?? 0,
      })
    } catch {
      setArchiveCounts(EMPTY_ARCHIVE_COUNTS)
    }
  }

  async function loadGlobalRanking() {
    const payload = await apiRequest(`/api/leaderboard/global?metric=${metric}&period=${period}`)
    setGlobalRows(payload.rows || [])
  }

  async function loadMunicipalityRanking() {
    if (municipality === 'All') {
      setMunicipalityRows([])
      return
    }
    const payload = await apiRequest(
      `/api/leaderboard/municipality?municipality=${encodeURIComponent(municipality)}&metric=${metric}&period=${period}`,
    )
    setMunicipalityRows(payload.rows || [])
  }

  async function loadMunicipalityTotals() {
    const payload = await apiRequest('/api/leaderboard/municipalities')
    setMunicipalityTotals(payload.rows || [])
  }

  async function refreshLeaderboard() {
    await run(async () => {
      await loadArchiveCounts()
      await loadMunicipalityTotals()
      await loadGlobalRanking()
      await loadMunicipalityRanking()
    })
  }

  useEffect(() => {
    loadArchiveCounts()
    loadMunicipalityTotals().catch(() => setMunicipalityTotals([]))
  }, [])

  useEffect(() => {
    run(async () => {
      await loadGlobalRanking()
      await loadMunicipalityRanking()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, period, municipality])

  return (
    <section className="leaderboard-page">
      <section className="leaderboard-hero">
        <div>
          <h1>Hall of Stewards</h1>
          <p className="muted leaderboard-hero-subtitle">
            Recognizing the individuals and communities safeguarding our shared heritage, because every contribution
            strengthens the future of Ivatan language and folklore.
          </p>
        </div>
        <article className="archive-count-card archive-count-inline">
          <div className="archive-count-grid">
            <div>
              <p className="stat-value">{archiveCounts.dictionaryApproved}</p>
              <p className="stat-label">Dictionary Terms</p>
            </div>
            <div>
              <p className="stat-value">{archiveCounts.folkloreApproved}</p>
              <p className="stat-label">Folklore Entries</p>
            </div>
          </div>
          <h3>Total Live Entries as of {todayLabel}</h3>
        </article>
      </section>

      {error && <section className="alert error">{error}</section>}
      {shareFeedback && <section className="alert ok">{shareFeedback}</section>}

      <section className="leaderboard-controls" aria-label="Leaderboard filters">
        <p className="leaderboard-controls-title">Filters</p>
        <label className="field" htmlFor="lb-metric">
          <span>Recognition</span>
          <select id="lb-metric" value={metric} onChange={(event) => setMetric(event.target.value)}>
            {METRIC_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {metricLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="field" htmlFor="lb-period">
          <span>Period</span>
          <select id="lb-period" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {PERIOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {periodLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="field" htmlFor="lb-municipality">
          <span>Municipality</span>
          <select id="lb-municipality" value={municipality} onChange={(event) => setMunicipality(event.target.value)}>
            {MUNICIPALITIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost compact-button leaderboard-refresh-button" disabled={loading} onClick={refreshLeaderboard}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      <section className="leaderboard-results-grid">
        <article className="panel leaderboard-panel leaderboard-full-panel leaderboard-individual-column">
          <div className="section-heading">
            <div>
              <h3>
                {municipality === 'All' ? 'Individual Ranking' : `Individual Ranking · ${municipality}`}
              </h3>
              {isAuthenticated && myContributorRow && (
                <div className="share-action-row">
                  <button type="button" className="ghost compact-button" onClick={() => shareRanking('native', 'individual')}>
                    Share Rank
                  </button>
                  <button type="button" className="ghost compact-button" onClick={() => shareRanking('facebook', 'individual')}>
                    Facebook
                  </button>
                  <button type="button" className="ghost compact-button" onClick={() => shareRanking('x', 'individual')}>
                    X
                  </button>
                  <button type="button" className="ghost compact-button" onClick={() => shareRanking('copy', 'individual')}>
                    Copy Text
                  </button>
                </div>
              )}
            </div>
            {loading && <span className="badge status-pending">Loading</span>}
          </div>

          {rankedContributorRows.length === 0 ? (
            <p className="muted">No ranking rows found yet.</p>
          ) : (
            <div className="table-wrap leaderboard-ranking-scroll">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Steward</th>
                    <th>Municipality</th>
                    <th>Score</th>
                    <th>Recognition</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedContributorRows.map((row) => (
                    <tr key={`${row.username}-${row.metric}-${row.period}`}>
                      <td>{row.rank}</td>
                      <td>
                        <button
                          type="button"
                          className="leaderboard-person leaderboard-person-button"
                          onClick={() => navigate(`${ROUTES.profileView}?username=${encodeURIComponent(row.username)}`)}
                        >
                          {row.profile_photo ? (
                            <img className="leaderboard-avatar" src={row.profile_photo} alt="" />
                          ) : (
                            <span className="leaderboard-avatar" aria-hidden="true">
                              {contributorName(row).slice(0, 1)}
                            </span>
                          )}
                          <span className="leaderboard-person-text">
                            <span>{contributorName(row)}</span>
                            <span className="meta">@{row.username}</span>
                          </span>
                        </button>
                      </td>
                      <td>{row.municipality || 'Not set'}</td>
                      <td>{row.value}</td>
                      <td>{row.current_contributor_title || row.current_reviewer_title || 'Cultural Steward'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <aside className="leaderboard-side-stack leaderboard-municipality-column">
          <article className="leaderboard-standings-card">
            <h3>Municipality Ranking</h3>
            {isAuthenticated && myMunicipalityRow && (
              <div className="share-action-row">
                <button type="button" className="ghost compact-button" onClick={() => shareRanking('native', 'municipality')}>
                  Share Municipality
                </button>
                <button type="button" className="ghost compact-button" onClick={() => shareRanking('facebook', 'municipality')}>
                  Facebook
                </button>
                <button type="button" className="ghost compact-button" onClick={() => shareRanking('x', 'municipality')}>
                  X
                </button>
                <button type="button" className="ghost compact-button" onClick={() => shareRanking('copy', 'municipality')}>
                  Copy Text
                </button>
              </div>
            )}
            <div className="leaderboard-municipality-list">
              <div className="municipality-leading-row">
                <div className="municipality-leading-flag-wrap">
                  {winningFlag ? (
                    <img className="municipality-flag" src={winningFlag} alt="" />
                  ) : (
                    <span className="municipality-flag" aria-hidden="true">
                      {winningMunicipality.municipality?.slice(0, 1) || 'Y'}
                    </span>
                  )}
                </div>
                <div className="municipality-leading-text">
                  <p className="stat-value">{winningMunicipality.municipality}</p>
                  <p className="meta">
                    Rank: {winningMunicipality.rank} · Score: {winningMunicipality.score}
                  </p>
                </div>
              </div>

              {rankedMunicipalities.slice(1).map((row) => {
                const flag = getMunicipalityFlag(row.municipality)
                return (
                  <div key={row.municipality} className="leaderboard-municipality-row">
                    <span className="municipality-rank-number">{row.rank}</span>
                    {flag ? (
                      <img className="municipality-flag municipality-flag-small" src={flag} alt="" />
                    ) : (
                      <span className="municipality-flag municipality-flag-small" aria-hidden="true">
                        {row.municipality?.slice(0, 1) || 'M'}
                      </span>
                    )}
                    <span>{row.municipality}</span>
                    <strong>{row.score}</strong>
                  </div>
                )
              })}
            </div>
          </article>
        </aside>
      </section>
    </section>
  )
}

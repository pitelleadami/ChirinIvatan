/*
  LeaderboardPage.jsx

  Dashboard for global/municipality rankings and monthly winner history.
  Reads from backend aggregate endpoints.
*/

import { useState } from 'react'

import { apiRequest } from '../lib/api'

const METRIC_OPTIONS = ['combined', 'dictionary', 'folklore']
const PERIOD_OPTIONS = ['all_time', 'monthly']

export default function LeaderboardPage() {
  const [metric, setMetric] = useState('combined')
  const [period, setPeriod] = useState('all_time')
  const [municipality, setMunicipality] = useState('')
  const [month, setMonth] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [globalRows, setGlobalRows] = useState([])
  const [municipalityRows, setMunicipalityRows] = useState([])
  const [municipalityTotals, setMunicipalityTotals] = useState([])
  const [winnerRows, setWinnerRows] = useState([])

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

  async function loadGlobal() {
    await run(async () => {
      const payload = await apiRequest(`/leaderboard/global?metric=${metric}&period=${period}`)
      setGlobalRows(payload.rows || [])
    })
  }

  async function loadMunicipality() {
    const value = municipality.trim()
    if (!value) {
      setError('Enter municipality first.')
      return
    }

    await run(async () => {
      const payload = await apiRequest(
        `/leaderboard/municipality?municipality=${encodeURIComponent(value)}&metric=${metric}&period=${period}`
      )
      setMunicipalityRows(payload.rows || [])
    })
  }

  async function loadMunicipalityTotals() {
    await run(async () => {
      const payload = await apiRequest('/leaderboard/municipalities')
      setMunicipalityTotals(payload.rows || [])
    })
  }

  async function loadWinners() {
    await run(async () => {
      const suffix = month.trim() ? `?month=${encodeURIComponent(month.trim())}` : ''
      const payload = await apiRequest(`/leaderboard/municipality-winners${suffix}`)
      setWinnerRows(payload.rows || [])
    })
  }

  return (
    <>
      <section className="panel">
        <h2>Leaderboards & Municipality Winners</h2>
        <p className="muted">Choose metric/period, then load global or municipality rankings. You can also load monthly winner history.</p>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="lb-metric">Metric</label>
            <select id="lb-metric" value={metric} onChange={(event) => setMetric(event.target.value)}>
              {METRIC_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="lb-period">Period</label>
            <select id="lb-period" value={period} onChange={(event) => setPeriod(event.target.value)}>
              {PERIOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="lb-municipality">Municipality (for municipality ranking)</label>
            <input
              id="lb-municipality"
              value={municipality}
              onChange={(event) => setMunicipality(event.target.value)}
              placeholder="e.g. Basco"
            />
          </div>

          <div className="field">
            <label htmlFor="lb-month">Winner Month (optional, YYYY-MM)</label>
            <input
              id="lb-month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              placeholder="e.g. 2026-02"
            />
          </div>
        </div>

        <div className="actions">
          <button disabled={loading} onClick={loadGlobal}>
            Load Global
          </button>
          <button className="secondary" disabled={loading} onClick={loadMunicipality}>
            Load Municipality Ranking
          </button>
          <button className="ghost" disabled={loading} onClick={loadMunicipalityTotals}>
            Load Municipality Totals
          </button>
          <button className="ghost" disabled={loading} onClick={loadWinners}>
            Load Monthly Winners
          </button>
        </div>
      </section>

      {error && <section className="alert error">{error}</section>}

      <section className="panel">
        <h3>Global Ranking</h3>
        {globalRows.length === 0 && <p className="muted">No rows loaded yet.</p>}
        {globalRows.length > 0 && (
          <div className="table-wrap">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Municipality</th>
                  <th>Value</th>
                  <th>Contributor Title</th>
                  <th>Reviewer Title</th>
                </tr>
              </thead>
              <tbody>
                {globalRows.map((row) => (
                  <tr key={`${row.username}-${row.metric}-${row.period}`}>
                    <td>{row.username}</td>
                    <td>{row.municipality || '-'}</td>
                    <td>{row.value}</td>
                    <td>{row.current_contributor_title}</td>
                    <td>{row.current_reviewer_title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Municipality Ranking</h3>
        {municipalityRows.length === 0 && <p className="muted">No municipality ranking loaded yet.</p>}
        {municipalityRows.length > 0 && (
          <div className="table-wrap">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Municipality</th>
                  <th>Value</th>
                  <th>Combined Total</th>
                </tr>
              </thead>
              <tbody>
                {municipalityRows.map((row) => (
                  <tr key={`${row.username}-${row.metric}-${row.period}-municipality`}>
                    <td>{row.username}</td>
                    <td>{row.municipality || '-'}</td>
                    <td>{row.value}</td>
                    <td>{row.combined_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Municipality Totals</h3>
        {municipalityTotals.length === 0 && <p className="muted">No municipality totals loaded yet.</p>}
        {municipalityTotals.map((row) => (
          <article key={row.municipality} className="queue-card">
            <p className="meta">Municipality: {row.municipality}</p>
            <p className="meta">All Time Combined: {row.combined_all_time}</p>
            <p className="meta">Monthly Combined: {row.combined_month}</p>
            <p className="meta">Last Month Key: {row.last_month_calculated || '-'}</p>
          </article>
        ))}
      </section>

      <section className="panel">
        <h3>Municipality Monthly Winners</h3>
        {winnerRows.length === 0 && <p className="muted">No winner records loaded yet.</p>}
        {winnerRows.map((row) => (
          <article key={`${row.month_key}-${row.metric}`} className="queue-card">
            <p className="meta">Month: {row.month_key}</p>
            <p className="meta">Metric: {row.metric}</p>
            <p className="meta">Winner: {row.municipality}</p>
            <p className="meta">Score: {row.score}</p>
          </article>
        ))}
      </section>
    </>
  )
}

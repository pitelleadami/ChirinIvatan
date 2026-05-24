/*
  ReviewerDashboardPage.jsx

  Main moderation workspace:
  - load all review queues
  - submit approve/reject/flag decisions
  - display per-row result/error feedback
*/

import { useEffect, useState } from 'react'

import QueueSection from '../components/QueueSection'
import { apiRequest } from '../lib/api'

const IMPLEMENTATION_STEPS = [
  { label: 'Reviewer Dashboard', status: 'current' },
  { label: 'Folklore Viewer', status: 'next' },
  { label: 'Dictionary Viewer', status: 'queued' },
  { label: 'Folklore Draft Builder', status: 'queued' },
  { label: 'Public Profile', status: 'queued' },
  { label: 'Leaderboards', status: 'queued' },
  { label: 'Role Center', status: 'queued' },
]

export default function ReviewerDashboardPage() {
  // One state object from backend drives all queues in this page.
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notesByRevisionId, setNotesByRevisionId] = useState({})
  const [actionBusyId, setActionBusyId] = useState('')
  const [rowResultByRevisionId, setRowResultByRevisionId] = useState({})
  const [rowErrorByRevisionId, setRowErrorByRevisionId] = useState({})
  const [actionMessage, setActionMessage] = useState('')

  const dictionaryRows = dashboard?.dictionary?.pending_submissions || []
  const dictionaryRereviewRows = dashboard?.dictionary?.pending_rereview || []
  const dictionaryPublishedRows = dashboard?.dictionary?.published_entries || []
  const folkloreRows = dashboard?.folklore?.pending_submissions || []
  const folkloreRereviewRows = dashboard?.folklore?.pending_rereview || []
  const folklorePublishedRows = dashboard?.folklore?.published_entries || []

  const queueSummary = [
    { label: 'Dictionary Pending', value: dictionaryRows.length },
    { label: 'Dictionary Re-review', value: dictionaryRereviewRows.length },
    { label: 'Dictionary Published', value: dictionaryPublishedRows.length },
    { label: 'Folklore Pending', value: folkloreRows.length },
    { label: 'Folklore Re-review', value: folkloreRereviewRows.length },
    { label: 'Folklore Published', value: folklorePublishedRows.length },
  ]

  const hasRows =
    dictionaryRows.length ||
    dictionaryRereviewRows.length ||
    dictionaryPublishedRows.length ||
    folkloreRows.length ||
    folkloreRereviewRows.length ||
    folklorePublishedRows.length

  async function loadDashboard() {
    setLoading(true)
    setError('')
    setActionMessage('')
    try {
      const data = await apiRequest('/api/reviews/dashboard')
      setDashboard(data)
    } catch (requestError) {
      setDashboard(null)
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  function setNotes(revisionId, value) {
    setNotesByRevisionId((prev) => ({
      ...prev,
      [revisionId]: value,
    }))
  }

  function getNotes(revisionId) {
    return notesByRevisionId[revisionId] || ''
  }

  async function submitDecision({ kind, revisionId, decision }) {
    // Backend requires notes for reject/flag, so enforce early in UI.
    const notes = getNotes(revisionId).trim()
    setRowErrorByRevisionId((prev) => ({ ...prev, [revisionId]: '' }))
    if ((decision === 'reject' || decision === 'flag') && !notes) {
      setRowErrorByRevisionId((prev) => ({
        ...prev,
        [revisionId]: 'Reject and flag require notes.',
      }))
      return
    }

    const path =
      kind === 'dictionary'
        ? '/api/reviews/dictionary/submit'
        : '/api/reviews/folklore/submit'

    setActionBusyId(revisionId)
    setError('')
    setActionMessage('')
    try {
      const payload = await apiRequest(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision_id: revisionId,
          decision,
          notes,
        }),
      })
      setRowResultByRevisionId((prev) => ({
        ...prev,
        [revisionId]: {
          // Keep the latest backend-confirmed state visible per row.
          decision,
          revisionStatus: payload.revision_status,
          entryStatus: payload.entry_status,
        },
      }))
      setActionMessage(`Saved ${decision} decision for revision ${revisionId}.`)
      await loadDashboard()
    } catch (requestError) {
      setRowErrorByRevisionId((prev) => ({
        ...prev,
        [revisionId]: requestError.message,
      }))
    } finally {
      setActionBusyId('')
    }
  }

  return (
    <>
      <section className="panel">
        <div className="toolbar">
          <div>
            <h2>Reviewer Dashboard</h2>
            <p className="muted">Review queues load automatically. Use refresh after taking actions or changing test data.</p>
          </div>
          <button disabled={loading} onClick={() => loadDashboard()}>
            {loading ? 'Loading...' : 'Refresh Dashboard'}
          </button>
        </div>
      </section>

      <section className="panel panel-soft">
        <div className="section-heading">
          <div>
            <h3>Step 16.6 Progress</h3>
            <p className="muted">Work through one page at a time. This page validates the toughest backend integration first.</p>
          </div>
        </div>
        <ol className="progress-list" aria-label="Frontend implementation order">
          {IMPLEMENTATION_STEPS.map((step, index) => (
            <li key={step.label} className={`progress-item ${step.status}`}>
              <span className="progress-number">{index + 1}</span>
              <span>{step.label}</span>
              <span className="progress-status">{step.status}</span>
            </li>
          ))}
        </ol>
      </section>

      {error && <div className="alert error">{error}</div>}
      {actionMessage && <div className="alert ok">{actionMessage}</div>}

      {!dashboard && !loading && (
        <section className="panel">
          <p className="muted">Dashboard could not load yet. Check your reviewer/admin access, then refresh.</p>
        </section>
      )}

      {dashboard && (
        <>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h3>Queue Snapshot</h3>
                <p className="muted">Use these counts to confirm every dashboard bucket loaded before taking review actions.</p>
              </div>
            </div>
            <div className="stats-grid">
              {queueSummary.map((item) => (
                <article key={item.label} className="stat-card">
                  <p className="stat-label">{item.label}</p>
                  <p className="stat-value">{item.value}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="grid">
            <QueueSection
              title="Dictionary Pending Submissions"
              rows={dictionaryRows}
              kind="dictionary"
              mode="pending"
              actionBusyId={actionBusyId}
              getNotes={getNotes}
              setNotes={setNotes}
              submitDecision={submitDecision}
              rowErrorByRevisionId={rowErrorByRevisionId}
              rowResultByRevisionId={rowResultByRevisionId}
            />
            <QueueSection
              title="Dictionary Re-review Queue"
              rows={dictionaryRereviewRows}
              kind="dictionary"
              mode="rereview"
              actionBusyId={actionBusyId}
              getNotes={getNotes}
              setNotes={setNotes}
              submitDecision={submitDecision}
              rowErrorByRevisionId={rowErrorByRevisionId}
              rowResultByRevisionId={rowResultByRevisionId}
            />
            <QueueSection
              title="Dictionary Published Entries (Flag Eligible)"
              rows={dictionaryPublishedRows}
              kind="dictionary"
              mode="published"
              actionBusyId={actionBusyId}
              getNotes={getNotes}
              setNotes={setNotes}
              submitDecision={submitDecision}
              rowErrorByRevisionId={rowErrorByRevisionId}
              rowResultByRevisionId={rowResultByRevisionId}
            />
            <QueueSection
              title="Folklore Pending Submissions"
              rows={folkloreRows}
              kind="folklore"
              mode="pending"
              actionBusyId={actionBusyId}
              getNotes={getNotes}
              setNotes={setNotes}
              submitDecision={submitDecision}
              rowErrorByRevisionId={rowErrorByRevisionId}
              rowResultByRevisionId={rowResultByRevisionId}
            />
            <QueueSection
              title="Folklore Re-review Queue"
              rows={folkloreRereviewRows}
              kind="folklore"
              mode="rereview"
              actionBusyId={actionBusyId}
              getNotes={getNotes}
              setNotes={setNotes}
              submitDecision={submitDecision}
              rowErrorByRevisionId={rowErrorByRevisionId}
              rowResultByRevisionId={rowResultByRevisionId}
            />
            <QueueSection
              title="Folklore Published Entries (Flag Eligible)"
              rows={folklorePublishedRows}
              kind="folklore"
              mode="published"
              actionBusyId={actionBusyId}
              getNotes={getNotes}
              setNotes={setNotes}
              submitDecision={submitDecision}
              rowErrorByRevisionId={rowErrorByRevisionId}
              rowResultByRevisionId={rowResultByRevisionId}
            />
          </div>
        </>
      )}

      {dashboard && !hasRows && (
        <section className="panel">
          <p className="muted">No items right now. Create new submissions to continue testing.</p>
        </section>
      )}

      {dashboard?.reviews?.my_reviews?.length > 0 && (
        <section className="panel">
          <h2>My Recent Reviews</h2>
          <ul className="review-list">
            {dashboard.reviews.my_reviews.slice(0, 10).map((review) => (
              <li key={review.review_id}>
                <strong>{review.decision}</strong> on {review.revision_id} | round {review.review_round} | outcome:{' '}
                {review.final_outcome}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

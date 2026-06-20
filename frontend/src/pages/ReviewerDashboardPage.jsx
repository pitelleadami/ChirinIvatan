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

const DECISION_LABELS = {
  approve: 'Approved',
  reject: 'Rejected',
  flag: 'Flagged for re-review',
}

function excludeOwnSubmissions(rows, username) {
  const normalizedUsername = String(username || '')
    .trim()
    .toLowerCase()
  if (!normalizedUsername) return rows
  return rows.filter(
    (row) =>
      String(row.contributor_username || '')
        .trim()
        .toLowerCase() !== normalizedUsername,
  )
}

export default function ReviewerDashboardPage({ currentUser, refreshToken = 0 }) {
  // One state object from backend drives all queues in this page.
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notesByRevisionId, setNotesByRevisionId] = useState({})
  const [actionBusyId, setActionBusyId] = useState('')
  const [rowResultByRevisionId, setRowResultByRevisionId] = useState({})
  const [rowErrorByRevisionId, setRowErrorByRevisionId] = useState({})
  const [reviewToast, setReviewToast] = useState(null)
  // Bumped whenever the result toast is dismissed, so open preview modals close with it.
  const [previewCloseToken, setPreviewCloseToken] = useState(0)

  const currentUsername = currentUser?.username || ''
  const dictionaryRows = excludeOwnSubmissions(
    dashboard?.dictionary?.pending_submissions || [],
    currentUsername,
  )
  const dictionaryRereviewRows = excludeOwnSubmissions(
    dashboard?.dictionary?.pending_rereview || [],
    currentUsername,
  )
  const dictionaryAwaitingRows = dashboard?.dictionary?.awaiting_quorum_after_my_approval || []
  const folkloreRows = excludeOwnSubmissions(dashboard?.folklore?.pending_submissions || [], currentUsername)
  const folkloreRereviewRows = excludeOwnSubmissions(
    dashboard?.folklore?.pending_rereview || [],
    currentUsername,
  )
  const folkloreAwaitingRows = dashboard?.folklore?.awaiting_quorum_after_my_approval || []

  const queueSummary = [
    { label: 'Dictionary Pending', value: dictionaryRows.length },
    { label: 'Dictionary Re-review', value: dictionaryRereviewRows.length },
    { label: 'Folklore Pending', value: folkloreRows.length },
    { label: 'Folklore Re-review', value: folkloreRereviewRows.length },
    { label: 'Awaiting Quorum', value: dictionaryAwaitingRows.length + folkloreAwaitingRows.length },
  ]

  const hasRows =
    dictionaryRows.length ||
    dictionaryRereviewRows.length ||
    dictionaryAwaitingRows.length ||
    folkloreRows.length ||
    folkloreRereviewRows.length ||
    folkloreAwaitingRows.length

  async function loadDashboard() {
    setLoading(true)
    setError('')
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
  }, [refreshToken])

  function dismissReviewToast() {
    setReviewToast(null)
    setPreviewCloseToken((token) => token + 1)
  }

  useEffect(() => {
    if (!reviewToast) return undefined
    const timeoutId = window.setTimeout(() => dismissReviewToast(), 4200)
    return () => window.clearTimeout(timeoutId)
  }, [reviewToast])

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

    const row =
      dictionaryRows.find((item) => item.revision_id === revisionId) ||
      dictionaryRereviewRows.find((item) => item.revision_id === revisionId) ||
      folkloreRows.find((item) => item.revision_id === revisionId) ||
      folkloreRereviewRows.find((item) => item.revision_id === revisionId)
    const targetTitle = kind === 'dictionary' ? row?.term : row?.title
    const path = kind === 'dictionary' ? '/api/reviews/dictionary/submit' : '/api/reviews/folklore/submit'

    setActionBusyId(revisionId)
    setError('')
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
      await loadDashboard()
      const label = DECISION_LABELS[decision] || 'Saved'
      const entryStatus = payload.entry_status ? ` Entry status: ${payload.entry_status}.` : ''
      setReviewToast({
        decision,
        title: `${label}`,
        detail: `${targetTitle || 'Entry'} was updated.${entryStatus}`,
      })
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
        <div className="toolbar reviewer-dashboard-hero">
          <div>
            <h2>Reviewer Dashboard</h2>
          </div>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {reviewToast && (
        <div className={`review-action-toast ${reviewToast.decision}`} role="status" aria-live="polite">
          <div className="review-action-toast-mark" aria-hidden="true" />
          <div className="review-action-toast-copy">
            <strong>{reviewToast.title}</strong>
            <p>{reviewToast.detail}</p>
          </div>
          <button type="button" className="ghost compact-button" onClick={dismissReviewToast}>
            Close
          </button>
        </div>
      )}

      {!dashboard && !loading && (
        <section className="panel">
          <p className="muted">
            Dashboard could not load yet. Check your reviewer/admin access, then refresh.
          </p>
        </section>
      )}

      {dashboard && (
        <>
          <section className="panel">
            <div className="stats-grid reviewer-stats-grid desk-stats">
              {queueSummary.map((item) => (
                <article key={item.label} className="stat-card">
                  <p className="stat-label">{item.label}</p>
                  <p className="stat-value">{item.value}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="review-domain-grid">
            <div className="review-queue-group">
              <div>
                <h3>Dictionary Terms</h3>
              </div>
              <QueueSection
                title="Pending Submissions"
                rows={dictionaryRows}
                kind="dictionary"
                mode="pending"
                actionBusyId={actionBusyId}
                getNotes={getNotes}
                setNotes={setNotes}
                submitDecision={submitDecision}
                rowErrorByRevisionId={rowErrorByRevisionId}
                rowResultByRevisionId={rowResultByRevisionId}
                previewCloseToken={previewCloseToken}
              />
              <QueueSection
                title="Re-review Queue"
                rows={dictionaryRereviewRows}
                kind="dictionary"
                mode="rereview"
                actionBusyId={actionBusyId}
                getNotes={getNotes}
                setNotes={setNotes}
                submitDecision={submitDecision}
                rowErrorByRevisionId={rowErrorByRevisionId}
                rowResultByRevisionId={rowResultByRevisionId}
                previewCloseToken={previewCloseToken}
              />
              <QueueSection
                title="Awaiting Quorum"
                rows={dictionaryAwaitingRows}
                kind="dictionary"
                mode="awaiting"
                actionBusyId={actionBusyId}
                getNotes={getNotes}
                setNotes={setNotes}
                submitDecision={submitDecision}
                rowErrorByRevisionId={rowErrorByRevisionId}
                rowResultByRevisionId={rowResultByRevisionId}
                previewCloseToken={previewCloseToken}
              />
            </div>

            <div className="review-queue-group">
              <div>
                <h3>Folklore Entries</h3>
              </div>
              <QueueSection
                title="Pending Submissions"
                rows={folkloreRows}
                kind="folklore"
                mode="pending"
                actionBusyId={actionBusyId}
                getNotes={getNotes}
                setNotes={setNotes}
                submitDecision={submitDecision}
                rowErrorByRevisionId={rowErrorByRevisionId}
                rowResultByRevisionId={rowResultByRevisionId}
                previewCloseToken={previewCloseToken}
              />
              <QueueSection
                title="Re-review Queue"
                rows={folkloreRereviewRows}
                kind="folklore"
                mode="rereview"
                actionBusyId={actionBusyId}
                getNotes={getNotes}
                setNotes={setNotes}
                submitDecision={submitDecision}
                rowErrorByRevisionId={rowErrorByRevisionId}
                rowResultByRevisionId={rowResultByRevisionId}
                previewCloseToken={previewCloseToken}
              />
              <QueueSection
                title="Awaiting Quorum"
                rows={folkloreAwaitingRows}
                kind="folklore"
                mode="awaiting"
                actionBusyId={actionBusyId}
                getNotes={getNotes}
                setNotes={setNotes}
                submitDecision={submitDecision}
                rowErrorByRevisionId={rowErrorByRevisionId}
                rowResultByRevisionId={rowResultByRevisionId}
                previewCloseToken={previewCloseToken}
              />
            </div>
          </section>
        </>
      )}

      {dashboard && !hasRows && (
        <section className="panel">
          <p className="muted">No items right now. Create new submissions to continue testing.</p>
        </section>
      )}
    </>
  )
}

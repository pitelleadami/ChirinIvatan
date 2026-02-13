import { useMemo, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''

function getCookie(name) {
  const cookieValue = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return cookieValue ? decodeURIComponent(cookieValue.split('=')[1]) : ''
}

async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`
  const headers = {
    ...(options.headers || {}),
  }

  if (options.method && options.method !== 'GET') {
    headers['X-CSRFToken'] = getCookie('csrftoken')
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  })

  let body = {}
  try {
    body = await response.json()
  } catch {
    body = { detail: 'Server returned non-JSON response.' }
  }

  if (!response.ok) {
    throw new Error(body.detail || `Request failed with status ${response.status}`)
  }

  return body
}

function App() {
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

  const hasRows = useMemo(
    () =>
      dictionaryRows.length ||
      dictionaryRereviewRows.length ||
      dictionaryPublishedRows.length ||
      folkloreRows.length ||
      folkloreRereviewRows.length ||
      folklorePublishedRows.length,
    [
      dictionaryRows,
      dictionaryRereviewRows,
      dictionaryPublishedRows,
      folkloreRows,
      folkloreRereviewRows,
      folklorePublishedRows,
    ]
  )

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
    const notes = getNotes(revisionId).trim()
    setRowErrorByRevisionId((prev) => ({ ...prev, [revisionId]: '' }))

    if ((decision === 'reject' || decision === 'flag') && !notes) {
      setRowErrorByRevisionId((prev) => ({
        ...prev,
        [revisionId]: 'Reject and flag require notes.',
      }))
      return
    }

    setActionBusyId(revisionId)
    setError('')
    setActionMessage('')

    const path =
      kind === 'dictionary'
        ? '/api/reviews/dictionary/submit'
        : '/api/reviews/folklore/submit'

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

  function actionHint(mode, row) {
    if (mode === 'published') {
      return 'Published queue: use flag to trigger re-review.'
    }
    if (row.review_round !== undefined) {
      return 'Re-review round: one reject will immediately move entry to rejected.'
    }
    return 'Approve needs quorum: 2 reviewers, or 1 reviewer + 1 admin.'
  }

  function QueueSection({ title, rows, kind, mode }) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        {rows.length === 0 && <p className="muted">No items in this queue.</p>}
        {rows.map((row) => {
          const revisionId = row.revision_id
          const disabled = actionBusyId === revisionId
          const canApprove = mode !== 'published'
          const canReject = mode !== 'published'
          const canFlag = mode === 'published'
          return (
            <article className="queue-card" key={revisionId}>
              <div className="queue-header">
                <strong>{kind === 'dictionary' ? row.term || '(no term)' : row.title || '(no title)'}</strong>
                <span className="badge">{row.status}</span>
              </div>
              <p className="meta">Revision: {revisionId}</p>
              <p className="meta">Entry: {row.entry_id || 'new submission'}</p>
              {row.review_round !== undefined && <p className="meta">Round: {row.review_round}</p>}
              <p className="hint">{actionHint(mode, row)}</p>

              <label className="notes-label" htmlFor={`notes-${revisionId}`}>
                Review notes (required for reject/flag)
              </label>
              <textarea
                id={`notes-${revisionId}`}
                value={getNotes(revisionId)}
                onChange={(event) => setNotes(revisionId, event.target.value)}
                rows={3}
                placeholder="Write why you rejected or flagged this item."
              />

              <div className="actions">
                <button
                  disabled={disabled || !canApprove}
                  onClick={() => submitDecision({ kind, revisionId, decision: 'approve' })}
                  title={canApprove ? '' : 'Approve is for pending/re-review queues.'}
                >
                  Approve
                </button>
                <button
                  className="warning"
                  disabled={disabled || !canReject}
                  onClick={() => submitDecision({ kind, revisionId, decision: 'reject' })}
                  title={canReject ? '' : 'Reject is for pending/re-review queues.'}
                >
                  Reject
                </button>
                <button
                  className="secondary"
                  disabled={disabled || !canFlag}
                  onClick={() => submitDecision({ kind, revisionId, decision: 'flag' })}
                  title={canFlag ? '' : 'Flag is available only in Published Entries.'}
                >
                  Flag for re-review
                </button>
              </div>

              {rowErrorByRevisionId[revisionId] && (
                <p className="inline-error">{rowErrorByRevisionId[revisionId]}</p>
              )}

              {rowResultByRevisionId[revisionId] && (
                <p className="inline-ok">
                  Last action: {rowResultByRevisionId[revisionId].decision} | revision status:{' '}
                  {rowResultByRevisionId[revisionId].revisionStatus || 'n/a'} | entry status:{' '}
                  {rowResultByRevisionId[revisionId].entryStatus || 'n/a'}
                </p>
              )}
            </article>
          )
        })}
      </section>
    )
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>Reviewer Dashboard</h1>
          <p className="muted">
            Login via <code>/admin/</code> first, then click Load Dashboard.
          </p>
          <p className="muted">
            Tip: open <a href="/admin/" target="_blank" rel="noreferrer">/admin/</a> from this same frontend host.
          </p>
          <p className="muted">Use at least two reviewer/admin accounts to complete approval quorum.</p>
        </div>
        <button disabled={loading} onClick={loadDashboard}>
          {loading ? 'Loading...' : 'Load Dashboard'}
        </button>
      </header>

      {error && <div className="alert error">{error}</div>}
      {actionMessage && <div className="alert ok">{actionMessage}</div>}

      {!dashboard && !loading && (
        <section className="panel">
          <h2>Not loaded yet</h2>
          <p className="muted">
            Click Load Dashboard. If you see authentication errors, login in <code>/admin/</code> first.
          </p>
        </section>
      )}

      {dashboard && (
        <div className="grid">
          <QueueSection
            title="Dictionary Pending Submissions"
            rows={dictionaryRows}
            kind="dictionary"
            mode="pending"
          />
          <QueueSection
            title="Dictionary Re-review Queue"
            rows={dictionaryRereviewRows}
            kind="dictionary"
            mode="rereview"
          />
          <QueueSection
            title="Dictionary Published Entries (Flag Eligible)"
            rows={dictionaryPublishedRows}
            kind="dictionary"
            mode="published"
          />
          <QueueSection
            title="Folklore Pending Submissions"
            rows={folkloreRows}
            kind="folklore"
            mode="pending"
          />
          <QueueSection
            title="Folklore Re-review Queue"
            rows={folkloreRereviewRows}
            kind="folklore"
            mode="rereview"
          />
          <QueueSection
            title="Folklore Published Entries (Flag Eligible)"
            rows={folklorePublishedRows}
            kind="folklore"
            mode="published"
          />
        </div>
      )}

      {dashboard && !hasRows && (
        <section className="panel">
          <p className="muted">No pending items right now. Create a new submission to test review flow.</p>
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
    </main>
  )
}

export default App

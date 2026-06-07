/*
  QueueSection.jsx

  Reusable review queue card list used by reviewer dashboard.
  Receives row data + callbacks from parent page.
*/

import { useState } from 'react'

import { folkloreTaxonomyLabel } from '../lib/folkloreTaxonomy'

function actionHint(mode, row) {
  if (mode === 'awaiting') {
    return 'Your approval is recorded. This item is read-only for you while it waits for quorum.'
  }
  if (mode === 'published') {
    return 'This entry is already public. Flag only when it needs another review round.'
  }
  if (row.review_round !== undefined) {
    return 'Re-review round: approve restores confidence; reject moves the public entry to rejected.'
  }
  return ''
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

function previewRows(kind, row) {
  const preview = row.preview || {}
  const rows = kind === 'dictionary'
    ? [
        ['Meaning', preview.meaning],
        ['Part of Speech', preview.part_of_speech],
        ['Phonetic', preview.phonetic],
        ['Pronunciation', preview.pronunciation],
        ['Example', preview.example_sentence],
        ['Translation', preview.example_translation],
        ['Usage Notes', preview.usage_notes],
        ['Source', preview.source],
      ]
    : [
        ['Category', folkloreTaxonomyLabel(row.category, row.subcategory)],
        ['Municipality', preview.municipality_source],
        ['Content', preview.content],
        ['Source', preview.source],
        ['Media Source', preview.media_source],
        ['License', preview.copyright_usage],
      ]
  return rows.filter(([, value]) => String(value || '').trim())
}

export default function QueueSection({
  title,
  rows,
  kind,
  mode,
  actionBusyId,
  getNotes,
  setNotes,
  submitDecision,
  rowErrorByRevisionId,
  rowResultByRevisionId,
}) {
  const [rejectNotesOpenById, setRejectNotesOpenById] = useState({})
  const [flagNotesOpenById, setFlagNotesOpenById] = useState({})
  const [awaitingOpenById, setAwaitingOpenById] = useState({})
  const [awaitingSectionOpen, setAwaitingSectionOpen] = useState(false)
  const isAwaitingSection = mode === 'awaiting'

  function rejectNotesOpen(revisionId) {
    return Boolean(rejectNotesOpenById[revisionId])
  }

  function flagNotesOpen(revisionId) {
    return Boolean(flagNotesOpenById[revisionId])
  }

  function handleReject({ revisionId, kind }) {
    if (!rejectNotesOpen(revisionId)) {
      setRejectNotesOpenById((current) => ({ ...current, [revisionId]: true }))
      return
    }
    submitDecision({ kind, revisionId, decision: 'reject' })
  }

  function handleFlag({ revisionId, kind }) {
    if (!flagNotesOpen(revisionId)) {
      setFlagNotesOpenById((current) => ({ ...current, [revisionId]: true }))
      return
    }
    submitDecision({ kind, revisionId, decision: 'flag' })
  }

  return (
    <section className={isAwaitingSection ? 'review-queue-panel review-queue-panel-awaiting' : 'review-queue-panel'}>
      {isAwaitingSection ? (
        <button
          type="button"
          className="queue-section-toggle"
          aria-expanded={awaitingSectionOpen}
          onClick={() => setAwaitingSectionOpen((current) => !current)}
        >
          <h2>{title}</h2>
          <span className="queue-section-toggle-end">
            <span className="badge">{rows.length}</span>
            <span className="queue-awaiting-chevron" aria-hidden="true">
              {awaitingSectionOpen ? '−' : '+'}
            </span>
          </span>
        </button>
      ) : (
        <div className="queue-section-heading">
          <h2>{title}</h2>
          <span className="badge">{rows.length}</span>
        </div>
      )}
      {(!isAwaitingSection || awaitingSectionOpen) && rows.length === 0 && (
        <p className="muted queue-empty-message">No items in this queue.</p>
      )}
      {(!isAwaitingSection || awaitingSectionOpen) && rows.map((row) => {
        const revisionId = row.revision_id
        const disabled = actionBusyId === revisionId
        const isAwaiting = mode === 'awaiting'
        const awaitingOpen = Boolean(awaitingOpenById[revisionId])
        const canApprove = mode !== 'published' && mode !== 'awaiting'
        const canReject = mode !== 'published' && mode !== 'awaiting'
        const canFlag = mode === 'published'
        const titleText = kind === 'dictionary' ? row.term || '(no term)' : row.title || '(no title)'
        return (
          <article className={isAwaiting ? 'queue-card queue-card-awaiting' : 'queue-card'} key={revisionId}>
            {isAwaiting ? (
              <button
                type="button"
                className="queue-awaiting-toggle"
                aria-expanded={awaitingOpen}
                onClick={() => setAwaitingOpenById((current) => ({
                  ...current,
                  [revisionId]: !current[revisionId],
                }))}
              >
                <span>
                  <strong>{titleText}</strong>
                  <small>
                    Your approval is recorded · {row.quorum_requirement}
                  </small>
                </span>
                <span className="queue-awaiting-toggle-end">
                  <span className={`badge status-${row.status}`}>{row.status}</span>
                  <span className="queue-awaiting-chevron" aria-hidden="true">
                    {awaitingOpen ? '−' : '+'}
                  </span>
                </span>
              </button>
            ) : (
              <div className="queue-header">
                <strong>{titleText}</strong>
                <span className={`badge status-${row.status}`}>{row.status}</span>
              </div>
            )}

            {(!isAwaiting || awaitingOpen) && (
              <>
                <p className="meta">
                  By @{row.contributor_username}
                  {row.created_at ? ` | submitted ${formatDate(row.created_at)}` : ''}
                  {row.approved_at ? ` | approved ${formatDate(row.approved_at)}` : ''}
                </p>
                {row.entry_status && <p className="meta">Entry status: {row.entry_status}</p>}
                {row.review_round !== undefined && <p className="meta">Round: {row.review_round}</p>}
                {actionHint(mode, row) && <p className="hint">{actionHint(mode, row)}</p>}
              </>
            )}
            {isAwaiting && awaitingOpen && (
              <div className="queue-quorum-status" role="status">
                <strong>Awaiting quorum</strong>
                <span>
                  {row.reviewer_approvals || 0} reviewer approval
                  {row.reviewer_approvals === 1 ? '' : 's'} · {row.admin_approvals || 0} admin approval
                  {row.admin_approvals === 1 ? '' : 's'}
                </span>
                <small>{row.quorum_requirement}</small>
              </div>
            )}

            {(!isAwaiting || awaitingOpen) && previewRows(kind, row).length > 0 && (
              <dl className="queue-preview-list">
                {previewRows(kind, row).map(([label, value]) => (
                  <div key={label} className="queue-preview-row">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {(!isAwaiting || awaitingOpen) && row.entry_id && (
              <p className="queue-detail-link-row">
                <a href={kind === 'dictionary' ? `/dictionary-view?entry_id=${row.entry_id}` : `/folklore-view?entry_id=${row.entry_id}`}>
                  View actual item
                </a>
              </p>
            )}

            {(!isAwaiting || awaitingOpen) && (
              <details className="technical-details">
                <summary>Technical reference</summary>
                <p className="meta">Revision: {revisionId}</p>
                <p className="meta">Entry: {row.entry_id || 'new submission'}</p>
              </details>
            )}

            <div className="actions">
              {canApprove && (
                <button
                  disabled={disabled}
                  onClick={() => submitDecision({ kind, revisionId, decision: 'approve' })}
                >
                  Approve
                </button>
              )}
              {canReject && (
                <button
                  className="warning"
                  disabled={disabled}
                  onClick={() => handleReject({ kind, revisionId })}
                >
                  {rejectNotesOpen(revisionId) ? 'Submit Reject' : 'Reject'}
                </button>
              )}
              {canFlag && (
                <button
                  className="secondary"
                  disabled={disabled}
                  onClick={() => handleFlag({ kind, revisionId })}
                >
                  {flagNotesOpen(revisionId) ? 'Submit Flag' : 'Flag for re-review'}
                </button>
              )}
            </div>

            {canFlag && flagNotesOpen(revisionId) && (
              <>
                <label className="notes-label" htmlFor={`notes-${revisionId}`}>
                  Flag notes (required)
                </label>
                <textarea
                  id={`notes-${revisionId}`}
                  value={getNotes(revisionId)}
                  onChange={(event) => setNotes(revisionId, event.target.value)}
                  rows={3}
                  placeholder="Explain why this published entry needs re-review."
                />
              </>
            )}

            {canReject && rejectNotesOpen(revisionId) && (
              <>
                <label className="notes-label" htmlFor={`notes-${revisionId}`}>
                  Review notes (required for reject)
                </label>
                <textarea
                  id={`notes-${revisionId}`}
                  value={getNotes(revisionId)}
                  onChange={(event) => setNotes(revisionId, event.target.value)}
                  rows={3}
                  placeholder="Write notes for rejection or reviewer context."
                />
              </>
            )}

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

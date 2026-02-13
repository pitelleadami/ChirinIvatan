function actionHint(mode, row) {
  if (mode === 'published') {
    return 'Published queue: use flag to trigger re-review.'
  }
  if (row.review_round !== undefined) {
    return 'Re-review round: one reject will immediately move entry to rejected.'
  }
  return 'Approve needs quorum: 2 reviewers, or 1 reviewer + 1 admin.'
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
            {row.entry_status && <p className="meta">Entry status: {row.entry_status}</p>}
            {row.review_round !== undefined && <p className="meta">Round: {row.review_round}</p>}
            <p className="hint">{actionHint(mode, row)}</p>

            {row.entry_id && kind === 'dictionary' && (
              <p className="meta">
                <a href={`/dictionary-view?entry_id=${row.entry_id}`}>Open dictionary detail</a>
              </p>
            )}
            {row.entry_id && kind === 'folklore' && (
              <p className="meta">
                <a href={`/folklore-view?entry_id=${row.entry_id}`}>Open folklore detail</a>
              </p>
            )}

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

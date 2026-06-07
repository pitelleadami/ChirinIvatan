export default function ArchiveEntryDialog({
  open,
  title,
  notes,
  busy,
  onNotesChange,
  onCancel,
  onConfirm,
}) {
  if (!open) return null

  return (
    <div
      className="admin-archive-action-backdrop"
      role="presentation"
      onClick={busy ? undefined : onCancel}
    >
      <section
        className="admin-archive-action-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-archive-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <div>
            <p className="profile-kicker">Admin Action</p>
            <h2 id="entry-archive-dialog-title">Archive entry?</h2>
          </div>
          <button type="button" className="ghost compact-button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
        <p><strong>{title}</strong></p>
        <p className="muted">
          This removes the entry from public use while preserving its content, attribution, and audit history.
        </p>
        <form className="admin-archive-action-form" onSubmit={onConfirm}>
          <label className="field" htmlFor="entry-archive-notes">
            <span>Admin notes *</span>
            <textarea
              id="entry-archive-notes"
              rows={4}
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Explain why this entry should be archived."
              required
            />
          </label>
          <button type="submit" className="danger" disabled={busy}>
            {busy ? 'Archiving...' : 'Archive Entry'}
          </button>
        </form>
      </section>
    </div>
  )
}

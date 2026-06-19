export default function ConfirmDialog({
  open,
  title,
  message,
  detail = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busyLabel = 'Working...',
  busy = false,
  onCancel,
  onConfirm,
}) {
  if (!open) return null

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={busy ? undefined : onCancel}>
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-icon" aria-hidden="true">
          !
        </div>
        <div>
          <p className="profile-kicker">Confirm action</p>
          <h2 id="confirm-dialog-title">{title}</h2>
          <p id="confirm-dialog-message">{message}</p>
          {detail && <p className="confirm-dialog-detail">{detail}</p>}
        </div>
        <div className="confirm-dialog-actions">
          <button className="ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="danger" disabled={busy} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

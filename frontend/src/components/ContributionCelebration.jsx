export default function ContributionCelebration({ celebration, onClose }) {
  if (!celebration) return null

  return (
    <div className="celebration-backdrop" role="presentation">
      <section
        className={celebration.isMilestone ? 'celebration-modal milestone' : 'celebration-modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        aria-describedby="celebration-message"
      >
        <div className="celebration-burst" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="profile-kicker">{celebration.eyebrow}</p>
        <h2 id="celebration-title">{celebration.title}</h2>
        <p id="celebration-message">{celebration.message}</p>
        <div className="celebration-stats" aria-label="Contribution celebration details">
          <span>{celebration.badge}</span>
          <span>{celebration.count} submitted</span>
        </div>
        <button onClick={onClose}>Continue</button>
      </section>
    </div>
  )
}

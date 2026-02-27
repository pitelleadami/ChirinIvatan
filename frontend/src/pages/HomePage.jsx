/*
  HomePage.jsx

  Intro/landing content for internal console users.
  Keeps orientation text and direct workflow hints in one place.
*/

const QUICK_STEPS = [
  {
    title: 'Review Workflows',
    text: 'Use Reviewer Dashboard to approve, reject, and flag dictionary or folklore revisions.',
  },
  {
    title: 'Inspect Public Payloads',
    text: 'Open Dictionary Viewer and Folklore Viewer with entry UUIDs for exact output checks.',
  },
  {
    title: 'Create Contributor Drafts',
    text: 'Use Folklore Draft Builder to create, update, and submit revisions with file uploads.',
  },
  {
    title: 'Check Profiles and Rankings',
    text: 'Use Public Profile and Leaderboards pages to inspect accountability, levels, badges, and municipality standings.',
  },
]

export default function HomePage() {
  return (
    <>
      {/* High-level project context so first-time users know what this app is for. */}
      <section className="hero panel panel-soft">
        <h1>About this project</h1>
        <p className="hero-lead">
          Chirin Ivatan is a community-built archive and dictionary for Ivatan language and folklore. This console
          helps reviewers and contributors execute SPEC-03 workflows reliably.
        </p>
        <p className="muted">
          Priority in this interface is operational clarity: queue visibility, strict review decisions, and transparent
          state changes across dictionary and folklore entries.
        </p>
      </section>

      <section className="panel">
        <h2>Start Here</h2>
        {/* Quick cards map directly to the 3 main workflows in this console. */}
        <div className="step-grid">
          {QUICK_STEPS.map((step) => (
            <article key={step.title} className="step-card">
              <h3>{step.title}</h3>
              <p className="muted">{step.text}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

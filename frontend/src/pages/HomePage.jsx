export default function HomePage() {
  return (
    <section className="panel">
      <h2>Start Here</h2>
      <ol>
        <li>Use Admin Login and sign in as needed (reviewer/admin for dashboard).</li>
        <li>Use Reviewer Dashboard for approve/reject/flag actions.</li>
        <li>Use Dictionary Viewer to inspect public entry payloads by entry UUID.</li>
        <li>Use Folklore Draft Builder to create/edit/submit contributor revisions.</li>
      </ol>
      <p className="muted">Notes are required for reject and flag decisions.</p>
    </section>
  )
}

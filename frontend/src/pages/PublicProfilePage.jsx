/*
  PublicProfilePage.jsx

  Profile payload viewer:
  - contributor stats
  - onboarding accountability lines
  - gamification blocks
*/

import { useState } from 'react'

import { apiRequest } from '../lib/api'

function SummaryCard({ label, value }) {
  return (
    <article className="stat-card">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </article>
  )
}

export default function PublicProfilePage() {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)

  async function loadProfile() {
    const value = username.trim()
    if (!value) {
      setError('Enter a username first.')
      return
    }

    setLoading(true)
    setError('')
    setProfile(null)

    try {
      // This endpoint already returns profile + contribution + gamification blocks.
      const payload = await apiRequest(`/api/users/${value}`)
      setProfile(payload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Public Profile Viewer</h2>
        <p className="muted">Load a user profile by username to inspect contributions, accountability, and gamification.</p>
        <div className="field">
          <label htmlFor="profile-username">Username</label>
          <input
            id="profile-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="e.g. profile_user"
          />
        </div>
        <button disabled={loading} onClick={loadProfile}>
          {loading ? 'Loading...' : 'Load Profile'}
        </button>
      </section>

      {error && <section className="alert error">{error}</section>}

      {profile && (
        <>
          <section className="panel">
            <h3>Profile Header</h3>
            <p className="meta">Username: {profile.header?.username}</p>
            <p className="meta">Municipality: {profile.header?.municipality || '-'}</p>
            <p className="meta">Affiliation: {profile.header?.affiliation || '-'}</p>
            <p className="meta">Occupation: {profile.header?.occupation || '-'}</p>
            <p className="meta">
              Contributor Accountability: {profile.header?.onboarding_accountability?.contributor || '-'}
            </p>
            <p className="meta">Reviewer Accountability: {profile.header?.onboarding_accountability?.reviewer || '-'}</p>
          </section>

          <section className="panel">
            <h3>Contribution Summary</h3>
            <div className="stats-grid">
              <SummaryCard label="Dictionary Terms" value={profile.contribution_summary?.dictionary_terms || 0} />
              <SummaryCard label="Folklore Entries" value={profile.contribution_summary?.folklore_entries || 0} />
              <SummaryCard label="Revisions" value={profile.contribution_summary?.revisions || 0} />
              <SummaryCard label="Total Contributions" value={profile.contribution_summary?.total_contributions || 0} />
            </div>
          </section>

          <section className="panel">
            <h3>Gamification</h3>
            <p className="meta">{profile.gamification?.language?.headline || '-'}</p>
            <p className="meta">
              Contributor Level: {profile.gamification?.contributor_level?.title || '-'} (
              {profile.gamification?.contributor_level?.current_count || 0})
            </p>
            <p className="meta">
              Reviewer Level: {profile.gamification?.reviewer_level?.title || '-'} (
              {profile.gamification?.reviewer_level?.current_count || 0})
            </p>

            <h4>Dictionary Badges</h4>
            <div className="badge-grid">
              {(profile.gamification?.dictionary_badges || []).map((badge) => (
                <article key={badge.key} className={badge.unlocked ? 'badge-card unlocked' : 'badge-card'}>
                  <p className="stat-label">{badge.name}</p>
                  <p className="meta">
                    {badge.current_value}/{badge.threshold}
                  </p>
                </article>
              ))}
            </div>

            <h4>Folklore Badges</h4>
            <div className="badge-grid">
              {(profile.gamification?.folklore_badges || []).map((badge) => (
                <article key={badge.key} className={badge.unlocked ? 'badge-card unlocked' : 'badge-card'}>
                  <p className="stat-label">{badge.name}</p>
                  <p className="meta">
                    {badge.current_value}/{badge.threshold}
                  </p>
                </article>
              ))}
            </div>

            <h4>Quality Badge</h4>
            <div className="badge-grid">
              {(profile.gamification?.quality_badges || []).map((badge) => (
                <article key={badge.key} className={badge.unlocked ? 'badge-card unlocked' : 'badge-card'}>
                  <p className="stat-label">{badge.name}</p>
                  <p className="meta">
                    {badge.current_value}/{badge.threshold} | rejections: {badge.rejection_count}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>Public Contribution Lists</h3>
            <h4>Approved Mother Terms</h4>
            {(profile.lists?.approved_mother_terms || []).length === 0 && <p className="muted">No approved mother terms yet.</p>}
            {(profile.lists?.approved_mother_terms || []).map((item) => (
              <article key={item.entry_id} className="queue-card">
                <p className="meta">
                  {item.term} ({item.status})
                </p>
              </article>
            ))}

            <h4>Approved Folklore Entries</h4>
            {(profile.lists?.approved_folklore_entries || []).length === 0 && (
              <p className="muted">No approved folklore entries yet.</p>
            )}
            {(profile.lists?.approved_folklore_entries || []).map((item) => (
              <article key={item.entry_id} className="queue-card">
                <p className="meta">
                  {item.title} ({item.status})
                </p>
              </article>
            ))}

            <h4>Entries Revised</h4>
            {(profile.lists?.entries_revised || []).length === 0 && <p className="muted">No revised entries yet.</p>}
            {(profile.lists?.entries_revised || []).map((item) => (
              <article key={item.entry_id} className="queue-card">
                <p className="meta">
                  {item.term} ({item.status})
                </p>
              </article>
            ))}
          </section>
        </>
      )}
    </>
  )
}

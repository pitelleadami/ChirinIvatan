/*
  PublicProfilePage.jsx

  Profile payload viewer:
  - contributor stats
  - onboarding accountability lines
  - gamification blocks
*/

import { useEffect, useState } from 'react'

import SampleProfilePhoto from '../components/SampleProfilePhoto'
import { apiRequest } from '../lib/api'
import { getSamplePublicProfile } from '../lib/sampleProfiles'
import { ROUTES, navigate } from '../lib/router'

function SummaryCard({ label, value }) {
  return (
    <article className="stat-card">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </article>
  )
}

function ProfileAvatar({ profile }) {
  const username = profile.header?.username || 'CI'
  if (profile.header?.profile_photo) {
    return <img className="public-profile-avatar" src={profile.header.profile_photo} alt="" />
  }
  if (Number.isInteger(profile.header?.sample_profile_photo_index)) {
    return <SampleProfilePhoto className="public-profile-avatar" index={profile.header.sample_profile_photo_index} />
  }
  return (
    <div className="public-profile-avatar public-profile-avatar-fallback" aria-hidden="true">
      {username.slice(0, 2).toUpperCase()}
    </div>
  )
}

function ContributionList({ title, emptyText, items, getLabel }) {
  return (
    <div className="public-profile-list">
      <h4>{title}</h4>
      {items.length === 0 && <p className="muted">{emptyText}</p>}
      {items.map((item) => (
        <article key={item.entry_id} className="queue-card">
          <p className="meta">{getLabel(item)}</p>
        </article>
      ))}
    </div>
  )
}

export default function PublicProfilePage({ currentUser }) {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [locationSearch, setLocationSearch] = useState(window.location.search)

  async function loadProfile(explicitUsername = null) {
    const value = (explicitUsername || username).trim()
    if (!value) {
      setError('Enter a username first.')
      return
    }
    if (explicitUsername && explicitUsername !== username) {
      setUsername(explicitUsername)
    }

    setLoading(true)
    setError('')
    setProfile(null)

    try {
      // This endpoint already returns profile + contribution + gamification blocks.
      const payload = await apiRequest(`/api/users/${value}`)
      setProfile(payload)
    } catch (requestError) {
      const sampleProfile = getSamplePublicProfile(value)
      if (sampleProfile) {
        setProfile(sampleProfile)
      } else {
        setError(requestError.message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    function handleLocationChange() {
      setLocationSearch(window.location.search)
    }

    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

  useEffect(() => {
    const queryUsername = new URLSearchParams(locationSearch).get('username')
    if (queryUsername) {
      loadProfile(queryUsername)
    } else if (currentUser?.is_authenticated) {
      loadProfile(currentUser.username)
    }
    // Run once at mount for direct deep-link profile navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username, locationSearch])

  const isOwnProfile = currentUser?.is_authenticated && profile?.header?.username === currentUser.username
  const fullName = [profile?.header?.first_name, profile?.header?.last_name].filter(Boolean).join(' ').trim()

  return (
    <div className="public-profile-page">
      <section className="public-profile-search">
        <div>
          <h2>Public Profiles</h2>
          <p className="muted">Search by username or open your own public profile from the top bar.</p>
        </div>
        <div className="public-profile-search-row">
          <input
            id="profile-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
          />
          <button disabled={loading} onClick={() => loadProfile()}>
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>
      </section>

      {error && <section className="alert error">{error}</section>}

      {profile && (
        <>
          <section className="public-profile-hero">
            <ProfileAvatar profile={profile} />
            <div className="public-profile-headline">
              <p className="profile-kicker">{profile.header?.municipality || 'Ivatan community member'}</p>
              <h1>{fullName || profile.header?.username}</h1>
              <p className="public-profile-username">@{profile.header?.username}</p>
              <p className="public-profile-bio">{profile.header?.bio || 'No bionote has been added yet.'}</p>
              <div className="public-profile-tags">
                <span>{profile.header?.occupation || 'Occupation not set'}</span>
                <span>{profile.header?.affiliation || 'Affiliation not set'}</span>
                <span>Joined {profile.header?.joined_date || '-'}</span>
              </div>
            </div>
            {isOwnProfile && (
              <button className="public-profile-edit" onClick={() => navigate(ROUTES.profileEdit)}>
                Edit Profile
              </button>
            )}
          </section>

          <section className="public-profile-section">
            <h3>Contribution Summary</h3>
            <div className="stats-grid">
              <SummaryCard label="Dictionary Terms" value={profile.contribution_summary?.dictionary_terms || 0} />
              <SummaryCard label="Folklore Entries" value={profile.contribution_summary?.folklore_entries || 0} />
              <SummaryCard label="Revisions" value={profile.contribution_summary?.revisions || 0} />
              <SummaryCard label="Total Contributions" value={profile.contribution_summary?.total_contributions || 0} />
            </div>
          </section>

          <section className="public-profile-section">
            <h3>Community Standing</h3>
            <div className="profile-level-grid">
              <article>
                <p className="stat-label">Contributor Level</p>
                <p className="stat-value">{profile.gamification?.contributor_level?.title || '-'}</p>
                <p className="meta">{profile.gamification?.contributor_level?.current_count || 0} contributions</p>
              </article>
              <article>
                <p className="stat-label">Reviewer Level</p>
                <p className="stat-value">{profile.gamification?.reviewer_level?.title || '-'}</p>
                <p className="meta">{profile.gamification?.reviewer_level?.current_count || 0} reviews</p>
              </article>
            </div>

            <p className="meta">{profile.gamification?.language?.headline || '-'}</p>
            <p className="meta">Contributor Accountability: {profile.header?.onboarding_accountability?.contributor || '-'}</p>
            <p className="meta">Reviewer Accountability: {profile.header?.onboarding_accountability?.reviewer || '-'}</p>

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

          <section className="public-profile-section">
            <h3>Public Contribution Lists</h3>
            <div className="public-profile-lists-grid">
              <ContributionList
                title="Approved Mother Terms"
                emptyText="No approved mother terms yet."
                items={profile.lists?.approved_mother_terms || []}
                getLabel={(item) => `${item.term} (${item.status})`}
              />
              <ContributionList
                title="Approved Folklore Entries"
                emptyText="No approved folklore entries yet."
                items={profile.lists?.approved_folklore_entries || []}
                getLabel={(item) => `${item.title} (${item.status})`}
              />
              <ContributionList
                title="Entries Revised"
                emptyText="No revised entries yet."
                items={profile.lists?.entries_revised || []}
                getLabel={(item) => `${item.term} (${item.status})`}
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

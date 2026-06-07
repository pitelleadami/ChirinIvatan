/*
  PublicProfilePage.jsx

  Profile payload viewer:
  - contributor stats
  - onboarding accountability lines
  - gamification blocks
*/

import { useEffect, useState } from 'react'

import { apiRequest } from '../lib/api'
import { getBadgeImageByKey } from '../lib/badgeImages'
import { getMunicipalityFlag } from '../lib/municipalityFlags'
import { copyShareText, openSocialShare, shareWithNative } from '../lib/socialShare'
import { ROUTES, navigate } from '../lib/router'

function SummaryItem({ label, value }) {
  return (
    <article className="contribution-inline-item">
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
    </article>
  )
}

function ProfileAvatar({ profile }) {
  const username = profile.header?.username || 'CI'
  if (profile.header?.profile_photo) {
    return <img className="public-profile-avatar" src={profile.header.profile_photo} alt="" />
  }
  return (
    <div className="public-profile-avatar public-profile-avatar-fallback" aria-hidden="true">
      {username.slice(0, 2).toUpperCase()}
    </div>
  )
}

function AffiliationRows({ title, rows, firstKey, secondKey }) {
  const visibleRows = (rows || []).filter((row) => row?.[firstKey] || row?.[secondKey])
  if (!visibleRows.length) return null
  return (
    <div className="public-profile-affiliations-group">
      {visibleRows.map((row, index) => (
        <p key={`${title}-${index}`} className="public-profile-affiliation-line">
          {[row[firstKey], row[secondKey]].filter(Boolean).join(', ')}
        </p>
      ))}
    </div>
  )
}

function ContributionList({ title, emptyText, items, getLabel }) {
  return (
    <div className="public-profile-list">
      <h4>{title}</h4>
      {items.length === 0 && <p className="muted">{emptyText}</p>}
      {items.map((item) => (
        <article key={item.entry_id} className="public-profile-entry-row">
          <p>{getLabel(item)}</p>
        </article>
      ))}
    </div>
  )
}

function nameWithPostNominals(firstName, lastName, postNominals) {
  const baseName = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (baseName && postNominals) return `${baseName}, ${postNominals}`
  return baseName || postNominals || ''
}

function badgeProgressPercent(badge) {
  const currentValue = Number(badge.current_value) || 0
  const threshold = Number(badge.threshold) || 0
  if (threshold <= 0) return badge.unlocked ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((currentValue / threshold) * 100)))
}

function allBadgesFromProfile(profile) {
  return [
    ...(profile?.gamification?.dictionary_badges || []).map((badge) => ({ ...badge, category: 'Dictionary' })),
    ...(profile?.gamification?.folklore_badges || []).map((badge) => ({ ...badge, category: 'Folklore' })),
    ...(profile?.gamification?.quality_badges || []).map((badge) => ({ ...badge, category: 'Quality' })),
  ]
}

function badgeSortValue(badge) {
  if (badge.unlocked_at) {
    const parsed = Date.parse(badge.unlocked_at)
    if (Number.isFinite(parsed)) return parsed
  }
  return Number(badge.threshold) || 0
}

function nextInProgressBadgesByCategory(badges) {
  const categoryOrder = ['Dictionary', 'Folklore', 'Quality']
  const rowsByCategory = new Map()
  badges
    .filter((badge) => !badge.unlocked)
    .sort((a, b) => badgeSortValue(a) - badgeSortValue(b))
    .forEach((badge) => {
      if (!rowsByCategory.has(badge.category)) {
        rowsByCategory.set(badge.category, badge)
      }
    })

  return categoryOrder
    .map((category) => rowsByCategory.get(category))
    .filter(Boolean)
}

function contributionTotal(summary) {
  return Number(summary?.total_contributions) || 0
}

function formatBadgeDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  })
}

const BADGE_TITLE_BY_KEY = {
  word_contributor: 'Word Contributor',
  lexicon_builder: 'Lexicon Builder',
  language_preserver: 'Language Preserver',
  dictionary_steward: 'Dictionary Steward',
  master_lexicon_keeper: 'Master Lexicon Keeper',
  story_contributor: 'Story Contributor',
  folklore_weaver: 'Folklore Weaver',
  tradition_keeper: 'Tradition Keeper',
  cultural_narrator: 'Cultural Narrator',
  oral_historian: 'Oral Historian',
  accuracy_champion: 'Accuracy Champion',
  dictionary_seed: 'Word Contributor',
  dictionary_grove: 'Lexicon Builder',
  folklore_voice: 'Story Contributor',
  folklore_keeper: 'Folklore Weaver',
  quality_steward: 'Accuracy Champion',
}

function getBadgeDisplayName(badge) {
  const normalizedKey = String(badge?.key || '').replace(/-/g, '_')
  return BADGE_TITLE_BY_KEY[normalizedKey] || badge?.name || 'Badge'
}

function badgeRequirementText(badge) {
  const threshold = Number(badge.threshold) || 0
  if (badge.category === 'Dictionary') {
    return `Approve ${threshold} original dictionary ${threshold === 1 ? 'term' : 'terms'} as your contribution.`
  }
  if (badge.category === 'Folklore') {
    return `Approve ${threshold} original folklore ${threshold === 1 ? 'entry' : 'entries'} as your contribution.`
  }
  if (badge.category === 'Quality') {
    return `Reach ${threshold} approved contributions with no rejected submissions.`
  }
  return `Reach ${threshold} approved contributions.`
}

function achievementGroupsFromBadges(badges) {
  return ['Dictionary', 'Folklore', 'Quality']
    .map((category) => ({
      category,
      badges: badges
        .filter((badge) => badge.category === category)
        .sort((a, b) => (Number(a.threshold) || 0) - (Number(b.threshold) || 0)),
    }))
    .filter((group) => group.badges.length)
}

function displayActorName(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.includes('.') || raw.includes('_') || raw.includes('-')) {
    const parts = raw.replace(/[_-]/g, '.').split('.').map((item) => item.trim()).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0].slice(0, 1).toUpperCase()}. ${parts[parts.length - 1].slice(0, 1).toUpperCase()}${parts[parts.length - 1].slice(1)}`
    }
  }
  return raw
}

function summarizeAccountability(label) {
  const value = String(label || '').trim()
  if (!value) return ''
  const match = value.match(/^(Approved|Invited)\s+as\s+.+?\s+by\s+(.+)$/i)
  const simpleMatch = value.match(/^(Approved|Invited)\s+by\s+(.+)$/i)
  const target = match || simpleMatch
  if (!target) return ''
  const action = target[1].toLowerCase() === 'approved' ? 'Approved by' : 'Invited by'
  const names = target[2]
    .split(/\s+and\s+/i)
    .map((name) => displayActorName(name))
    .filter(Boolean)
  return `${action} ${names.join(' and ')}`
}

function BadgeCard({ badge, category = 'Badge', allowShare = false, onShare = null, showRequirement = false }) {
  const image = getBadgeImageByKey(badge.key)
  const progressPercent = badgeProgressPercent(badge)
  const displayName = getBadgeDisplayName(badge)
  const statusLabel = 'In progress'
  const qualityNote = badge.rejection_count !== undefined ? `Rejections: ${badge.rejection_count}` : ''
  const unlockedDate = formatBadgeDate(badge.unlocked_at)

  return (
    <article className={badge.unlocked ? 'badge-card unlocked' : 'badge-card'}>
      <div className="badge-card-media" aria-hidden={!image}>
        {image ? (
          <img className="badge-card-image" src={image} alt="" loading="lazy" />
        ) : (
          <span className="badge-card-fallback">{displayName.slice(0, 1)}</span>
        )}
      </div>
      {badge.unlocked && (
        <div className="badge-card-caption">
          <h5>{displayName}</h5>
          <p>{unlockedDate || 'Unlocked'}</p>
        </div>
      )}
      <div className="badge-card-body">
        <div className="badge-card-title-row">
          <div>
            <p className="badge-card-category">{category}</p>
            <h5>{displayName}</h5>
          </div>
          {!badge.unlocked && <span className="badge-status">{statusLabel}</span>}
        </div>
        {!badge.unlocked && (
          <>
            {showRequirement && <p className="badge-requirement">{badgeRequirementText({ ...badge, category })}</p>}
            <div className="badge-progress-row">
              <span>
                {badge.current_value}/{badge.threshold}
              </span>
              {qualityNote && <span>{qualityNote}</span>}
            </div>
            <div className="badge-progress-track" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </>
        )}
        {badge.unlocked && allowShare && (
          <div className="badge-share-row">
            <button type="button" className="ghost compact-button" onClick={() => onShare?.('native', badge)}>
              Share
            </button>
            <button type="button" className="ghost compact-button" onClick={() => onShare?.('facebook', badge)}>
              Facebook
            </button>
            <button type="button" className="ghost compact-button" onClick={() => onShare?.('x', badge)}>
              X
            </button>
            <button type="button" className="ghost compact-button" onClick={() => onShare?.('copy', badge)}>
              Copy
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

function AchievementShelf({ group, expanded, onToggle = null, allowShare, onShare }) {
  const unlockedCount = group.badges.filter((badge) => badge.unlocked).length
  const visibleBadges = expanded ? group.badges : group.badges.slice(0, 5)
  const canToggle = Boolean(onToggle) && (group.badges.length > visibleBadges.length || expanded)

  return (
    <section className="achievement-shelf">
      <div className="achievement-shelf-heading">
        <div>
          <h4>{group.category}</h4>
          <p>{unlockedCount} of {group.badges.length} unlocked</p>
        </div>
        {canToggle && (
          <button type="button" className="ghost compact-button" onClick={onToggle}>
            {expanded ? 'Show less' : 'View all'}
          </button>
        )}
      </div>
      <div className="achievement-badge-row">
        {visibleBadges.map((badge) => (
          <BadgeCard
            key={badge.key}
            badge={badge}
            category={group.category}
            allowShare={allowShare}
            onShare={onShare}
            showRequirement
          />
        ))}
      </div>
    </section>
  )
}

export default function PublicProfilePage({ currentUser }) {
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [locationSearch, setLocationSearch] = useState(window.location.search)
  const [shareFeedback, setShareFeedback] = useState('')
  const [leaderboardUpdating, setLeaderboardUpdating] = useState(false)
  const [showAllAchievements, setShowAllAchievements] = useState(false)
  const [isFlagFormOpen, setIsFlagFormOpen] = useState(false)
  const [accountFlagNotes, setAccountFlagNotes] = useState('')
  const [accountFlagCaptcha, setAccountFlagCaptcha] = useState({ question: '', token: '' })
  const [accountFlagCaptchaAnswer, setAccountFlagCaptchaAnswer] = useState('')
  const [accountFlagLoading, setAccountFlagLoading] = useState(false)
  const [accountFlagCaptchaLoading, setAccountFlagCaptchaLoading] = useState(false)

  async function loadProfile(explicitUsername = null) {
    const value = (explicitUsername || '').trim()
    if (!value) {
      setError('No profile username was provided.')
      return
    }

    setError('')
    setProfile(null)

    try {
      // This endpoint already returns profile + contribution + gamification blocks.
      const payload = await apiRequest(`/api/users/${value}`)
      setProfile(payload)
    } catch (requestError) {
      setError(requestError.message)
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
  const currentUserGroups = currentUser?.groups || []
  const canApplyAsReviewer = Boolean(
    isOwnProfile
      && currentUserGroups.includes('Contributor')
      && !currentUserGroups.includes('Reviewer')
      && !currentUserGroups.includes('Admin')
      && !currentUser?.is_superuser,
  )
  const canManageLeaderboardVisibility = Boolean(
    profile?.header?.username
      && currentUser?.is_authenticated
      && (currentUser?.is_superuser || currentUserGroups.includes('Admin')),
  )
  const canFlagSuspiciousAccount = Boolean(
    profile?.header?.username
      && currentUser?.is_authenticated
      && profile.header.username !== currentUser.username,
  )
  const isIncludedInLeaderboard = profile?.header?.include_in_leaderboard !== false
  const allBadges = allBadgesFromProfile(profile)
  const earnedBadges = allBadges.filter((badge) => badge.unlocked).sort((a, b) => badgeSortValue(a) - badgeSortValue(b))
  const inProgressBadges = nextInProgressBadgesByCategory(allBadges)
  const achievementGroups = achievementGroupsFromBadges(allBadges)
  const totalContributions = contributionTotal(profile?.contribution_summary)
  const fullName = nameWithPostNominals(
    profile?.header?.first_name,
    profile?.header?.last_name,
    profile?.header?.post_nominals,
  )
  const municipalityLabel = profile?.header?.municipality || 'Ivatan community member'
  const municipalityFlag = getMunicipalityFlag(profile?.header?.municipality)
  const accountabilityRows = [
    profile?.header?.onboarding_accountability?.contributor,
    profile?.header?.onboarding_accountability?.reviewer,
    profile?.header?.onboarding_accountability?.consultant,
  ]
    .map(summarizeAccountability)
    .filter(Boolean)
  const accountabilityText = accountabilityRows[0] || ''

  async function shareBadge(platform, badge) {
    if (!profile?.header?.username) return
    const badgeName = getBadgeDisplayName(badge)
    const profileUrl = `${window.location.origin}${ROUTES.profileView}?username=${encodeURIComponent(profile.header.username)}`
    const text = `I just earned the ${badgeName} badge on Chirin Ivatan.`

    if (platform === 'native') {
      const shared = await shareWithNative({
        title: 'Chirin Ivatan Badge',
        text,
        url: profileUrl,
      })
      if (!shared) {
        setShareFeedback('Native sharing is not available on this browser.')
      }
      return
    }

    if (platform === 'copy') {
      const copied = await copyShareText({ text, url: profileUrl })
      setShareFeedback(copied ? 'Badge share text copied.' : 'Could not copy share text.')
      return
    }

    const opened = openSocialShare(platform, { text, url: profileUrl })
    if (!opened) {
      setShareFeedback('Could not open social share window.')
    }
  }

  async function updateLeaderboardVisibility(nextValue) {
    if (!profile?.header?.username) return
    setLeaderboardUpdating(true)
    setError('')
    setShareFeedback('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest(`/api/users/${encodeURIComponent(profile.header.username)}/leaderboard-visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_in_leaderboard: nextValue }),
      })
      setProfile((current) => ({
        ...current,
        header: {
          ...(current?.header || {}),
          include_in_leaderboard: payload.include_in_leaderboard,
        },
      }))
      setShareFeedback(payload.include_in_leaderboard ? 'Contributions will count on the leaderboard.' : 'Contributions are hidden from leaderboard rankings.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLeaderboardUpdating(false)
    }
  }

  async function loadAccountFlagCaptcha() {
    setAccountFlagCaptchaLoading(true)
    try {
      const payload = await apiRequest('/api/captcha/challenge')
      setAccountFlagCaptcha({
        question: payload.question || '',
        token: payload.token || '',
      })
      setAccountFlagCaptchaAnswer('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAccountFlagCaptchaLoading(false)
    }
  }

  async function openAccountFlagForm() {
    setError('')
    setShareFeedback('')
    setIsFlagFormOpen(true)
    if (!accountFlagCaptcha.token) {
      await loadAccountFlagCaptcha()
    }
  }

  async function submitAccountFlag(event) {
    event.preventDefault()
    if (!profile?.header?.username) return
    setAccountFlagLoading(true)
    setError('')
    setShareFeedback('')
    try {
      await apiRequest('/api/auth/csrf')
      await apiRequest(`/api/users/${encodeURIComponent(profile.header.username)}/suspicious-flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: accountFlagNotes,
          captcha_token: accountFlagCaptcha.token,
          captcha_answer: accountFlagCaptchaAnswer,
        }),
      })
      setShareFeedback('Account flag sent for admin review.')
      setIsFlagFormOpen(false)
      setAccountFlagNotes('')
      setAccountFlagCaptcha({ question: '', token: '' })
      setAccountFlagCaptchaAnswer('')
    } catch (requestError) {
      setError(requestError.message)
      await loadAccountFlagCaptcha()
    } finally {
      setAccountFlagLoading(false)
    }
  }

  return (
    <div className="public-profile-page">
      {error && <section className="alert error">{error}</section>}
      {shareFeedback && <section className="alert ok">{shareFeedback}</section>}

      {profile && (
        <>
          <section className="public-profile-hero">
            <ProfileAvatar profile={profile} />
            <div className="public-profile-headline">
              <div className="profile-kicker-row">
                {municipalityFlag && (
                  <img className="profile-kicker-flag" src={municipalityFlag} alt={`${municipalityLabel} flag`} />
                )}
                <p className="profile-kicker">{municipalityLabel}</p>
              </div>
              <h1>{fullName || profile.header?.username}</h1>
              <p className="public-profile-username">{profile.header?.role || 'Community Member'}</p>
              {profile.header?.bio && <p className="public-profile-bio">{profile.header.bio}</p>}
              <div className="public-profile-affiliations">
                <AffiliationRows
                  title="Cultural Affiliations"
                  rows={profile.header?.cultural_affiliations}
                  firstKey="role"
                  secondKey="organization"
                />
                <AffiliationRows
                  title="Other Affiliations"
                  rows={profile.header?.other_affiliations}
                  firstKey="designation"
                  secondKey="institution"
                />
              </div>
            </div>
            <div className="public-profile-hero-actions">
              {isOwnProfile && (
                <button className="public-profile-edit" onClick={() => navigate(ROUTES.profileEdit)}>
                  Edit Profile
                </button>
              )}
              {canApplyAsReviewer && (
                <button className="ghost compact-button public-profile-reviewer-button" onClick={() => navigate(`${ROUTES.roleCenter}?role=reviewer`)}>
                  Apply as Reviewer
                </button>
              )}
              {canManageLeaderboardVisibility && (
                <button
                  className="ghost compact-button public-profile-leaderboard-button"
                  disabled={leaderboardUpdating}
                  onClick={() => updateLeaderboardVisibility(!isIncludedInLeaderboard)}
                >
                  {leaderboardUpdating
                    ? 'Updating...'
                    : isIncludedInLeaderboard
                      ? 'Hide from Leaderboard'
                      : 'Count on Leaderboard'}
                </button>
              )}
              <div className="public-profile-tags">
                <span>Joined {profile.header?.joined_date || '-'}</span>
                {accountabilityText && <span>{accountabilityText}</span>}
                {canManageLeaderboardVisibility && (
                  <span>{isIncludedInLeaderboard ? 'Leaderboard: included' : 'Leaderboard: hidden'}</span>
                )}
              </div>
              {canFlagSuspiciousAccount && (
                <button
                  type="button"
                  className="public-profile-flag-button"
                  onClick={openAccountFlagForm}
                >
                  Report suspicious account
                </button>
              )}
            </div>
          </section>

          {canFlagSuspiciousAccount && isFlagFormOpen && (
            <div
              className="public-profile-flag-backdrop"
              role="presentation"
              onClick={accountFlagLoading ? undefined : () => setIsFlagFormOpen(false)}
            >
              <section
                className="public-profile-flag-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="public-profile-flag-title"
                aria-describedby="public-profile-flag-description"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="public-profile-flag-heading">
                  <div>
                    <p className="profile-kicker">Account Safety</p>
                    <h3 id="public-profile-flag-title">Flag suspicious account</h3>
                    <p id="public-profile-flag-description" className="muted">
                      Send this profile to admins for review. This does not hide, suspend, or change the account.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ghost compact-button"
                    disabled={accountFlagLoading}
                    onClick={() => setIsFlagFormOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
                <form className="public-profile-flag-form" onSubmit={submitAccountFlag}>
                  <label className="field" htmlFor="public-profile-flag-notes">
                    <span>Reason</span>
                    <textarea
                      id="public-profile-flag-notes"
                      rows={3}
                      value={accountFlagNotes}
                      onChange={(event) => setAccountFlagNotes(event.target.value)}
                      placeholder="Describe what looks suspicious or needs admin review."
                    />
                  </label>
                  <div className="captcha-panel public-profile-flag-captcha">
                    <div>
                      <p className="profile-kicker">CAPTCHA</p>
                      <p>{accountFlagCaptchaLoading ? 'Loading challenge...' : accountFlagCaptcha.question || 'Load a challenge to continue.'}</p>
                    </div>
                    <label className="field" htmlFor="public-profile-flag-captcha">
                      <span>Answer</span>
                      <input
                        id="public-profile-flag-captcha"
                        inputMode="numeric"
                        value={accountFlagCaptchaAnswer}
                        onChange={(event) => setAccountFlagCaptchaAnswer(event.target.value)}
                      />
                    </label>
                    <button type="button" className="ghost compact-button" disabled={accountFlagCaptchaLoading} onClick={loadAccountFlagCaptcha}>
                      New CAPTCHA
                    </button>
                  </div>
                  <button type="submit" disabled={accountFlagLoading || accountFlagCaptchaLoading}>
                    {accountFlagLoading ? 'Sending...' : 'Send Flag for Review'}
                  </button>
                </form>
              </section>
            </div>
          )}

          {isOwnProfile && achievementGroups.length > 0 && (
            <section className="public-profile-section">
              <div className="achievement-section-heading">
                <div>
                  <h3 className="public-profile-section-title">Achievements</h3>
                  <p className="muted">Your earned badges and the next badges in progress.</p>
                </div>
                <button type="button" className="ghost compact-button" onClick={() => setShowAllAchievements(true)}>
                  View all badges
                </button>
              </div>
              {earnedBadges.length > 0 && (
                <>
                  <h4>Earned Badges</h4>
                  <div className="badge-row badge-row-earned">
                    {earnedBadges.map((badge) => (
                      <BadgeCard
                        key={badge.key}
                        badge={badge}
                        category={badge.category}
                        allowShare={isOwnProfile}
                        onShare={shareBadge}
                      />
                    ))}
                  </div>
                </>
              )}
              {inProgressBadges.length > 0 && (
                <>
                  <h4>{inProgressBadges.length === 1 ? 'Next Badge In Progress' : 'Next Badges In Progress'}</h4>
                  <div className="badge-row badge-row-progress">
                    {inProgressBadges.map((badge) => (
                      <BadgeCard
                        key={badge.key}
                        badge={badge}
                        category={badge.category}
                        allowShare={false}
                        onShare={shareBadge}
                        showRequirement
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {showAllAchievements && (
            <div className="achievements-modal-backdrop" role="presentation" onClick={() => setShowAllAchievements(false)}>
              <section
                className="achievements-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="achievements-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="achievements-modal-heading">
                  <div>
                    <h3 id="achievements-modal-title">All Badges</h3>
                    <p>Track every badge, what unlocks it, and your current progress.</p>
                  </div>
                  <button type="button" className="ghost compact-button" onClick={() => setShowAllAchievements(false)}>
                    Close
                  </button>
                </div>
                <div className="achievement-shelf-list achievements-modal-body">
                  {achievementGroups.map((group) => (
                    <AchievementShelf
                      key={group.category}
                      group={group}
                      expanded
                      allowShare={isOwnProfile}
                      onShare={shareBadge}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}

          {!isOwnProfile && earnedBadges.length > 0 && (
            <section className="public-profile-section">
              <h3 className="public-profile-section-title">Cultural Stewardship Badges</h3>
              <div className="badge-row badge-row-earned">
                {earnedBadges.map((badge) => (
                  <BadgeCard
                    key={badge.key}
                    badge={badge}
                    category={badge.category}
                    allowShare={false}
                    onShare={shareBadge}
                  />
                ))}
              </div>
            </section>
          )}

          {totalContributions > 0 && (
            <section className="public-profile-section">
              <h3 className="public-profile-section-title">Contribution Summary</h3>
              <div className="contribution-inline-grid">
                <SummaryItem label="Dictionary Terms" value={profile.contribution_summary?.dictionary_terms || 0} />
                <SummaryItem label="Folklore Entries" value={profile.contribution_summary?.folklore_entries || 0} />
                <SummaryItem label="Revisions" value={profile.contribution_summary?.revisions || 0} />
                <SummaryItem label="Total Contributions" value={totalContributions} />
              </div>
            </section>
          )}

          <section className="public-profile-section">
            <h3 className="public-profile-section-title">Published Contributions</h3>
            <div className="public-profile-lists-grid">
              <ContributionList
                title="Dictionary Terms"
                emptyText="No approved mother terms yet."
                items={profile.lists?.approved_mother_terms || []}
                getLabel={(item) => item.term}
              />
              <ContributionList
                title="Folklore Entries"
                emptyText="No approved folklore entries yet."
                items={profile.lists?.approved_folklore_entries || []}
                getLabel={(item) => item.title}
              />
              <ContributionList
                title="Revised Entries"
                emptyText="No revised entries yet."
                items={profile.lists?.entries_revised || []}
                getLabel={(item) => item.term}
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

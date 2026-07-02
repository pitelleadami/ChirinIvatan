/*
  PublicProfilePage.jsx

  Profile payload viewer:
  - contributor stats
  - onboarding accountability lines
  - gamification blocks
*/

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import BadgeShareCard from '../components/BadgeShareCard'
import TurnstileWidget from '../components/TurnstileWidget'
import { apiRequest } from '../lib/api'
import { getBadgeImageByKey, getReviewerLevelImage } from '../lib/badgeImages'
import { getMunicipalityFlag } from '../lib/municipalityFlags'
import { copyShareText, downloadBlob } from '../lib/socialShare'
import { ROUTES, navigate } from '../lib/router'

const CONTRIBUTION_LIST_PAGE_SIZE = 10

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

function ContributionList({ title, emptyText, items, getLabel, getRoute }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / CONTRIBUTION_LIST_PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageStart = (safePage - 1) * CONTRIBUTION_LIST_PAGE_SIZE
  const visibleItems = items.slice(pageStart, pageStart + CONTRIBUTION_LIST_PAGE_SIZE)

  return (
    <div className="public-profile-list">
      <h4>{title}</h4>
      {items.length === 0 && <p className="muted public-profile-empty-text">{emptyText}</p>}
      {visibleItems.map((item) => (
        <article
          key={item.entry_id}
          className={
            getRoute ? 'public-profile-entry-row public-profile-entry-row-link' : 'public-profile-entry-row'
          }
          onClick={getRoute ? () => navigate(getRoute(item)) : undefined}
        >
          <p>{getLabel(item)}</p>
        </article>
      ))}
      {items.length > CONTRIBUTION_LIST_PAGE_SIZE && (
        <nav className="public-profile-list-pagination" aria-label={`${title} pagination`}>
          <button
            type="button"
            className="ghost"
            aria-label={`Previous ${title} page`}
            disabled={safePage === 1}
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
          >
            <ChevronLeft aria-hidden="true" size={18} strokeWidth={2.4} />
          </button>
          <span>
            Page {safePage} of {pageCount}
          </span>
          <button
            type="button"
            className="ghost"
            aria-label={`Next ${title} page`}
            disabled={safePage === pageCount}
            onClick={() => setPage((currentPage) => Math.min(pageCount, currentPage + 1))}
          >
            <ChevronRight aria-hidden="true" size={18} strokeWidth={2.4} />
          </button>
        </nav>
      )}
    </div>
  )
}

function nameWithPostNominals(firstName, lastName, nameExtension, postNominals) {
  const baseName = [firstName, lastName, nameExtension].filter(Boolean).join(' ').trim()
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
    ...(profile?.gamification?.dictionary_badges || []).map((badge) => ({
      ...badge,
      category: 'Dictionary',
    })),
    ...(profile?.gamification?.folklore_badges || []).map((badge) => ({ ...badge, category: 'Folklore' })),
    ...(profile?.gamification?.quality_badges || []).map((badge) => ({ ...badge, category: 'Quality' })),
  ]
}

function reviewerLevelBadgesFromProfile(profile, reviewerLevelData) {
  const rows = profile?.gamification?.reviewer_level_badges || []
  if (rows.length) {
    return rows.map((badge) => {
      const levelNumber =
        Number(badge.level_number) || Number(String(badge.key || '').match(/\d+$/)?.[0]) || 0
      return {
        ...badge,
        category: 'Reviewer',
        image: getReviewerLevelImage(levelNumber),
      }
    })
  }

  const currentLevel = Number(reviewerLevelData?.level) || 0
  if (currentLevel <= 0) return []
  return [
    {
      key: `reviewer_level_${currentLevel}`,
      name: reviewerLevelData.title || `Reviewer Level ${currentLevel}`,
      level_number: currentLevel,
      unlocked: true,
      current_value: reviewerLevelData.current_count || 0,
      threshold: reviewerLevelData.current_count || 0,
      category: 'Reviewer',
      image: getReviewerLevelImage(currentLevel),
    },
  ]
}

function badgeSortValue(badge) {
  if (badge.unlocked_at) {
    const parsed = Date.parse(badge.unlocked_at)
    if (Number.isFinite(parsed)) return parsed
  }
  return Number(badge.threshold) || 0
}

function earnedBadgePriority(badge) {
  const levelNumber = Number(badge.level_number) || Number(String(badge.key || '').match(/\d+$/)?.[0]) || 0
  const threshold = Number(badge.threshold) || 0
  if (badge.category === 'Reviewer') return 300000 + levelNumber * 1000 + threshold
  if (badge.category === 'Quality') return 200000 + threshold
  return 100000 + threshold
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

  return categoryOrder.map((category) => rowsByCategory.get(category)).filter(Boolean)
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
  if (badge.category === 'Reviewer') {
    return `Complete ${threshold} ${threshold === 1 ? 'review' : 'reviews'} to reach ${badge.name}.`
  }
  return `Reach ${threshold} approved contributions.`
}

function achievementGroupsFromBadges(badges) {
  return ['Reviewer', 'Dictionary', 'Folklore', 'Quality']
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

function structuredAccountabilityRows(details = {}) {
  return ['contributor', 'reviewer', 'consultant'].map((role) => details?.[role]).filter(Boolean)
}

function AccountabilityTag({ record }) {
  if (!record) return null
  const invitedBy = record.invited_by
  const approvedBy = Array.isArray(record.approved_by) ? record.approved_by : []
  if (invitedBy) {
    return (
      <span className="public-profile-linked-tag">
        Invited and vouched for by{' '}
        <button
          type="button"
          onClick={() => navigate(`${ROUTES.profileView}?username=${encodeURIComponent(invitedBy.username)}`)}
        >
          {displayActorName(invitedBy.display_name || invitedBy.username)}
        </button>
      </span>
    )
  }
  if (approvedBy.length > 0) {
    return (
      <span className="public-profile-linked-tag">
        Approved by{' '}
        {approvedBy.map((actor, index) => (
          <span key={actor.username || index}>
            {index > 0 && (index === approvedBy.length - 1 ? ' and ' : ', ')}
            <button
              type="button"
              onClick={() => navigate(`${ROUTES.profileView}?username=${encodeURIComponent(actor.username)}`)}
            >
              {displayActorName(actor.display_name || actor.username)}
            </button>
          </span>
        ))}
      </span>
    )
  }
  return null
}

function BadgeCard({
  badge,
  category = 'Badge',
  allowShare = false,
  onShare = null,
  showRequirement = false,
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const image = badge.image || getBadgeImageByKey(badge.key)
  const progressPercent = badgeProgressPercent(badge)
  const displayName = getBadgeDisplayName(badge)
  const statusLabel = 'In progress'
  const qualityNote = badge.rejection_count !== undefined ? `Rejections: ${badge.rejection_count}` : ''
  const unlockedDate = formatBadgeDate(badge.unlocked_at)
  const isInteractive = Boolean(badge.unlocked)

  function toggleDetails(event) {
    if (!isInteractive || event.target.closest('button')) return
    setDetailsOpen((current) => !current)
  }

  function handleDetailsKeyDown(event) {
    if (!isInteractive || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    setDetailsOpen((current) => !current)
  }

  return (
    <article
      className={['badge-card', badge.unlocked ? 'unlocked' : '', detailsOpen ? 'details-open' : '']
        .filter(Boolean)
        .join(' ')}
      tabIndex={isInteractive ? 0 : undefined}
      role={isInteractive ? 'group' : undefined}
      aria-expanded={isInteractive ? detailsOpen : undefined}
      aria-label={isInteractive ? `${displayName}. Show badge details` : undefined}
      onClick={toggleDetails}
      onKeyDown={handleDetailsKeyDown}
    >
      <div className="badge-card-media" aria-hidden={!image}>
        {image ? (
          <img className="badge-card-image" src={image} alt="" loading="lazy" />
        ) : (
          <span className="badge-card-fallback">{displayName.slice(0, 1)}</span>
        )}
      </div>
      {badge.unlocked && (
        <div className="badge-card-reveal">
          <div className="badge-card-caption">
            <h5>{displayName}</h5>
            {allowShare && <p>{unlockedDate || 'Unlocked'}</p>}
          </div>
          {allowShare && (
            <div className="badge-share-row">
              <button
                type="button"
                className="badge-share-icon-btn"
                title="Share badge"
                onClick={() => onShare?.({ ...badge, image })}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>
            </div>
          )}
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
            {showRequirement && (
              <p className="badge-requirement">{badgeRequirementText({ ...badge, category })}</p>
            )}
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
          <p>
            {unlockedCount} of {group.badges.length} unlocked
          </p>
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
  const [accountFlagTurnstileToken, setAccountFlagTurnstileToken] = useState('')
  const [accountFlagLoading, setAccountFlagLoading] = useState(false)
  const [shareDialog, setShareDialog] = useState(null)
  const shareCardRef = useRef(null)

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
  const isReviewerOrAbove = Boolean(
    currentUserGroups.includes('Reviewer') ||
    currentUserGroups.includes('Admin') ||
    currentUser?.is_superuser,
  )
  const canApplyAsReviewer = Boolean(
    isOwnProfile &&
    currentUserGroups.includes('Contributor') &&
    !currentUserGroups.includes('Reviewer') &&
    !currentUserGroups.includes('Admin') &&
    !currentUser?.is_superuser,
  )
  const canManageLeaderboardVisibility = Boolean(
    profile?.header?.username &&
    currentUser?.is_authenticated &&
    (currentUser?.is_superuser || currentUserGroups.includes('Admin')),
  )
  const canFlagSuspiciousAccount = Boolean(
    profile?.header?.username &&
    currentUser?.is_authenticated &&
    profile.header.username !== currentUser.username,
  )
  const isIncludedInLeaderboard = profile?.header?.include_in_leaderboard !== false
  const allBadges = allBadgesFromProfile(profile)
  const reviewerLevelData = profile?.gamification?.reviewer_level
  const reviewerLevelBadges = reviewerLevelBadgesFromProfile(profile, reviewerLevelData)
  const earnedReviewerLevelBadges = reviewerLevelBadges.filter((badge) => badge.unlocked)
  const earnedBadges = [...earnedReviewerLevelBadges, ...allBadges.filter((badge) => badge.unlocked)].sort(
    (a, b) => earnedBadgePriority(b) - earnedBadgePriority(a) || badgeSortValue(b) - badgeSortValue(a),
  )
  const reviewerInProgressBadge = (() => {
    if (!isOwnProfile || !isReviewerOrAbove) return null
    const nextBadge = reviewerLevelBadges.find((badge) => !badge.unlocked)
    if (nextBadge) return nextBadge
    if (!reviewerLevelData || reviewerLevelData.next_threshold === null) return null
    const nextLevel = (Number(reviewerLevelData.level) || 0) + 1
    return {
      key: `reviewer_level_${nextLevel}`,
      name: reviewerLevelData.next_title || `Reviewer Level ${nextLevel}`,
      level_number: nextLevel,
      unlocked: false,
      current_value: reviewerLevelData.current_count || 0,
      threshold: reviewerLevelData.next_threshold,
      category: 'Reviewer',
      image: getReviewerLevelImage(nextLevel),
    }
  })()
  const inProgressBadges = [
    ...(reviewerInProgressBadge ? [reviewerInProgressBadge] : []),
    ...nextInProgressBadgesByCategory(allBadges),
  ]
  const achievementGroups = achievementGroupsFromBadges([...allBadges, ...reviewerLevelBadges])
  const totalContributions = contributionTotal(profile?.contribution_summary)
  const fullName = nameWithPostNominals(
    profile?.header?.first_name,
    profile?.header?.last_name,
    profile?.header?.name_extension,
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
  const structuredAccountability = structuredAccountabilityRows(
    profile?.header?.onboarding_accountability_details,
  )

  function badgeShareCaption(badge) {
    const displayName = getBadgeDisplayName(badge)
    const category = String(badge?.category || badge?.key || '').toLowerCase()
    if (category.includes('dictionary')) {
      return `I earned the ${displayName} badge on Chirin Ivatan. Every word contributed is a living thread of Ivatan language, memory, and identity carried forward for the next generation.`
    }
    if (category.includes('folklore')) {
      return `I earned the ${displayName} badge on Chirin Ivatan. Every story shared helps keep Ivatan memory, wisdom, and cultural imagination alive.`
    }
    if (category.includes('reviewer')) {
      return `I earned the ${displayName} recognition on Chirin Ivatan. As a steward of Ivatan heritage, I help protect the care, accuracy, context, and trust behind what we pass on.`
    }
    if (category.includes('quality') || category.includes('accuracy')) {
      return `I earned the ${displayName} badge on Chirin Ivatan. Cultural preservation asks for care, accuracy, and respect, and I am proud to help keep that standard alive.`
    }
    return `I earned the ${displayName} badge on Chirin Ivatan. Each contribution is a small act of remembering, preserving, and passing forward Ivatan language and culture.`
  }

  async function generateBadgeShareImage(format = 'square') {
    if (!shareCardRef.current) return
    setShareDialog((current) =>
      current ? { ...current, dataUrl: '', status: 'Preparing share image...' } : current,
    )
    try {
      await document.fonts.ready
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2, cacheBust: true })
      setShareDialog((current) => (current ? { ...current, format, dataUrl, status: '' } : current))
    } catch {
      setShareDialog((current) =>
        current ? { ...current, status: 'Could not prepare the image. Try again.' } : current,
      )
    }
  }

  useEffect(() => {
    if (!shareDialog?.badge) return
    generateBadgeShareImage(shareDialog.format)
    // Regenerate only when the selected badge or export format changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareDialog?.badge?.key, shareDialog?.format])

  function shareBadge(badge) {
    if (!profile?.header?.username) return
    const image = badge.image || getBadgeImageByKey(badge.key)
    const shareBadgeData = { ...badge, image }
    const displayName = getBadgeDisplayName(badge)
    setShareFeedback('')
    setShareDialog({
      badge: shareBadgeData,
      format: 'square',
      dataUrl: '',
      status: 'Preparing share image...',
      title: `Share ${displayName}`,
      caption: badgeShareCaption(badge),
      filenameBase: displayName.replace(/\s+/g, '-').toLowerCase(),
    })
  }

  async function downloadBadgeShare() {
    if (!shareDialog?.dataUrl) return
    const profileUrl = `${window.location.origin}${ROUTES.profileView}?username=${encodeURIComponent(profile.header.username)}`
    try {
      const response = await fetch(shareDialog.dataUrl)
      const blob = await response.blob()
      const formatName = shareDialog.format === 'story' ? 'vertical-story' : 'square-post'
      downloadBlob(blob, `${shareDialog.filenameBase}-${formatName}.png`)
      const copied = await copyShareText({ text: shareDialog.caption, url: profileUrl })
      setShareFeedback(
        copied
          ? 'Image downloaded and caption copied.'
          : 'Image downloaded. Copy the caption from the share window.',
      )
      setShareDialog(null)
    } catch {
      setShareDialog((current) =>
        current ? { ...current, status: 'Could not download the image. Try again.' } : current,
      )
    }
  }

  async function updateLeaderboardVisibility(nextValue) {
    if (!profile?.header?.username) return
    setLeaderboardUpdating(true)
    setError('')
    setShareFeedback('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest(
        `/api/users/${encodeURIComponent(profile.header.username)}/leaderboard-visibility`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ include_in_leaderboard: nextValue }),
        },
      )
      setProfile((current) => ({
        ...current,
        header: {
          ...(current?.header || {}),
          include_in_leaderboard: payload.include_in_leaderboard,
        },
      }))
      setShareFeedback(
        payload.include_in_leaderboard
          ? 'Contributions will count on the leaderboard.'
          : 'Contributions are hidden from leaderboard rankings.',
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLeaderboardUpdating(false)
    }
  }

  async function openAccountFlagForm() {
    setError('')
    setShareFeedback('')
    setIsFlagFormOpen(true)
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
          turnstile_token: accountFlagTurnstileToken,
        }),
      })
      setShareFeedback('Account flag sent for admin review.')
      setIsFlagFormOpen(false)
      setAccountFlagNotes('')
      setAccountFlagTurnstileToken('')
    } catch (requestError) {
      setError(requestError.message)
      setAccountFlagTurnstileToken('')
    } finally {
      setAccountFlagLoading(false)
    }
  }

  const shareCardProfileName = (() => {
    const first = profile?.header?.first_name?.trim() || ''
    const last = profile?.header?.last_name?.trim() || ''
    const extension = profile?.header?.name_extension?.trim() || ''
    if (first || last) return [first, last, extension].filter(Boolean).join(' ')
    return profile?.header?.username || ''
  })()

  const shareCardEarnedDate = shareDialog?.badge?.unlocked_at
    ? new Date(shareDialog.badge.unlocked_at).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  return (
    <>
      {/* Off-screen share card — rendered for the selected export format */}
      {shareDialog?.badge && (
        <div
          aria-hidden="true"
          style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1, pointerEvents: 'none' }}
        >
          <BadgeShareCard
            ref={shareCardRef}
            badge={shareDialog.badge}
            displayName={getBadgeDisplayName(shareDialog.badge)}
            profileName={shareCardProfileName}
            earnedDate={shareCardEarnedDate}
            format={shareDialog.format}
          />
        </div>
      )}

      <div className="public-profile-page">
        {error && <section className="alert error">{error}</section>}
        {shareFeedback && <section className="alert ok">{shareFeedback}</section>}

        {profile && (
          <>
            {shareDialog?.badge && (
              <div className="share-card-modal-overlay" onClick={() => setShareDialog(null)}>
                <div className="share-card-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="share-card-modal-header">
                    <span className="share-card-modal-title">{shareDialog.title}</span>
                    <button
                      type="button"
                      className="share-card-modal-close"
                      onClick={() => setShareDialog(null)}
                      aria-label="Close"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        width="18"
                        height="18"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div className="share-format-segmented" aria-label="Share image format">
                    <button
                      type="button"
                      className={shareDialog.format === 'square' ? 'active' : ''}
                      onClick={() =>
                        setShareDialog((current) => (current ? { ...current, format: 'square' } : current))
                      }
                    >
                      Square Post
                    </button>
                    <button
                      type="button"
                      className={shareDialog.format === 'story' ? 'active' : ''}
                      onClick={() =>
                        setShareDialog((current) => (current ? { ...current, format: 'story' } : current))
                      }
                    >
                      Vertical Story
                    </button>
                  </div>
                  <div className="share-card-modal-preview">
                    {shareDialog.dataUrl ? (
                      <img src={shareDialog.dataUrl} alt="Share card preview" />
                    ) : (
                      <div className="share-card-modal-loading">
                        {shareDialog.status || 'Preparing share image...'}
                      </div>
                    )}
                  </div>
                  <div className="share-caption-box">
                    <p>{shareDialog.caption}</p>
                  </div>
                  {shareDialog.status && shareDialog.dataUrl && (
                    <p className="share-card-modal-hint">{shareDialog.status}</p>
                  )}
                  <div className="share-card-modal-actions">
                    <button
                      type="button"
                      className="share-card-modal-btn primary"
                      disabled={!shareDialog.dataUrl}
                      onClick={downloadBadgeShare}
                    >
                      Download Image &amp; Copy Caption
                    </button>
                  </div>
                </div>
              </div>
            )}

            <section className="public-profile-hero">
              <ProfileAvatar profile={profile} />
              <div className="public-profile-headline">
                <div className="profile-kicker-row">
                  {municipalityFlag && (
                    <img
                      className="profile-kicker-flag"
                      src={municipalityFlag}
                      alt={`${municipalityLabel} flag`}
                    />
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
                  <button
                    className="ghost compact-button public-profile-reviewer-button"
                    onClick={() => navigate(`${ROUTES.roleCenter}?role=reviewer`)}
                  >
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
                  {structuredAccountability.length > 0
                    ? structuredAccountability.map((record) => (
                        <AccountabilityTag key={`${record.role}-${record.method}`} record={record} />
                      ))
                    : accountabilityText && <span>{accountabilityText}</span>}
                </div>
                {canFlagSuspiciousAccount && (
                  <button type="button" className="public-profile-flag-button" onClick={openAccountFlagForm}>
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
                        Send this profile to admins for review. This does not hide, suspend, or change the
                        account.
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
                        <p className="profile-kicker">Verification</p>
                        <p>Complete this before sending the account report.</p>
                      </div>
                      <TurnstileWidget
                        action="profile-report"
                        onToken={setAccountFlagTurnstileToken}
                        onError={(message) => setError(message)}
                      />
                    </div>
                    <button type="submit" disabled={accountFlagLoading || !accountFlagTurnstileToken}>
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
                    <div className="achievement-title-row">
                      <h3 className="public-profile-section-title">Achievements</h3>
                      <button
                        type="button"
                        className="ghost compact-button"
                        onClick={() => setShowAllAchievements(true)}
                      >
                        View all badges
                      </button>
                    </div>
                    <p className="muted">Your earned badges and the next badges in progress.</p>
                  </div>
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
                    <h4>
                      {inProgressBadges.length === 1 ? 'Next Badge In Progress' : 'Next Badges In Progress'}
                    </h4>
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
              <div
                className="achievements-modal-backdrop"
                role="presentation"
                onClick={() => setShowAllAchievements(false)}
              >
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
                    <button
                      type="button"
                      className="ghost compact-button"
                      onClick={() => setShowAllAchievements(false)}
                    >
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
                  <SummaryItem
                    label="Dictionary Terms"
                    value={profile.contribution_summary?.dictionary_terms || 0}
                  />
                  <SummaryItem
                    label="Folklore Entries"
                    value={profile.contribution_summary?.folklore_entries || 0}
                  />
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
                  getRoute={(item) => `${ROUTES.dictionaryView}?entry_id=${item.entry_id}`}
                />
                <ContributionList
                  title="Folklore Entries"
                  emptyText="No approved folklore entries yet."
                  items={profile.lists?.approved_folklore_entries || []}
                  getLabel={(item) => item.title}
                  getRoute={(item) => `${ROUTES.folkloreView}?entry_id=${item.entry_id}`}
                />
                <ContributionList
                  title="Revised Entries"
                  emptyText="No revised entries yet."
                  items={profile.lists?.entries_revised || []}
                  getLabel={(item) => item.term || item.title}
                  getRoute={(item) =>
                    item.type === 'folklore'
                      ? `${ROUTES.folkloreView}?entry_id=${item.entry_id}`
                      : `${ROUTES.dictionaryView}?entry_id=${item.entry_id}`
                  }
                />
              </div>
            </section>
          </>
        )}
      </div>
    </>
  )
}

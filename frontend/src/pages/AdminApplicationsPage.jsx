import { useEffect, useMemo, useState } from 'react'

import ConfirmDialog from '../components/ConfirmDialog'
import { apiRequest } from '../lib/api'
import { emailValidationMessage } from '../lib/emailValidation'
import { DEFAULT_FAQ_SECTIONS } from '../lib/faqContent'
import { folkloreTaxonomyLabel } from '../lib/folkloreTaxonomy'
import { ROUTES, navigate } from '../lib/router'
import { DEFAULT_SITE_CONTENT, normalizeSiteContent, paragraphsToText, textToParagraphs } from '../lib/siteContent'
import ReviewerDashboardPage from './ReviewerDashboardPage'

const STATUSES = ['pending', 'approved', 'rejected', 'all']
const USER_GROUPS = ['all', 'Admin', 'Consultant', 'Reviewer', 'Contributor']
const INVITE_ROLES = ['contributor', 'reviewer', 'consultant', 'admin']
const CONTRIBUTIONS_PER_PAGE = 5
const APPLICATIONS_PER_PAGE = 5
const INVITATIONS_PER_PAGE = 8
const DESK_TABS = ['reviews', 'applications', 'people', 'site', 'contributions']
const EMPTY_SUPPORT_STATEMENT = { quote: '', name: '', role: '' }
const EMPTY_PARTNER_DETAIL = { name: '', description: '', url: '' }
const FAQ_ROLE_OPTIONS = [
  { value: 'visitor', label: 'Visitor' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'admin', label: 'Admin' },
]
const EMPTY_FAQ_ITEM = { q: '', a: '', bullets_text: '', image_url: '', image_alt: '' }
const EMPTY_FAQ_SECTION = {
  id: '',
  title: '',
  intro: '',
  roles: FAQ_ROLE_OPTIONS.map((role) => role.value),
  items: [{ ...EMPTY_FAQ_ITEM }],
}
const CONTRIBUTION_STATUS_LABELS = {
  draft: 'Draft',
  pending: 'Submitted for review',
  approved: 'Approved',
  rejected: 'Needs changes',
}

function displayName(applicant) {
  const fullName = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ').trim()
  const postNominals = applicant.post_nominals || applicant.profile?.post_nominals || ''
  const baseName = fullName || applicant.username
  return baseName && postNominals ? `${baseName}, ${postNominals}` : baseName || postNominals
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function sortNewestFirst(rows) {
  return [...rows].sort((a, b) => {
    const firstDate = new Date(a.updated_at || a.created_at || 0).getTime()
    const secondDate = new Date(b.updated_at || b.created_at || 0).getTime()
    return secondDate - firstDate
  })
}

function contributionPageCount(rows) {
  return Math.max(1, Math.ceil(rows.length / CONTRIBUTIONS_PER_PAGE))
}

function pagedContributions(rows, page) {
  const start = (page - 1) * CONTRIBUTIONS_PER_PAGE
  return rows.slice(start, start + CONTRIBUTIONS_PER_PAGE)
}

function applicationPageCount(rows) {
  return Math.max(1, Math.ceil(rows.length / APPLICATIONS_PER_PAGE))
}

function pagedApplications(rows, page) {
  const start = (page - 1) * APPLICATIONS_PER_PAGE
  return rows.slice(start, start + APPLICATIONS_PER_PAGE)
}

function invitationPageCount(rows) {
  return Math.max(1, Math.ceil(rows.length / INVITATIONS_PER_PAGE))
}

function pagedInvitations(rows, page) {
  const start = (page - 1) * INVITATIONS_PER_PAGE
  return rows.slice(start, start + INVITATIONS_PER_PAGE)
}

function filterContributionsByTab(rows, tab) {
  if (tab === 'drafts') return rows.filter((row) => row.status === 'draft')
  return rows.filter((row) => row.status !== 'draft')
}

function contributionStatusLabel(status) {
  return CONTRIBUTION_STATUS_LABELS[status] || status || 'Unknown'
}

function contributionStatusDetail(row) {
  if (row.status === 'draft') return `Saved as draft ${formatDate(row.updated_at || row.created_at)}`
  if (row.status === 'pending') return `Submitted for reviewer validation ${formatDate(row.updated_at || row.created_at)}`
  if (row.status === 'approved') return `Approved ${formatDate(row.updated_at || row.created_at)}`
  if (row.status === 'rejected') return `Returned for updates ${formatDate(row.updated_at || row.created_at)}`
  return `Last updated ${formatDate(row.updated_at || row.created_at)}`
}

function splitList(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseStructuredValue(value) {
  if (!value) return value
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function getYouTubeEmbedUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.hostname.includes('youtube.com')) {
      const videoId = url.searchParams.get('v')
      return videoId ? `https://www.youtube.com/embed/${videoId}` : ''
    }
    if (url.hostname === 'youtu.be') {
      const videoId = url.pathname.replace('/', '')
      return videoId ? `https://www.youtube.com/embed/${videoId}` : ''
    }
  } catch {
    return ''
  }
  return ''
}

function roleLabel(value) {
  if (value === 'admin') return 'Admin'
  if (value === 'consultant') return 'Consultant'
  return value === 'reviewer' ? 'Reviewer' : 'Contributor'
}

const EMPTY_EMAIL_INVITE = {
  email: '',
  role: 'contributor',
  first_name: '',
  last_name: '',
  municipality: '',
  notes: '',
}
const EMPTY_CONSULTANT_PROFILE = {
  first_name: '',
  last_name: '',
  email: '',
  municipality: '',
  post_nominals: '',
  affiliation: '',
  occupation: '',
  bio: '',
  notes: '',
}

function rowsForSiteEditor(rows, emptyRow) {
  return Array.isArray(rows) && rows.length ? rows : [{ ...emptyRow }]
}

function faqSectionsForEditor(rows) {
  const sourceRows = Array.isArray(rows) && rows.length ? rows : DEFAULT_FAQ_SECTIONS
  return sourceRows.map((section, sectionIndex) => ({
    id: section.id || `faq-section-${sectionIndex + 1}`,
    title: section.title || '',
    intro: section.intro || '',
    roles: Array.isArray(section.roles) && section.roles.length
      ? section.roles.filter((role) => FAQ_ROLE_OPTIONS.some((option) => option.value === role))
      : FAQ_ROLE_OPTIONS.map((role) => role.value),
    items: rowsForSiteEditor(section.items, EMPTY_FAQ_ITEM).map((item) => ({
      q: item.q || '',
      a: item.a || '',
      bullets_text: paragraphsToText(item.bullets || []),
      image_url: item.image_url || '',
      image_alt: item.image_alt || '',
    })),
  }))
}

function siteContentToForm(payload) {
  const content = normalizeSiteContent(payload)
  return {
    about_heading: content.about_heading || '',
    about_intro_text: paragraphsToText(content.about_intro_paragraphs),
    about_body_text: paragraphsToText(content.about_body_paragraphs),
    about_rationale_text: paragraphsToText(content.about_rationale_paragraphs),
    about_future_text: paragraphsToText(content.about_future_paragraphs),
    about_final_quote: content.about_final_quote || '',
    yaru_heading: content.yaru_heading || '',
    yaru_intro_text: paragraphsToText(content.yaru_intro_paragraphs),
    support_statements: rowsForSiteEditor(content.support_statements, EMPTY_SUPPORT_STATEMENT),
    partner_details: rowsForSiteEditor(content.partner_details, EMPTY_PARTNER_DETAIL),
    faq_sections: faqSectionsForEditor(content.faq_sections),
  }
}

function siteContentFromForm(form) {
  return {
    about_heading: form.about_heading,
    about_intro_paragraphs: textToParagraphs(form.about_intro_text),
    about_body_paragraphs: textToParagraphs(form.about_body_text),
    about_rationale_paragraphs: textToParagraphs(form.about_rationale_text),
    about_future_paragraphs: textToParagraphs(form.about_future_text),
    about_final_quote: form.about_final_quote,
    yaru_heading: form.yaru_heading,
    yaru_intro_paragraphs: textToParagraphs(form.yaru_intro_text),
    support_statements: form.support_statements
      .map((row) => ({
        quote: row.quote.trim(),
        name: row.name.trim(),
        role: row.role.trim(),
      }))
      .filter((row) => row.quote || row.name || row.role),
    partner_details: form.partner_details
      .map((row) => ({
        name: row.name.trim(),
        description: row.description.trim(),
        url: row.url.trim(),
      }))
      .filter((row) => row.name || row.description || row.url),
    faq_sections: form.faq_sections
      .map((section, sectionIndex) => ({
        id: (section.id || `faq-section-${sectionIndex + 1}`).trim(),
        title: section.title.trim(),
        intro: section.intro.trim(),
        roles: section.roles.length ? section.roles : FAQ_ROLE_OPTIONS.map((role) => role.value),
        items: section.items
          .map((item) => ({
            q: item.q.trim(),
            a: item.a.trim(),
            bullets: textToParagraphs(item.bullets_text),
            image_url: item.image_url.trim(),
            image_alt: item.image_alt.trim(),
          }))
          .filter((item) => item.q || item.a || item.bullets.length || item.image_url),
      }))
      .filter((section) => section.title || section.intro || section.items.length),
  }
}

function applicationRule(targetRole) {
  return targetRole === 'reviewer'
    ? 'Needs two reviewers, or one reviewer plus one admin.'
    : 'Needs one reviewer or admin approval.'
}

function approvalProgress(application) {
  const approvals = application.decisions.filter((row) => row.decision === 'approve')
  const reviewerApprovals = approvals.filter((row) => row.decider_role === 'reviewer').length
  const adminApprovals = approvals.filter((row) => row.decider_role === 'admin').length
  if (application.status === 'approved') return 'Approved and role access is active.'
  if (application.status === 'rejected') return 'Rejected. Applicant can reapply later with clearer context.'
  if (application.target_role === 'contributor') {
    return approvals.length ? 'Approval recorded. Waiting for backend final status refresh.' : 'Needs one approval.'
  }
  if (reviewerApprovals >= 1 && adminApprovals >= 1) return 'Reviewer quorum met. Waiting for refresh.'
  if (reviewerApprovals >= 1) return 'One reviewer approval recorded. Needs one admin or another reviewer.'
  if (adminApprovals >= 1) return 'One admin approval recorded. Needs one reviewer.'
  return 'No approval yet.'
}

function ApplicantAvatar({ applicant }) {
  const profilePhoto = applicant.profile_photo || applicant.profile?.profile_photo
  if (profilePhoto) {
    return <img className="admin-app-avatar" src={profilePhoto} alt="" />
  }
  return (
    <div className="admin-app-avatar admin-app-avatar-fallback" aria-hidden="true">
      {applicant.username.slice(0, 2).toUpperCase()}
    </div>
  )
}

function affiliationText(rows, firstKey, secondKey) {
  return (rows || [])
    .map((row) => [row?.[firstKey], row?.[secondKey]].filter(Boolean).join(' - '))
    .filter(Boolean)
    .join('; ')
}

export default function AdminApplicationsPage({ currentUser }) {
  const userGroups = currentUser?.groups || []
  const isAdmin = currentUser?.is_superuser || userGroups.includes('Admin')
  const isConsultant = userGroups.includes('Consultant')
  const isReviewer = userGroups.includes('Reviewer')
  const canReviewRoles = isAdmin || isReviewer || isConsultant
  const isAuthenticated = Boolean(currentUser?.is_authenticated)
  const inviteRoleOptions = useMemo(
    () => (isAdmin ? INVITE_ROLES : INVITE_ROLES.filter((role) => !['consultant', 'admin'].includes(role))),
    [isAdmin],
  )
  function tabFromQuery() {
    const requestedTab = new URLSearchParams(window.location.search).get('tab')
    return DESK_TABS.includes(requestedTab) ? requestedTab : ''
  }

  function normalizeDeskTab(requestedTab) {
    if (isAdmin) return requestedTab || 'applications'
    if (canReviewRoles) {
      return ['applications', 'reviews', 'contributions'].includes(requestedTab) ? requestedTab : 'reviews'
    }
    return 'contributions'
  }

  const initialRequestedTab = tabFromQuery()
  const initialTab = normalizeDeskTab(initialRequestedTab)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [reviewRefreshToken, setReviewRefreshToken] = useState(0)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [applications, setApplications] = useState([])
  const [applicationPage, setApplicationPage] = useState(1)
  const [people, setPeople] = useState([])
  const [selectedActivityUser, setSelectedActivityUser] = useState(null)
  const [activityRows, setActivityRows] = useState([])
  const [showActivityLog, setShowActivityLog] = useState(false)
  const [invitations, setInvitations] = useState([])
  const [invitationPage, setInvitationPage] = useState(1)
  const [dictionaryDrafts, setDictionaryDrafts] = useState([])
  const [folkloreDrafts, setFolkloreDrafts] = useState([])
  const [dictionaryPublished, setDictionaryPublished] = useState([])
  const [folklorePublished, setFolklorePublished] = useState([])
  const [siteContentForm, setSiteContentForm] = useState(() => siteContentToForm(DEFAULT_SITE_CONTENT))
  const [publishedContributionTab, setPublishedContributionTab] = useState('dictionary')
  const [dictionaryContributionTab, setDictionaryContributionTab] = useState('drafts')
  const [folkloreContributionTab, setFolkloreContributionTab] = useState('drafts')
  const [dictionaryContributionPage, setDictionaryContributionPage] = useState(1)
  const [folkloreContributionPage, setFolkloreContributionPage] = useState(1)
  const [viewingContribution, setViewingContribution] = useState(null)
  const [confirmingDraftDelete, setConfirmingDraftDelete] = useState(null)
  const [peopleSearch, setPeopleSearch] = useState('')
  const [peopleGroup, setPeopleGroup] = useState('all')
  const [notesById, setNotesById] = useState({})
  const [rejectNotesOpenById, setRejectNotesOpenById] = useState({})
  const [emailInvite, setEmailInvite] = useState(EMPTY_EMAIL_INVITE)
  const [emailInviteNotice, setEmailInviteNotice] = useState(null)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [consultantProfile, setConsultantProfile] = useState(EMPTY_CONSULTANT_PROFILE)
  const [showConsultantProfileForm, setShowConsultantProfileForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingPeople, setLoadingPeople] = useState(false)
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [loadingInvitations, setLoadingInvitations] = useState(false)
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [loadingSiteContent, setLoadingSiteContent] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [creatingConsultantProfile, setCreatingConsultantProfile] = useState(false)
  const [savingSiteContent, setSavingSiteContent] = useState(false)
  const [uploadingFaqImageKey, setUploadingFaqImageKey] = useState('')
  const [updatingLeaderboardUsername, setUpdatingLeaderboardUsername] = useState('')
  const [updatingPublicVisibilityKey, setUpdatingPublicVisibilityKey] = useState('')
  const [deletingDraftId, setDeletingDraftId] = useState('')
  const [actingId, setActingId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!inviteRoleOptions.includes(emailInvite.role)) {
      setEmailInvite((current) => ({ ...current, role: inviteRoleOptions[0] || 'contributor' }))
    }
  }, [emailInvite.role, inviteRoleOptions])

  const counts = useMemo(
    () => ({
      pending: applications.filter((row) => row.status === 'pending').length,
      approved: applications.filter((row) => row.status === 'approved').length,
      rejected: applications.filter((row) => row.status === 'rejected').length,
      total: applications.length,
    }),
    [applications],
  )

  const dictionaryDraftRows = useMemo(() => filterContributionsByTab(dictionaryDrafts, 'drafts'), [dictionaryDrafts])
  const dictionarySubmittedRows = useMemo(() => filterContributionsByTab(dictionaryDrafts, 'submitted'), [dictionaryDrafts])
  const folkloreDraftRows = useMemo(() => filterContributionsByTab(folkloreDrafts, 'drafts'), [folkloreDrafts])
  const folkloreSubmittedRows = useMemo(() => filterContributionsByTab(folkloreDrafts, 'submitted'), [folkloreDrafts])
  const dictionaryContributionRows = useMemo(
    () => filterContributionsByTab(dictionaryDrafts, dictionaryContributionTab),
    [dictionaryDrafts, dictionaryContributionTab],
  )
  const folkloreContributionRows = useMemo(
    () => filterContributionsByTab(folkloreDrafts, folkloreContributionTab),
    [folkloreDrafts, folkloreContributionTab],
  )
  const visibleDictionaryContributions = pagedContributions(dictionaryContributionRows, dictionaryContributionPage)
  const visibleFolkloreContributions = pagedContributions(folkloreContributionRows, folkloreContributionPage)
  const visibleApplications = pagedApplications(applications, applicationPage)
  const visibleInvitations = pagedInvitations(invitations, invitationPage)
  const peopleCounts = useMemo(
    () => ({
      total: people.length,
      admins: people.filter((row) => row.groups.includes('Admin') || row.is_superuser).length,
      consultants: people.filter((row) => row.groups.includes('Consultant')).length,
      reviewers: people.filter((row) => row.groups.includes('Reviewer')).length,
      contributors: people.filter((row) => row.groups.includes('Contributor')).length,
    }),
    [people],
  )

  const inviteSidebar = (
    <aside className="admin-people-side-column">
      <article className={showInviteForm ? 'admin-app-card' : 'admin-app-card admin-invite-collapsed-card'}>
        <div className="section-heading">
          <div>
            <h2>Email Role Invitation</h2>
          </div>
          <button className={showInviteForm ? 'ghost' : ''} onClick={() => setShowInviteForm((current) => !current)}>
            {showInviteForm ? 'Hide Form' : 'Send Invite'}
          </button>
        </div>
        <p className="muted admin-invite-description">
          Invite a trusted individual directly into the platform. Your endorsement is recorded and displayed as part of
          the user's public accountability record. Once accepted, the assigned role becomes active without the standard
          two-person approval process.
        </p>

        {showInviteForm && (
          <>
            <div className="admin-email-invite-fields">
              <label className="field" htmlFor="invite-email">
                <span>Email *</span>
                <input
                  id="invite-email"
                  type="email"
                  value={emailInvite.email}
                  onChange={(event) => updateEmailInvite('email', event.target.value)}
                  placeholder="name@example.com"
                />
              </label>
              <label className="field" htmlFor="invite-email-role">
                <span>Role</span>
                <select
                  id="invite-email-role"
                  value={emailInvite.role}
                  onChange={(event) => updateEmailInvite('role', event.target.value)}
                >
                  {inviteRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor="invite-first-name">
                <span>First name</span>
                <input
                  id="invite-first-name"
                  value={emailInvite.first_name}
                  onChange={(event) => updateEmailInvite('first_name', event.target.value)}
                />
              </label>
              <label className="field" htmlFor="invite-last-name">
                <span>Last name</span>
                <input
                  id="invite-last-name"
                  value={emailInvite.last_name}
                  onChange={(event) => updateEmailInvite('last_name', event.target.value)}
                />
              </label>
              <label className="field" htmlFor="invite-municipality">
                <span>Municipality</span>
                <input
                  id="invite-municipality"
                  value={emailInvite.municipality}
                  onChange={(event) => updateEmailInvite('municipality', event.target.value)}
                />
              </label>
            </div>

            <label className="field" htmlFor="invite-email-notes">
              <span>Invite Notes</span>
              <textarea
                id="invite-email-notes"
                rows={3}
                value={emailInvite.notes}
                onChange={(event) => updateEmailInvite('notes', event.target.value)}
                placeholder="Why this person is trusted for this role"
              />
            </label>

            <div className="actions">
              <button disabled={sendingInvite} onClick={() => sendEmailInvitation()}>
                {sendingInvite ? 'Sending...' : 'Send Email Invitation'}
              </button>
            </div>
            {emailInviteNotice && (
              <div className={`admin-email-invite-notice ${emailInviteNotice.type}`}>
                <strong>{emailInviteNotice.title}</strong>
                <p>{emailInviteNotice.detail}</p>
                {emailInviteNotice.acceptUrl && (
                  <a href={emailInviteNotice.acceptUrl} target="_blank" rel="noreferrer">
                    View invite link
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </article>

      <article className="admin-app-card">
        <div className="section-heading">
          <div>
            <p className="profile-kicker">Invite Status</p>
            <h2>Recent Invitations</h2>
          </div>
          <button className="ghost" disabled={loadingInvitations} onClick={() => loadEmailInvitations()}>
            {loadingInvitations ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="admin-invite-list">
          {!loadingInvitations && invitations.length === 0 && <p className="muted">No email invitations sent yet.</p>}
          {visibleInvitations.map((invitation) => (
            <div key={invitation.invitation_id} className="admin-invite-row">
              <div>
                <strong>{invitation.email}</strong>
                <p className="meta">
                  {roleLabel(invitation.role)} · sent {formatDate(invitation.created_at)}
                </p>
                {invitation.accepted_at && <p className="meta">Accepted {formatDate(invitation.accepted_at)}</p>}
                {invitation.accept_url && (
                  <a className="admin-invite-link" href={invitation.accept_url} target="_blank" rel="noreferrer">
                    Invite link
                  </a>
                )}
              </div>
              <span className={`badge status-${invitation.status}`}>{invitation.status}</span>
            </div>
          ))}
          {renderInvitationPagination()}
        </div>
      </article>
    </aside>
  )

  function changeTab(nextTab) {
    setActiveTab(nextTab)
    window.history.replaceState({}, '', `${ROUTES.adminApplications}?tab=${nextTab}`)
  }

  async function loadApplications(nextFilter = statusFilter) {
    if (!canReviewRoles) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const query = nextFilter === 'all' ? '' : `?status=${encodeURIComponent(nextFilter)}`
      const payload = await apiRequest(`/api/admin/role-applications${query}`)
      setApplications(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadPeople() {
    if (!isAdmin) return
    setLoadingPeople(true)
    setError('')
    setMessage('')
    try {
      const params = new URLSearchParams()
      if (peopleSearch.trim()) params.set('q', peopleSearch.trim())
      if (peopleGroup !== 'all') params.set('group', peopleGroup)
      const suffix = params.toString() ? `?${params.toString()}` : ''
      const payload = await apiRequest(`/api/admin/users${suffix}`)
      setPeople(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingPeople(false)
    }
  }

  async function loadPersonActivity(person) {
    if (!person?.username) return
    setSelectedActivityUser(person)
    setShowActivityLog(true)
    setActivityRows([])
    setLoadingActivity(true)
    setError('')
    try {
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(person.username)}/activity`)
      setActivityRows(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingActivity(false)
    }
  }

  function openPersonProfile(person) {
    setSelectedActivityUser(person)
    setActivityRows([])
    setShowActivityLog(false)
    setError('')
  }

  function closePersonProfile() {
    setSelectedActivityUser(null)
    setActivityRows([])
    setShowActivityLog(false)
  }

  async function updatePersonLeaderboardVisibility(person, nextValue) {
    if (!person?.username) return
    setUpdatingLeaderboardUsername(person.username)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest(`/api/users/${encodeURIComponent(person.username)}/leaderboard-visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_in_leaderboard: nextValue }),
      })
      const applyVisibility = (row) => ({
        ...row,
        profile: {
          ...(row.profile || {}),
          include_in_leaderboard: payload.include_in_leaderboard,
        },
      })
      setPeople((current) => current.map((row) => (row.username === person.username ? applyVisibility(row) : row)))
      setSelectedActivityUser((current) => (
        current?.username === person.username ? applyVisibility(current) : current
      ))
      setMessage(payload.include_in_leaderboard ? 'This person is included in leaderboard rankings.' : 'This person is hidden from leaderboard rankings.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingLeaderboardUsername('')
    }
  }

  async function updatePersonPublicVisibility(person, field, nextValue) {
    if (!person?.username || !['show_on_yaru_chart', 'show_live_contributions'].includes(field)) return
    const updateKey = `${person.username}:${field}`
    setUpdatingPublicVisibilityKey(updateKey)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest(`/api/users/${encodeURIComponent(person.username)}/public-visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: nextValue }),
      })
      const applyVisibility = (row) => ({
        ...row,
        profile: {
          ...(row.profile || {}),
          show_on_yaru_chart: payload.show_on_yaru_chart,
          show_live_contributions: payload.show_live_contributions,
        },
      })
      setPeople((current) => current.map((row) => (row.username === person.username ? applyVisibility(row) : row)))
      setSelectedActivityUser((current) => (
        current?.username === person.username ? applyVisibility(current) : current
      ))
      if (field === 'show_on_yaru_chart') {
        setMessage(payload.show_on_yaru_chart ? 'This person is shown on the Digital Yaru org chart.' : 'This person is hidden from the Digital Yaru org chart.')
      } else {
        setMessage(payload.show_live_contributions ? "This person's approved contributions are shown on the live platform." : "This person's approved contributions are hidden from the live platform.")
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingPublicVisibilityKey('')
    }
  }

  function profileAffiliationLines(rows, firstKey, secondKey) {
    const items = (rows || []).filter((row) => row?.[firstKey] || row?.[secondKey])
    return items.map((item) => [item[firstKey], item[secondKey]].filter(Boolean).join(', '))
  }

  function renderProfileAffiliations(profile) {
    const rows = [
      ...profileAffiliationLines(profile?.cultural_affiliations, 'role', 'organization'),
      ...profileAffiliationLines(profile?.other_affiliations, 'designation', 'institution'),
    ]
    if (rows.length > 0) {
      return (
        <div className="admin-person-affiliation-list">
          {rows.map((row, index) => (
            <p key={`affiliation-${index}`}>{row}</p>
          ))}
        </div>
      )
    }
    if (profile?.affiliation || profile?.occupation) {
      return (
        <div className="admin-person-affiliation-group">
          <p>
            {profile?.occupation && <span>{profile.occupation}</span>}
            {profile?.affiliation && <em>{profile.affiliation}</em>}
          </p>
        </div>
      )
    }
    return '-'
  }

  function renderOnboardingRecords(person) {
    const records = person?.onboarding_records || []
    if (records.length === 0) return '-'
    return (
      <div className="admin-person-onboarding-list">
        {records.map((record, index) => (
          <p key={`${record.role}-${record.method}-${index}`}>
            <span>{record.accountability_label || `${roleLabel(record.role)} access`}</span>
            <time>{formatDate(record.created_at)}</time>
          </p>
        ))}
      </div>
    )
  }

  function handlePeopleSearchSubmit(event) {
    event.preventDefault()
    loadPeople()
  }

  async function loadEmailInvitations() {
    if (!canReviewRoles) return
    setLoadingInvitations(true)
    setError('')
    setMessage('')
    try {
      const payload = await apiRequest('/api/admin/role-invitations/email')
      setInvitations(payload.rows || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingInvitations(false)
    }
  }

  async function loadContributionDrafts() {
    if (!isAuthenticated) return
    setLoadingDrafts(true)
    setError('')
    setMessage('')
    try {
      const [dictionaryPayload, folklorePayload] = await Promise.all([
        apiRequest('/api/dictionary/revisions/my'),
        apiRequest('/api/folklore/revisions/my'),
      ])
      const dictionaryRows = dictionaryPayload.rows || []
      const folkloreRows = folklorePayload.rows || []
      setDictionaryDrafts(sortNewestFirst(dictionaryRows))
      setFolkloreDrafts(sortNewestFirst(folkloreRows))
      setDictionaryPublished(dictionaryRows.filter((row) => row.status === 'approved'))
      setFolklorePublished(folkloreRows.filter((row) => row.status === 'approved'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingDrafts(false)
    }
  }

  async function loadSiteContent() {
    if (!isAdmin) return
    setLoadingSiteContent(true)
    setError('')
    setMessage('')
    try {
      const payload = await apiRequest('/api/site-content')
      setSiteContentForm(siteContentToForm(payload))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingSiteContent(false)
    }
  }

  function setSiteContentField(field, value) {
    setSiteContentForm((current) => ({ ...current, [field]: value }))
  }

  function updateSiteContentRow(group, index, field, value) {
    setSiteContentForm((current) => ({
      ...current,
      [group]: current[group].map((row, rowIndex) => (
        rowIndex === index ? { ...row, [field]: value } : row
      )),
    }))
  }

  function addSiteContentRow(group) {
    const emptyRow = group === 'support_statements' ? EMPTY_SUPPORT_STATEMENT : EMPTY_PARTNER_DETAIL
    setSiteContentForm((current) => ({
      ...current,
      [group]: [...current[group], { ...emptyRow }],
    }))
  }

  function removeSiteContentRow(group, index) {
    const emptyRow = group === 'support_statements' ? EMPTY_SUPPORT_STATEMENT : EMPTY_PARTNER_DETAIL
    setSiteContentForm((current) => {
      const nextRows = current[group].filter((_, rowIndex) => rowIndex !== index)
      return {
        ...current,
        [group]: nextRows.length ? nextRows : [{ ...emptyRow }],
      }
    })
  }

  function updateFaqSection(index, field, value) {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: current.faq_sections.map((section, sectionIndex) => (
        sectionIndex === index ? { ...section, [field]: value } : section
      )),
    }))
  }

  function toggleFaqSectionRole(index, role) {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: current.faq_sections.map((section, sectionIndex) => {
        if (sectionIndex !== index) return section
        const roleSet = new Set(section.roles)
        if (roleSet.has(role)) {
          roleSet.delete(role)
        } else {
          roleSet.add(role)
        }
        return {
          ...section,
          roles: roleSet.size ? Array.from(roleSet) : [role],
        }
      }),
    }))
  }

  function addFaqSection() {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: [
        ...current.faq_sections,
        {
          ...EMPTY_FAQ_SECTION,
          id: `custom-faq-${current.faq_sections.length + 1}`,
          items: [{ ...EMPTY_FAQ_ITEM }],
        },
      ],
    }))
  }

  function removeFaqSection(index) {
    setSiteContentForm((current) => {
      const nextSections = current.faq_sections.filter((_, sectionIndex) => sectionIndex !== index)
      return {
        ...current,
        faq_sections: nextSections.length ? nextSections : [{ ...EMPTY_FAQ_SECTION, items: [{ ...EMPTY_FAQ_ITEM }] }],
      }
    })
  }

  function updateFaqItem(sectionIndex, itemIndex, field, value) {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: current.faq_sections.map((section, currentSectionIndex) => {
        if (currentSectionIndex !== sectionIndex) return section
        return {
          ...section,
          items: section.items.map((item, currentItemIndex) => (
            currentItemIndex === itemIndex ? { ...item, [field]: value } : item
          )),
        }
      }),
    }))
  }

  function addFaqItem(sectionIndex) {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: current.faq_sections.map((section, currentSectionIndex) => (
        currentSectionIndex === sectionIndex
          ? { ...section, items: [...section.items, { ...EMPTY_FAQ_ITEM }] }
          : section
      )),
    }))
  }

  function removeFaqItem(sectionIndex, itemIndex) {
    setSiteContentForm((current) => ({
      ...current,
      faq_sections: current.faq_sections.map((section, currentSectionIndex) => {
        if (currentSectionIndex !== sectionIndex) return section
        const nextItems = section.items.filter((_, currentItemIndex) => currentItemIndex !== itemIndex)
        return {
          ...section,
          items: nextItems.length ? nextItems : [{ ...EMPTY_FAQ_ITEM }],
        }
      }),
    }))
  }

  async function uploadFaqImage(sectionIndex, itemIndex, file) {
    if (!file) return
    const uploadKey = `${sectionIndex}-${itemIndex}`
    setUploadingFaqImageKey(uploadKey)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const body = new FormData()
      body.append('image', file)
      const payload = await apiRequest('/api/site-content/faq-media', {
        method: 'POST',
        body,
      })
      updateFaqItem(sectionIndex, itemIndex, 'image_url', payload.url || '')
      setMessage('FAQ image uploaded. Save Site Content to publish the FAQ edit.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUploadingFaqImageKey('')
    }
  }

  async function saveSiteContent(event) {
    event.preventDefault()
    if (!isAdmin) return

    setSavingSiteContent(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest('/api/site-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(siteContentFromForm(siteContentForm)),
      })
      setSiteContentForm(siteContentToForm(payload))
      setMessage('Site content saved.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingSiteContent(false)
    }
  }

  function renderContributionPagination(rows, page, setPage, label) {
    const totalPages = contributionPageCount(rows)
    if (rows.length <= CONTRIBUTIONS_PER_PAGE) return null

    return (
      <nav className="admin-pagination" aria-label={`${label} contribution pages`}>
        <button className="ghost compact-button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={`${label}-page-${pageNumber}`}
            className={pageNumber === page ? 'compact-button active' : 'ghost compact-button'}
            aria-current={pageNumber === page ? 'page' : undefined}
            onClick={() => setPage(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button className="ghost compact-button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
          Next
        </button>
      </nav>
    )
  }

  function renderApplicationPagination() {
    const totalPages = applicationPageCount(applications)
    if (applications.length <= APPLICATIONS_PER_PAGE) return null

    return (
      <nav className="admin-pagination" aria-label="Application pages">
        <button className="ghost compact-button" disabled={applicationPage <= 1} onClick={() => setApplicationPage((current) => Math.max(1, current - 1))}>
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={`application-page-${pageNumber}`}
            className={pageNumber === applicationPage ? 'compact-button active' : 'ghost compact-button'}
            aria-current={pageNumber === applicationPage ? 'page' : undefined}
            onClick={() => setApplicationPage(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button className="ghost compact-button" disabled={applicationPage >= totalPages} onClick={() => setApplicationPage((current) => Math.min(totalPages, current + 1))}>
          Next
        </button>
      </nav>
    )
  }

  function renderInvitationPagination() {
    const totalPages = invitationPageCount(invitations)
    if (invitations.length <= INVITATIONS_PER_PAGE) return null

    return (
      <nav className="admin-pagination" aria-label="Invitation pages">
        <button className="ghost compact-button" disabled={invitationPage <= 1} onClick={() => setInvitationPage((current) => Math.max(1, current - 1))}>
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={`invitation-page-${pageNumber}`}
            className={pageNumber === invitationPage ? 'compact-button active' : 'ghost compact-button'}
            aria-current={pageNumber === invitationPage ? 'page' : undefined}
            onClick={() => setInvitationPage(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button className="ghost compact-button" disabled={invitationPage >= totalPages} onClick={() => setInvitationPage((current) => Math.min(totalPages, current + 1))}>
          Next
        </button>
      </nav>
    )
  }

  async function deleteContributionDraft(type, revisionId) {
    if (!revisionId) return

    setDeletingDraftId(revisionId)
    setError('')
    setMessage('')
    try {
      const path =
        type === 'folklore'
          ? `/api/folklore/revisions/${revisionId}/delete`
          : `/api/dictionary/revisions/${revisionId}/delete`
      await apiRequest(path, { method: 'DELETE' })
      setMessage('Draft deleted.')
      await loadContributionDrafts()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDeletingDraftId('')
      setConfirmingDraftDelete(null)
    }
  }

  async function decide(applicationId, decision) {
    const notes = notesById[applicationId] || ''
    if (decision === 'reject' && !notes.trim()) {
      setError('Rejection requires notes so the applicant has clear feedback.')
      return
    }
    setActingId(applicationId)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest(`/api/users/role-applications/${applicationId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          notes: decision === 'reject' ? notes : '',
        }),
      })
      setMessage(
        payload.application_status === 'pending'
          ? 'Approval saved. This application is still waiting for quorum.'
          : `Application ${payload.application_status}.`,
      )
      await loadApplications()
      await loadPeople()
      setRejectNotesOpenById((current) => ({ ...current, [applicationId]: false }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setActingId('')
    }
  }

  function handleRejectApplication(applicationId) {
    if (!rejectNotesOpenById[applicationId]) {
      setRejectNotesOpenById((current) => ({ ...current, [applicationId]: true }))
      setError('')
      return
    }
    decide(applicationId, 'reject')
  }

  function renderDictionaryPostedPreview(contribution) {
    const data = contribution.proposed_data || {}
    const term = contribution.term || data.term || '(no headword)'
    const meaning = contribution.meaning || data.meaning || 'No meaning provided yet.'
    const variants = Array.isArray(data.variants) ? data.variants.filter((variant) => variant?.term || variant?.variant_type || variant?.pronunciation_text) : []
    const inflectedForms = parseStructuredValue(data.inflected_forms)
    const inflectionRows = inflectedForms && typeof inflectedForms === 'object' && !Array.isArray(inflectedForms)
      ? Object.entries(inflectedForms).filter(([, value]) => value)
      : []
    const relatedRows = [
      ['English synonym', data.english_synonym],
      ['Ivatan synonym', data.ivatan_synonym],
      ['English antonym', data.english_antonym],
      ['Ivatan antonym', data.ivatan_antonym],
    ]
    const photoUrl = contribution.photo_url
    const audioUrl = contribution.audio_pronunciation_url

    return (
      <article className="dictionary-entry-detail contribution-posted-preview">
        <header className="dictionary-headword">
          <div className="dictionary-headword-row">
            <h2>{term}</h2>
            {audioUrl && (
              <audio className="contribution-inline-audio" controls src={audioUrl}>
                <track kind="captions" />
              </audio>
            )}
          </div>
          <div className="dictionary-pronunciation-line">
            {data.part_of_speech || contribution.part_of_speech ? (
              <span>
                <small>Part of speech</small>
                {data.part_of_speech || contribution.part_of_speech}
              </span>
            ) : null}
            {data.pronunciation_text && (
              <span>
                <small>Pronunciation</small>
                {data.pronunciation_text}
              </span>
            )}
            {data.phonetic && (
              <span>
                <small>Phonetic</small>
                {data.phonetic}
              </span>
            )}
            {data.variant_type || contribution.variant_type ? (
              <span>
                <small>Variant</small>
                {data.variant_type || contribution.variant_type}
              </span>
            ) : null}
          </div>
        </header>

        {variants.length > 0 && (
          <section className="dictionary-field-block">
            <h4>Additional Variants</h4>
            <div className="variant-preview-list">
              {variants.map((variant, index) => (
                <article key={`preview-variant-${index}`}>
                  <strong>{variant.term || `Variant ${index + 1}`}</strong>
                  <p className="meta">
                    {[variant.variant_type, variant.pronunciation_text].filter(Boolean).join(' | ') || 'Details not set'}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {photoUrl && <img className="dictionary-photo-preview" src={photoUrl} alt="" />}

        <section className="dictionary-definition">
          <p className="definition-number">1</p>
          <div>
            <p className="definition-label">Meaning</p>
            <p>{meaning}</p>
          </div>
        </section>

        {(data.example_sentence || data.example_translation) && (
          <section className="dictionary-field-block">
            <h4>Sample Sentence</h4>
            <div className="example-translation-grid">
              <div>
                <p className="meta">Ivatan</p>
                <p>{data.example_sentence || '-'}</p>
              </div>
              <div>
                <p className="meta">English</p>
                <p>{data.example_translation || '-'}</p>
              </div>
            </div>
          </section>
        )}

        {data.usage_notes && (
          <section className="dictionary-field-block">
            <h4>Usage Notes</h4>
            <p>{data.usage_notes}</p>
          </section>
        )}
        {data.etymology && (
          <section className="dictionary-field-block">
            <h4>Etymology</h4>
            <p>{data.etymology}</p>
          </section>
        )}
        {inflectionRows.length > 0 && (
          <section className="dictionary-field-block">
            <h4>Inflected Forms</h4>
            <div className="dictionary-chip-row">
              {inflectionRows.map(([label, value]) => (
                <span key={`${label}-${value}`}>{label}: {value}</span>
              ))}
            </div>
          </section>
        )}
        {relatedRows.some(([, value]) => splitList(value).length > 0) && (
          <section className="dictionary-field-block">
            <h4>Related Words</h4>
            <div className="dictionary-chip-row">
              {relatedRows.flatMap(([label, value]) =>
                splitList(value).map((item) => <span key={`${label}-${item}`}>{label}: {item}</span>),
              )}
            </div>
          </section>
        )}

        <section className="dictionary-attribution-block">
          <h4>Attribution</h4>
          <div className="detail-list">
            <p>Contributor and reviewer names will appear here after approval.</p>
            <p>
              {[
                data.source_text ? `Term Source: ${data.source_text}` : '',
                data.audio_source ? `Audio Source: ${data.audio_source}` : '',
                data.photo_source ? `Image Source: ${data.photo_source}` : '',
              ]
                .filter(Boolean)
                .join(', ') || 'No external source notes.'}
            </p>
          </div>
        </section>
      </article>
    )
  }

  function renderFolklorePostedPreview(contribution) {
    const data = contribution.proposed_data || {}
    const title = contribution.title || data.title || '(untitled folklore)'
    const mediaUrl = contribution.media_url || data.media_url
    const embedUrl = getYouTubeEmbedUrl(mediaUrl)

    return (
      <article className="detail-main draft-folklore-preview contribution-posted-preview">
        {embedUrl && (
          <div className="youtube-embed-wrap">
            <iframe
              src={embedUrl}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )}
        {contribution.photo_upload_url && <img className="folklore-photo-preview" src={contribution.photo_upload_url} alt="" />}
        {contribution.audio_upload_url && (
          <audio className="contribution-folklore-audio" controls src={contribution.audio_upload_url}>
            <track kind="captions" />
          </audio>
        )}
        {!embedUrl && mediaUrl && (
          <a href={mediaUrl} target="_blank" rel="noreferrer">
            Open media link
          </a>
        )}
        <p className="profile-kicker">
          {folkloreTaxonomyLabel(contribution.category || data.category, contribution.subcategory || data.subcategory) || 'Folklore'} |{' '}
          {contribution.municipality_source || data.municipality_source || 'Not Applicable'}
        </p>
        <h2>{title}</h2>
        <p className="story-text">{contribution.content || data.content || 'No content provided.'}</p>
        <div className="folklore-metadata-layout">
          <section className="folklore-attribution-block">
            <h4>Details</h4>
            <div className="folklore-attribution-grid">
              <p>
                <span>Main Category</span>
                <strong>{folkloreTaxonomyLabel(contribution.category || data.category, '') || contribution.category || data.category || '-'}</strong>
              </p>
              <p>
                <span>Subcategory</span>
                <strong>{folkloreTaxonomyLabel('', contribution.subcategory || data.subcategory) || contribution.subcategory || data.subcategory || '-'}</strong>
              </p>
              <p>
                <span>Place</span>
                <strong>{contribution.municipality_source || data.municipality_source || '-'}</strong>
              </p>
              <p>
                <span>Date Added</span>
                <strong>Shown after approval</strong>
              </p>
            </div>
          </section>
          <section className="folklore-attribution-block">
            <h4>Attribution</h4>
            <div className="folklore-attribution-grid">
              <p>
                <span>Contributor</span>
                <strong>Shown after approval</strong>
              </p>
              {(contribution.source || data.source) && (
                <p>
                  <span>Source</span>
                  <strong>{contribution.source || data.source}</strong>
                </p>
              )}
              {(contribution.media_source || data.media_source) && (
                <p>
                  <span>Media</span>
                  <strong>{contribution.media_source || data.media_source}</strong>
                </p>
              )}
              <p>
                <span>Copyright</span>
                <strong>{contribution.copyright_usage || data.copyright_usage || '-'}</strong>
              </p>
            </div>
          </section>
        </div>
      </article>
    )
  }

  function renderContributionPreviewModal() {
    if (!viewingContribution) return null
    const { type, contribution } = viewingContribution
    const title = type === 'dictionary' ? contribution.term || '(no headword)' : contribution.title || '(no title)'

    return (
      <div className="celebration-backdrop contribution-preview-backdrop" role="presentation" onClick={() => setViewingContribution(null)}>
        <article
          className="contribution-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contribution-preview-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="section-heading">
            <div>
              <p className="profile-kicker">Read-only publication preview</p>
              <h2 id="contribution-preview-title">{title}</h2>
            </div>
            <span className={`badge status-${contribution.status || 'draft'}`}>
              {contributionStatusLabel(contribution.status)}
            </span>
          </div>
          <p className="muted">{contributionStatusDetail(contribution)}</p>
          {type === 'dictionary' ? renderDictionaryPostedPreview(contribution) : renderFolklorePostedPreview(contribution)}
          <div className="actions">
            <button onClick={() => setViewingContribution(null)}>Close</button>
          </div>
        </article>
      </div>
    )
  }

  function updateEmailInvite(field, value) {
    setEmailInvite((current) => ({ ...current, [field]: value }))
    setEmailInviteNotice(null)
  }

  function updateConsultantProfile(field, value) {
    setConsultantProfile((current) => ({ ...current, [field]: value }))
  }

  async function sendEmailInvitation() {
    const email = emailInvite.email.trim().toLowerCase()
    if (!email) {
      setError('Email address is required for an invitation.')
      setEmailInviteNotice({
        type: 'error',
        title: 'Email required',
        detail: 'Enter an email address before sending the invitation.',
      })
      return
    }
    const emailError = emailValidationMessage(email)
    if (emailError) {
      setError(emailError)
      setEmailInviteNotice({
        type: 'error',
        title: 'Invalid email address',
        detail: emailError,
      })
      return
    }

    setSendingInvite(true)
    setError('')
    setMessage('')
    setEmailInviteNotice(null)
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest('/api/admin/role-invitations/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role: emailInvite.role,
          first_name: emailInvite.first_name,
          last_name: emailInvite.last_name,
          municipality: emailInvite.municipality,
          notes: emailInvite.notes,
        }),
      })
      setMessage(payload.email_sent === false ? `Invitation created for ${payload.email}.` : `Invitation sent to ${payload.email}.`)
      setEmailInviteNotice({
        type: payload.email_sent === false ? 'warning' : 'success',
        title: payload.email_sent === false ? 'Invitation created, email not delivered' : 'Invitation sent',
        detail: payload.warning || `${payload.email} can now accept the ${roleLabel(payload.role)} invitation from the email link.`,
        acceptUrl: payload.accept_url,
      })
      setEmailInvite((current) => ({ ...current, notes: '' }))
      await loadPeople()
      await loadEmailInvitations()
    } catch (requestError) {
      setError(requestError.message)
      setEmailInviteNotice({
        type: 'error',
        title: 'Invitation not sent',
        detail: requestError.message,
      })
    } finally {
      setSendingInvite(false)
    }
  }

  async function createManagedConsultantProfile(event) {
    event.preventDefault()
    if (!consultantProfile.first_name.trim() || !consultantProfile.last_name.trim()) {
      setError('First name and last name are required for a consultant profile.')
      return
    }
    const emailError = emailValidationMessage(consultantProfile.email, { required: false })
    if (emailError) {
      setError(emailError)
      return
    }

    setCreatingConsultantProfile(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest('/api/admin/consultant-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(consultantProfile),
      })
      setMessage(`Consultant profile created for ${displayName(payload.user)}.`)
      setConsultantProfile(EMPTY_CONSULTANT_PROFILE)
      setShowConsultantProfileForm(false)
      setPeople((current) => [payload.user, ...current.filter((row) => row.username !== payload.user.username)])
      setSelectedActivityUser(payload.user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreatingConsultantProfile(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return
    if (isAdmin) return
    if (canReviewRoles && !['applications', 'reviews', 'contributions'].includes(activeTab)) {
      setActiveTab('reviews')
      return
    }
    if (!canReviewRoles && activeTab !== 'contributions') {
      setActiveTab('contributions')
    }
  }, [activeTab, canReviewRoles, isAdmin, isAuthenticated])

  useEffect(() => {
    function syncTabFromUrl() {
      const requestedTab = tabFromQuery()
      if (requestedTab) setActiveTab(normalizeDeskTab(requestedTab))
    }

    syncTabFromUrl()
    window.addEventListener('popstate', syncTabFromUrl)
    return () => window.removeEventListener('popstate', syncTabFromUrl)
  }, [])

  useEffect(() => {
    if (!canReviewRoles) return
    loadApplications(statusFilter)
    if (activeTab === 'applications') loadEmailInvitations()
    // Reload when the current user, selected filter, or active tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReviewRoles, isAdmin, statusFilter, activeTab])

  useEffect(() => {
    if (!isAdmin) return
    if (activeTab !== 'people') return
    loadPeople()
    // Load people only when the People tab is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, peopleGroup, activeTab])

  useEffect(() => {
    if (activeTab !== 'people') {
      setSelectedActivityUser(null)
      setActivityRows([])
      setShowActivityLog(false)
    }
  }, [activeTab])

  useEffect(() => {
    if (!isAdmin) return
    if (activeTab !== 'people') return
    const timeoutId = window.setTimeout(() => {
      loadPeople()
    }, 300)
    return () => window.clearTimeout(timeoutId)
    // Debounce text search while the People tab is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleSearch])

  useEffect(() => {
    if (activeTab !== 'contributions') return
    loadContributionDrafts()
    // Load current user's draft rows when opening Contributions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthenticated])

  useEffect(() => {
    if (!isAdmin || activeTab !== 'site') return
    loadSiteContent()
    // Load public page copy only when the Site Content tab is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdmin])

  useEffect(() => {
    setApplicationPage(1)
  }, [statusFilter])

  useEffect(() => {
    setApplicationPage((current) => Math.min(current, applicationPageCount(applications)))
  }, [applications])

  useEffect(() => {
    setInvitationPage((current) => Math.min(current, invitationPageCount(invitations)))
  }, [invitations])

  useEffect(() => {
    setDictionaryContributionPage((current) => Math.min(current, contributionPageCount(dictionaryContributionRows)))
  }, [dictionaryContributionRows])

  useEffect(() => {
    setFolkloreContributionPage((current) => Math.min(current, contributionPageCount(folkloreContributionRows)))
  }, [folkloreContributionRows])

  if (!isAuthenticated) {
    return (
      <section className="panel">
        <h1>Steward's Desk</h1>
        <p className="alert error">Log in to open your contribution desk.</p>
        <button onClick={() => navigate(ROUTES.login)}>Log In</button>
      </section>
    )
  }

  return (
    <section className="admin-applications-page">
      <div className="admin-applications-header">
        <div>
          <p className="profile-kicker">{isAdmin ? 'Admin' : isConsultant ? 'Consultant' : isReviewer ? 'Reviewer' : 'Contributor'}</p>
          <h1>Steward's Desk</h1>
        </div>
        <button
          disabled={loading || loadingPeople || loadingInvitations || loadingDrafts || loadingSiteContent}
          onClick={() => {
            if (activeTab === 'applications') {
              loadApplications()
              loadEmailInvitations()
            }
            if (activeTab === 'people') {
              loadPeople()
            }
            if (activeTab === 'site') loadSiteContent()
            if (activeTab === 'contributions') loadContributionDrafts()
            if (activeTab === 'reviews') setReviewRefreshToken((current) => current + 1)
          }}
        >
          {loading || loadingPeople || loadingInvitations || loadingDrafts || loadingSiteContent ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {canReviewRoles && (
        <div className="admin-tabs" aria-label="Admin sections">
          {canReviewRoles && (
            <button
              className={activeTab === 'reviews' ? 'admin-tab active' : 'admin-tab'}
              onClick={() => changeTab('reviews')}
            >
              Reviews
            </button>
          )}
          {canReviewRoles && (
            <button
              className={activeTab === 'applications' ? 'admin-tab active' : 'admin-tab'}
              onClick={() => changeTab('applications')}
            >
              Applications
            </button>
          )}
          {isAdmin && (
            <button
              className={activeTab === 'people' ? 'admin-tab active' : 'admin-tab'}
              onClick={() => changeTab('people')}
            >
              People
            </button>
          )}
          {isAdmin && (
            <button
              className={activeTab === 'site' ? 'admin-tab active' : 'admin-tab'}
              onClick={() => changeTab('site')}
            >
              Site Content
            </button>
          )}
          <button
            className={activeTab === 'contributions' ? 'admin-tab active' : 'admin-tab'}
            onClick={() => changeTab('contributions')}
          >
            Contributions
          </button>
        </div>
      )}

      {canReviewRoles && activeTab === 'applications' && (
        <>
          <div className="admin-app-summary" aria-label="Application summary">
        <article>
          <p className="stat-label">Pending</p>
          <p className="stat-value">{counts.pending}</p>
        </article>
        <article>
          <p className="stat-label">Approved</p>
          <p className="stat-value">{counts.approved}</p>
        </article>
        <article>
          <p className="stat-label">Rejected</p>
          <p className="stat-value">{counts.rejected}</p>
        </article>
      </div>

          <div className="admin-app-toolbar">
        <label className="field" htmlFor="application-status-filter">
          <span>Status</span>
          <select
            id="application-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

          {error && <p className="alert error">{error}</p>}
          {message && <p className="alert ok">{message}</p>}

          <div className="admin-applications-layout">
            <div className="admin-app-list">
              {!loading && applications.length === 0 && <p className="muted">No applications found for this filter.</p>}
              {visibleApplications.map((application) => {
                const applicant = application.applicant
                const isPending = application.status === 'pending'
                return (
                  <article key={application.application_id} className="admin-app-card">
                    <div className="admin-app-main">
                      <ApplicantAvatar applicant={applicant} />
                      <div>
                        <div className="queue-header">
                          <h2>{displayName(applicant)}</h2>
                          <span className={`badge status-${application.status}`}>{application.status}</span>
                        </div>
                        <p className="meta">
                          @{applicant.username} applying as <strong>{roleLabel(application.target_role)}</strong>
                        </p>
                        <p className="application-rule-text">{applicationRule(application.target_role)}</p>
                        <p className="meta">
                          {applicant.municipality || 'No municipality yet'}
                          {applicant.affiliation ? ` - ${applicant.affiliation}` : ''}
                          {applicant.occupation ? ` - ${applicant.occupation}` : ''}
                        </p>
                        {affiliationText(applicant.cultural_affiliations, 'role', 'organization') && (
                          <p className="meta">
                            Cultural: {affiliationText(applicant.cultural_affiliations, 'role', 'organization')}
                          </p>
                        )}
                        {affiliationText(applicant.other_affiliations, 'designation', 'institution') && (
                          <p className="meta">
                            Other: {affiliationText(applicant.other_affiliations, 'designation', 'institution')}
                          </p>
                        )}
                        <p className="meta">Submitted {formatDate(application.created_at)}</p>
                      </div>
                    </div>

                    <div className="admin-app-details">
                      <div>
                        <p className="stat-label">Screening Progress</p>
                        <p className="meta">{approvalProgress(application)}</p>
                      </div>
                      <div>
                        <p className="stat-label">Current Roles</p>
                        <p className="meta">{applicant.groups.length ? applicant.groups.join(', ') : 'None'}</p>
                      </div>
                      <div>
                        <p className="stat-label">Decision History</p>
                        {application.decisions.length === 0 ? (
                          <p className="meta">No decisions yet.</p>
                        ) : (
                          application.decisions.map((row) => (
                            <p key={row.decision_id} className="meta">
                              {row.decision} by {row.decided_by} ({row.decider_role}) on {formatDate(row.created_at)}
                              {row.notes ? ` - ${row.notes}` : ''}
                            </p>
                          ))
                        )}
                      </div>
                    </div>

                    {isPending && (
                      <div className="admin-app-actions">
                        {rejectNotesOpenById[application.application_id] && (
                          <label className="field" htmlFor={`notes-${application.application_id}`}>
                            <span>Rejection notes</span>
                            <textarea
                              id={`notes-${application.application_id}`}
                              rows={2}
                              value={notesById[application.application_id] || ''}
                              onChange={(event) =>
                                setNotesById((current) => ({
                                  ...current,
                                  [application.application_id]: event.target.value,
                                }))
                              }
                              placeholder="Required so the applicant has clear feedback."
                            />
                          </label>
                        )}
                        <div className="actions">
                          <button
                            disabled={actingId === application.application_id}
                            onClick={() => decide(application.application_id, 'approve')}
                          >
                            Approve
                          </button>
                          <button
                            className="ghost"
                            disabled={actingId === application.application_id}
                            onClick={() => handleRejectApplication(application.application_id)}
                          >
                            {rejectNotesOpenById[application.application_id] ? 'Submit Reject' : 'Reject'}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
              {renderApplicationPagination()}
            </div>
            {inviteSidebar}
          </div>
        </>
      )}

      {isAdmin && activeTab === 'people' && (
        <>
          <div className="admin-app-summary" aria-label="People summary">
            <article>
              <p className="stat-label">Loaded People</p>
              <p className="stat-value">{peopleCounts.total}</p>
            </article>
            <article>
              <p className="stat-label">Admins</p>
              <p className="stat-value">{peopleCounts.admins}</p>
            </article>
            <article>
              <p className="stat-label">Consultants</p>
              <p className="stat-value">{peopleCounts.consultants}</p>
            </article>
            <article>
              <p className="stat-label">Reviewers</p>
              <p className="stat-value">{peopleCounts.reviewers}</p>
            </article>
            <article>
              <p className="stat-label">Contributors</p>
              <p className="stat-value">{peopleCounts.contributors}</p>
            </article>
          </div>

          <form className="admin-people-toolbar" onSubmit={handlePeopleSearchSubmit}>
            <label className="field" htmlFor="people-search">
              <span>Search people</span>
              <input
                id="people-search"
                value={peopleSearch}
                onChange={(event) => setPeopleSearch(event.target.value)}
                placeholder="Name, username, email, municipality"
              />
            </label>
            <label className="field" htmlFor="people-group">
              <span>Role group</span>
              <select id="people-group" value={peopleGroup} onChange={(event) => setPeopleGroup(event.target.value)}>
                {USER_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={loadingPeople}>
              {loadingPeople ? 'Searching...' : 'Search'}
            </button>
          </form>

          <section className="admin-app-card admin-consultant-profile-card">
            <div className="section-heading">
              <div>
                <p className="profile-kicker">Consultant Profiles</p>
                <h2>Managed Consultant Profile</h2>
              </div>
              <button
                type="button"
                className={showConsultantProfileForm ? 'ghost compact-button' : 'compact-button'}
                onClick={() => setShowConsultantProfileForm((current) => !current)}
              >
                {showConsultantProfileForm ? 'Hide Form' : 'Create Profile'}
              </button>
            </div>
            <p className="muted">
              Create a public consultant profile for trusted knowledge holders who should not need to manage an account.
              The profile receives consultant recognition and reviewer-level access in the audit trail, but no usable password.
            </p>
            {showConsultantProfileForm && (
              <form className="admin-consultant-profile-form" onSubmit={createManagedConsultantProfile}>
                <div className="field-grid">
                  <label className="field" htmlFor="consultant-first-name">
                    <span>First name *</span>
                    <input
                      id="consultant-first-name"
                      value={consultantProfile.first_name}
                      onChange={(event) => updateConsultantProfile('first_name', event.target.value)}
                    />
                  </label>
                  <label className="field" htmlFor="consultant-last-name">
                    <span>Last name *</span>
                    <input
                      id="consultant-last-name"
                      value={consultantProfile.last_name}
                      onChange={(event) => updateConsultantProfile('last_name', event.target.value)}
                    />
                  </label>
                  <label className="field" htmlFor="consultant-email">
                    <span>Email</span>
                    <input
                      id="consultant-email"
                      type="email"
                      value={consultantProfile.email}
                      onChange={(event) => updateConsultantProfile('email', event.target.value)}
                    />
                  </label>
                  <label className="field" htmlFor="consultant-municipality">
                    <span>Municipality</span>
                    <input
                      id="consultant-municipality"
                      value={consultantProfile.municipality}
                      onChange={(event) => updateConsultantProfile('municipality', event.target.value)}
                    />
                  </label>
                  <label className="field" htmlFor="consultant-post-nominals">
                    <span>Post-nominals / honorifics</span>
                    <input
                      id="consultant-post-nominals"
                      value={consultantProfile.post_nominals}
                      onChange={(event) => updateConsultantProfile('post_nominals', event.target.value)}
                    />
                  </label>
                  <label className="field" htmlFor="consultant-affiliation">
                    <span>Affiliation</span>
                    <input
                      id="consultant-affiliation"
                      value={consultantProfile.affiliation}
                      onChange={(event) => updateConsultantProfile('affiliation', event.target.value)}
                    />
                  </label>
                </div>
                <label className="field" htmlFor="consultant-occupation">
                  <span>Role or occupation</span>
                  <input
                    id="consultant-occupation"
                    value={consultantProfile.occupation}
                    onChange={(event) => updateConsultantProfile('occupation', event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="consultant-bio">
                  <span>Public bionote</span>
                  <textarea
                    id="consultant-bio"
                    rows={3}
                    value={consultantProfile.bio}
                    onChange={(event) => updateConsultantProfile('bio', event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="consultant-notes">
                  <span>Admin notes</span>
                  <textarea
                    id="consultant-notes"
                    rows={2}
                    value={consultantProfile.notes}
                    onChange={(event) => updateConsultantProfile('notes', event.target.value)}
                    placeholder="Consent, context, or why this person is trusted as a consultant"
                  />
                </label>
                <div className="actions">
                  <button type="submit" disabled={creatingConsultantProfile}>
                    {creatingConsultantProfile ? 'Creating...' : 'Create Consultant Profile'}
                  </button>
                </div>
              </form>
            )}
          </section>

          {error && <p className="alert error">{error}</p>}
          {message && <p className="alert ok">{message}</p>}

          <div className="table-wrap admin-people-main">
            <table className="simple-table admin-people-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Roles</th>
                  <th>Municipality</th>
                  <th>Contributions</th>
                  <th>Reviews</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {!loadingPeople && people.length === 0 && (
                  <tr>
                    <td colSpan="6">No people found for this search.</td>
                  </tr>
                )}
                {people.map((person) => (
                  <tr
                    key={person.username}
                    className={selectedActivityUser?.username === person.username ? 'admin-person-row active' : 'admin-person-row'}
                  >
                    <td>
                      <button className="admin-person-cell admin-person-cell-button" type="button" onClick={() => openPersonProfile(person)}>
                        <ApplicantAvatar applicant={person} />
                        <span>
                          <strong>{displayName(person)}</strong>
                          <span className="meta">@{person.username}</span>
                          <span className="meta">{person.email || 'No email set'}</span>
                        </span>
                      </button>
                    </td>
                    <td>{person.groups.length ? person.groups.join(', ') : person.is_superuser ? 'Superuser' : 'Registered'}</td>
                    <td>{person.profile?.municipality || '-'}</td>
                    <td>{person.stats?.combined_total || 0}</td>
                    <td>{person.stats?.review_completed_total || 0}</td>
                    <td>{formatDate(person.date_joined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedActivityUser && (
            <div className="admin-person-modal-backdrop" role="presentation" onClick={closePersonProfile}>
              <aside
                className="admin-activity-panel admin-person-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-person-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="section-heading">
                  <div>
                    <p className="profile-kicker">Profile & Activity</p>
                    <h3 id="admin-person-modal-title">{displayName(selectedActivityUser)}</h3>
                  </div>
                  <button className="ghost compact-button" onClick={closePersonProfile}>
                    Close
                  </button>
                </div>
                <div className="admin-person-profile-card">
                  <div className="admin-person-profile-head">
                    <ApplicantAvatar applicant={selectedActivityUser} />
                    <div>
                      <strong>{displayName(selectedActivityUser)}</strong>
                      <p className="meta">@{selectedActivityUser.username}</p>
                      <p className="meta">{selectedActivityUser.email || 'No email set'}</p>
                    </div>
                  </div>
                  <dl className="admin-person-profile-grid">
                    <div>
                      <dt>Roles</dt>
                      <dd>{selectedActivityUser.groups?.length ? selectedActivityUser.groups.join(', ') : selectedActivityUser.is_superuser ? 'Superuser' : 'Registered'}</dd>
                    </div>
                    <div>
                      <dt>Municipality</dt>
                      <dd>{selectedActivityUser.profile?.municipality || '-'}</dd>
                    </div>
                    <div>
                      <dt>Contributions</dt>
                      <dd>{selectedActivityUser.stats?.combined_total || 0}</dd>
                    </div>
                    <div>
                      <dt>Reviews</dt>
                      <dd>{selectedActivityUser.stats?.review_completed_total || 0}</dd>
                    </div>
                    <div>
                      <dt>Leaderboard</dt>
                      <dd>{selectedActivityUser.profile?.include_in_leaderboard === false ? 'Hidden' : 'Included'}</dd>
                    </div>
                    <div>
                      <dt>Yaru Org Chart</dt>
                      <dd>{selectedActivityUser.profile?.show_on_yaru_chart === false ? 'Hidden' : 'Shown'}</dd>
                    </div>
                    <div>
                      <dt>Live Contributions</dt>
                      <dd>{selectedActivityUser.profile?.show_live_contributions === false ? 'Hidden' : 'Shown'}</dd>
                    </div>
                    <div>
                      <dt>Joined</dt>
                      <dd>{formatDate(selectedActivityUser.date_joined)}</dd>
                    </div>
                    <div className="admin-person-profile-wide">
                      <dt>Role Access</dt>
                      <dd>{renderOnboardingRecords(selectedActivityUser)}</dd>
                    </div>
                    <div className="admin-person-profile-wide">
                      <dt>Affiliations</dt>
                      <dd>{renderProfileAffiliations(selectedActivityUser.profile)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="admin-person-log-controls">
                  <button
                    className="ghost compact-button"
                    onClick={() => navigate(`${ROUTES.profileView}?username=${encodeURIComponent(selectedActivityUser.username)}`)}
                  >
                    Public Profile
                  </button>
                  <button
                    className="ghost compact-button"
                    disabled={updatingLeaderboardUsername === selectedActivityUser.username}
                    onClick={() =>
                      updatePersonLeaderboardVisibility(
                        selectedActivityUser,
                        selectedActivityUser.profile?.include_in_leaderboard === false,
                      )
                    }
                  >
                    {updatingLeaderboardUsername === selectedActivityUser.username
                      ? 'Updating...'
                      : selectedActivityUser.profile?.include_in_leaderboard === false
                        ? 'Count on Leaderboard'
                        : 'Hide from Leaderboard'}
                  </button>
                  <button
                    className="ghost compact-button"
                    disabled={updatingPublicVisibilityKey === `${selectedActivityUser.username}:show_on_yaru_chart`}
                    onClick={() =>
                      updatePersonPublicVisibility(
                        selectedActivityUser,
                        'show_on_yaru_chart',
                        selectedActivityUser.profile?.show_on_yaru_chart === false,
                      )
                    }
                  >
                    {updatingPublicVisibilityKey === `${selectedActivityUser.username}:show_on_yaru_chart`
                      ? 'Updating...'
                      : selectedActivityUser.profile?.show_on_yaru_chart === false
                        ? 'Show on Org Chart'
                        : 'Hide from Org Chart'}
                  </button>
                  <button
                    className="ghost compact-button"
                    disabled={updatingPublicVisibilityKey === `${selectedActivityUser.username}:show_live_contributions`}
                    onClick={() =>
                      updatePersonPublicVisibility(
                        selectedActivityUser,
                        'show_live_contributions',
                        selectedActivityUser.profile?.show_live_contributions === false,
                      )
                    }
                  >
                    {updatingPublicVisibilityKey === `${selectedActivityUser.username}:show_live_contributions`
                      ? 'Updating...'
                      : selectedActivityUser.profile?.show_live_contributions === false
                        ? 'Show Live Contributions'
                        : 'Hide Live Contributions'}
                  </button>
                  <button className="ghost compact-button" disabled={loadingActivity} onClick={() => loadPersonActivity(selectedActivityUser)}>
                    {showActivityLog ? 'Refresh action log' : 'View action log'}
                  </button>
                  {showActivityLog && <p className="muted">Latest 500 actions are shown. Audit records stay in the system.</p>}
                </div>
                {showActivityLog && loadingActivity && <p className="muted">Loading action log...</p>}
                {showActivityLog && !loadingActivity && activityRows.length === 0 && (
                  <p className="muted">No recorded activity for this person yet.</p>
                )}
                {showActivityLog && activityRows.length > 0 && (
                  <div className="admin-activity-list">
                    {activityRows.map((row) => (
                      <article key={row.id} className="admin-activity-row">
                        <div>
                          <strong>{row.label}</strong>
                          <p>{[row.target_label, row.detail].filter(Boolean).join(' · ')}</p>
                        </div>
                        <time>{formatDate(row.created_at)}</time>
                      </article>
                    ))}
                  </div>
                )}
              </aside>
            </div>
          )}
        </>
      )}

      {isAdmin && activeTab === 'site' && (
        <form className="admin-site-content-layout" onSubmit={saveSiteContent}>
          {error && <p className="alert error">{error}</p>}
          {message && <p className="alert ok">{message}</p>}
          {loadingSiteContent && <p className="muted">Loading site content...</p>}

          <section className="admin-app-card admin-site-content-card">
            <div className="section-heading">
              <div>
                <p className="profile-kicker">Public Pages</p>
                <h2>About Page</h2>
              </div>
            </div>
            <label className="field" htmlFor="site-about-heading">
              <span>Heading</span>
              <input
                id="site-about-heading"
                value={siteContentForm.about_heading}
                onChange={(event) => setSiteContentField('about_heading', event.target.value)}
              />
            </label>
            <label className="field" htmlFor="site-about-intro">
              <span>Intro paragraphs</span>
              <textarea
                id="site-about-intro"
                rows={5}
                value={siteContentForm.about_intro_text}
                onChange={(event) => setSiteContentField('about_intro_text', event.target.value)}
              />
            </label>
            <label className="field" htmlFor="site-about-body">
              <span>Main description</span>
              <textarea
                id="site-about-body"
                rows={7}
                value={siteContentForm.about_body_text}
                onChange={(event) => setSiteContentField('about_body_text', event.target.value)}
              />
            </label>
            <label className="field" htmlFor="site-about-rationale">
              <span>Rationale</span>
              <textarea
                id="site-about-rationale"
                rows={6}
                value={siteContentForm.about_rationale_text}
                onChange={(event) => setSiteContentField('about_rationale_text', event.target.value)}
              />
            </label>
            <label className="field" htmlFor="site-about-future">
              <span>Future directions</span>
              <textarea
                id="site-about-future"
                rows={6}
                value={siteContentForm.about_future_text}
                onChange={(event) => setSiteContentField('about_future_text', event.target.value)}
              />
            </label>
            <label className="field" htmlFor="site-about-quote">
              <span>Closing quote</span>
              <textarea
                id="site-about-quote"
                rows={3}
                value={siteContentForm.about_final_quote}
                onChange={(event) => setSiteContentField('about_final_quote', event.target.value)}
              />
            </label>
          </section>

          <section className="admin-app-card admin-site-content-card">
            <div className="section-heading">
              <div>
                <p className="profile-kicker">Public Pages</p>
                <h2>Digital Yaru Intro</h2>
              </div>
            </div>
            <label className="field" htmlFor="site-yaru-heading">
              <span>Heading</span>
              <input
                id="site-yaru-heading"
                value={siteContentForm.yaru_heading}
                onChange={(event) => setSiteContentField('yaru_heading', event.target.value)}
              />
            </label>
            <label className="field" htmlFor="site-yaru-intro">
              <span>Intro paragraphs</span>
              <textarea
                id="site-yaru-intro"
                rows={6}
                value={siteContentForm.yaru_intro_text}
                onChange={(event) => setSiteContentField('yaru_intro_text', event.target.value)}
              />
            </label>
          </section>

          <section className="admin-app-card admin-site-content-card">
            <div className="section-heading">
              <div>
                <p className="profile-kicker">About Page</p>
                <h2>Statements of Support</h2>
              </div>
              <button type="button" className="ghost compact-button" onClick={() => addSiteContentRow('support_statements')}>
                Add Statement
              </button>
            </div>
            <div className="admin-site-repeat-list">
              {siteContentForm.support_statements.map((row, index) => (
                <article key={`site-support-${index}`} className="admin-site-repeat-row">
                  <label className="field" htmlFor={`site-support-quote-${index}`}>
                    <span>Statement</span>
                    <textarea
                      id={`site-support-quote-${index}`}
                      rows={3}
                      value={row.quote}
                      onChange={(event) => updateSiteContentRow('support_statements', index, 'quote', event.target.value)}
                    />
                  </label>
                  <div className="field-grid">
                    <label className="field" htmlFor={`site-support-name-${index}`}>
                      <span>Name</span>
                      <input
                        id={`site-support-name-${index}`}
                        value={row.name}
                        onChange={(event) => updateSiteContentRow('support_statements', index, 'name', event.target.value)}
                      />
                    </label>
                    <label className="field" htmlFor={`site-support-role-${index}`}>
                      <span>Role or affiliation</span>
                      <input
                        id={`site-support-role-${index}`}
                        value={row.role}
                        onChange={(event) => updateSiteContentRow('support_statements', index, 'role', event.target.value)}
                      />
                    </label>
                  </div>
                  {siteContentForm.support_statements.length > 1 && (
                    <button type="button" className="ghost compact-button danger" onClick={() => removeSiteContentRow('support_statements', index)}>
                      Remove Statement
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="admin-app-card admin-site-content-card">
            <div className="section-heading">
              <div>
                <p className="profile-kicker">About Page</p>
                <h2>Partner Details</h2>
              </div>
              <button type="button" className="ghost compact-button" onClick={() => addSiteContentRow('partner_details')}>
                Add Partner
              </button>
            </div>
            <div className="admin-site-repeat-list">
              {siteContentForm.partner_details.map((row, index) => (
                <article key={`site-partner-${index}`} className="admin-site-repeat-row">
                  <div className="field-grid">
                    <label className="field" htmlFor={`site-partner-name-${index}`}>
                      <span>Partner name</span>
                      <input
                        id={`site-partner-name-${index}`}
                        value={row.name}
                        onChange={(event) => updateSiteContentRow('partner_details', index, 'name', event.target.value)}
                      />
                    </label>
                    <label className="field" htmlFor={`site-partner-url-${index}`}>
                      <span>Website or profile link</span>
                      <input
                        id={`site-partner-url-${index}`}
                        value={row.url}
                        onChange={(event) => updateSiteContentRow('partner_details', index, 'url', event.target.value)}
                        placeholder="https://"
                      />
                    </label>
                  </div>
                  <label className="field" htmlFor={`site-partner-description-${index}`}>
                    <span>Short details</span>
                    <textarea
                      id={`site-partner-description-${index}`}
                      rows={3}
                      value={row.description}
                      onChange={(event) => updateSiteContentRow('partner_details', index, 'description', event.target.value)}
                    />
                  </label>
                  {siteContentForm.partner_details.length > 1 && (
                    <button type="button" className="ghost compact-button danger" onClick={() => removeSiteContentRow('partner_details', index)}>
                      Remove Partner
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="admin-app-card admin-site-content-card">
            <div className="section-heading">
              <div>
                <p className="profile-kicker">Help Center</p>
                <h2>FAQs and Guide Sections</h2>
              </div>
              <button type="button" className="ghost compact-button" onClick={addFaqSection}>
                Add FAQ Section
              </button>
            </div>
            <p className="muted">
              Choose which roles can see each section. Upload screenshots, graphs, or diagrams on individual questions.
            </p>
            <div className="admin-site-repeat-list">
              {siteContentForm.faq_sections.map((section, sectionIndex) => (
                <article key={`faq-section-${sectionIndex}`} className="admin-site-repeat-row admin-faq-section-editor">
                  <div className="field-grid">
                    <label className="field" htmlFor={`faq-section-title-${sectionIndex}`}>
                      <span>Section title</span>
                      <input
                        id={`faq-section-title-${sectionIndex}`}
                        value={section.title}
                        onChange={(event) => updateFaqSection(sectionIndex, 'title', event.target.value)}
                      />
                    </label>
                    <label className="field" htmlFor={`faq-section-id-${sectionIndex}`}>
                      <span>Anchor ID</span>
                      <input
                        id={`faq-section-id-${sectionIndex}`}
                        value={section.id}
                        onChange={(event) => updateFaqSection(sectionIndex, 'id', event.target.value)}
                        placeholder="example-faq-section"
                      />
                    </label>
                  </div>
                  <label className="field" htmlFor={`faq-section-intro-${sectionIndex}`}>
                    <span>Intro text</span>
                    <textarea
                      id={`faq-section-intro-${sectionIndex}`}
                      rows={3}
                      value={section.intro}
                      onChange={(event) => updateFaqSection(sectionIndex, 'intro', event.target.value)}
                    />
                  </label>
                  <fieldset className="admin-faq-role-selector">
                    <legend>Visible to</legend>
                    {FAQ_ROLE_OPTIONS.map((role) => (
                      <label key={role.value}>
                        <input
                          type="checkbox"
                          checked={section.roles.includes(role.value)}
                          onChange={() => toggleFaqSectionRole(sectionIndex, role.value)}
                        />
                        <span>{role.label}</span>
                      </label>
                    ))}
                  </fieldset>

                  <div className="admin-faq-item-list">
                    {section.items.map((item, itemIndex) => (
                      <article key={`faq-section-${sectionIndex}-item-${itemIndex}`} className="admin-faq-item-editor">
                        <div className="section-heading compact-heading">
                          <h3>Question {itemIndex + 1}</h3>
                          {section.items.length > 1 && (
                            <button type="button" className="ghost compact-button danger" onClick={() => removeFaqItem(sectionIndex, itemIndex)}>
                              Remove Question
                            </button>
                          )}
                        </div>
                        <label className="field" htmlFor={`faq-question-${sectionIndex}-${itemIndex}`}>
                          <span>Question</span>
                          <input
                            id={`faq-question-${sectionIndex}-${itemIndex}`}
                            value={item.q}
                            onChange={(event) => updateFaqItem(sectionIndex, itemIndex, 'q', event.target.value)}
                          />
                        </label>
                        <label className="field" htmlFor={`faq-answer-${sectionIndex}-${itemIndex}`}>
                          <span>Answer</span>
                          <textarea
                            id={`faq-answer-${sectionIndex}-${itemIndex}`}
                            rows={4}
                            value={item.a}
                            onChange={(event) => updateFaqItem(sectionIndex, itemIndex, 'a', event.target.value)}
                          />
                        </label>
                        <label className="field" htmlFor={`faq-bullets-${sectionIndex}-${itemIndex}`}>
                          <span>Bullet points</span>
                          <textarea
                            id={`faq-bullets-${sectionIndex}-${itemIndex}`}
                            rows={3}
                            value={item.bullets_text}
                            onChange={(event) => updateFaqItem(sectionIndex, itemIndex, 'bullets_text', event.target.value)}
                            placeholder="One bullet per paragraph or separated by blank lines"
                          />
                        </label>
                        <div className="admin-faq-media-editor">
                          <label className="field" htmlFor={`faq-image-url-${sectionIndex}-${itemIndex}`}>
                            <span>Image URL</span>
                            <input
                              id={`faq-image-url-${sectionIndex}-${itemIndex}`}
                              value={item.image_url}
                              onChange={(event) => updateFaqItem(sectionIndex, itemIndex, 'image_url', event.target.value)}
                              placeholder="Upload or paste an image URL"
                            />
                          </label>
                          <label className="field" htmlFor={`faq-image-alt-${sectionIndex}-${itemIndex}`}>
                            <span>Image caption / alt text</span>
                            <input
                              id={`faq-image-alt-${sectionIndex}-${itemIndex}`}
                              value={item.image_alt}
                              onChange={(event) => updateFaqItem(sectionIndex, itemIndex, 'image_alt', event.target.value)}
                            />
                          </label>
                          <label className="field faq-image-upload" htmlFor={`faq-image-upload-${sectionIndex}-${itemIndex}`}>
                            <span>Upload screenshot or graph</span>
                            <input
                              id={`faq-image-upload-${sectionIndex}-${itemIndex}`}
                              type="file"
                              accept="image/*"
                              disabled={uploadingFaqImageKey === `${sectionIndex}-${itemIndex}`}
                              onChange={(event) => uploadFaqImage(sectionIndex, itemIndex, event.target.files?.[0])}
                            />
                          </label>
                          {item.image_url && (
                            <figure className="admin-faq-image-preview">
                              <img src={item.image_url} alt={item.image_alt || ''} />
                              {item.image_alt && <figcaption>{item.image_alt}</figcaption>}
                            </figure>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="actions">
                    <button type="button" className="ghost compact-button" onClick={() => addFaqItem(sectionIndex)}>
                      Add Question
                    </button>
                    {siteContentForm.faq_sections.length > 1 && (
                      <button type="button" className="ghost compact-button danger" onClick={() => removeFaqSection(sectionIndex)}>
                        Remove Section
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="admin-site-save-bar">
            <button type="submit" disabled={savingSiteContent || loadingSiteContent}>
              {savingSiteContent ? 'Saving...' : 'Save Site Content'}
            </button>
            <button type="button" className="ghost" disabled={loadingSiteContent} onClick={() => loadSiteContent()}>
              Reset Unsaved Edits
            </button>
          </div>
        </form>
      )}

      {activeTab === 'contributions' && (
	        <section className="admin-contributions-layout">
	          <div className="admin-contribution-grid">
	            <div className="admin-contribution-column">
	              <article className="admin-app-card admin-draft-list">
		                <div className="section-heading contribution-card-heading">
		                  <div className="contribution-card-titlebar">
		                    <h3>My Dictionary Contributions</h3>
		                    {loadingDrafts && <p className="muted">Loading contributions...</p>}
		                    <button className="contribution-create-button" onClick={() => navigate(ROUTES.dictionaryDraft)}>
		                      Add Entry
		                    </button>
		                  </div>
		                </div>
                <div className="admin-subtabs contribution-status-tabs" aria-label="Dictionary contribution status">
                  <button
                    className={dictionaryContributionTab === 'drafts' ? 'active' : ''}
                    onClick={() => {
                      setDictionaryContributionTab('drafts')
                      setDictionaryContributionPage(1)
                    }}
                  >
                    Drafts ({dictionaryDraftRows.length})
                  </button>
                  <button
                    className={dictionaryContributionTab === 'submitted' ? 'active' : ''}
                    onClick={() => {
                      setDictionaryContributionTab('submitted')
                      setDictionaryContributionPage(1)
                    }}
                  >
                    Submitted for Review ({dictionarySubmittedRows.length})
                  </button>
                </div>
                {!loadingDrafts && dictionaryDrafts.length === 0 && <p className="muted">No dictionary contributions yet.</p>}
                {!loadingDrafts && dictionaryDrafts.length > 0 && dictionaryContributionRows.length === 0 && (
                  <p className="muted">No dictionary {dictionaryContributionTab === 'drafts' ? 'drafts' : 'submitted entries'} yet.</p>
                )}
                {visibleDictionaryContributions.map((contribution) => (
                  <article key={contribution.revision_id} className="admin-draft-card">
                    <div className="queue-header">
                      <strong>{contribution.term || '(no headword)'}</strong>
                      <span className={`badge status-${contribution.status || 'draft'}`}>
                        {contributionStatusLabel(contribution.status)}
                      </span>
                    </div>
                    {contribution.meaning && <p className="meta">Meaning: {contribution.meaning}</p>}
                    {contribution.part_of_speech && <p className="meta">Part of Speech: {contribution.part_of_speech}</p>}
                    <p className="meta">{contributionStatusDetail(contribution)}</p>
                    {contribution.status === 'draft' && (
                      <div className="admin-draft-actions">
                        <button
                          className="ghost compact-button"
                          onClick={() => navigate(`${ROUTES.dictionaryDraft}?revision_id=${encodeURIComponent(contribution.revision_id)}`)}
                        >
                          Edit Draft
                        </button>
                        <button
                          className="ghost compact-button danger"
                          disabled={deletingDraftId === contribution.revision_id}
                          onClick={() => setConfirmingDraftDelete({
                            type: 'dictionary',
                            revisionId: contribution.revision_id,
                            title: contribution.term || '(no headword)',
                          })}
                        >
                          {deletingDraftId === contribution.revision_id ? 'Deleting...' : 'Delete Draft'}
                        </button>
                      </div>
                    )}
                    {contribution.status !== 'draft' && (
                      <button className="ghost compact-button" onClick={() => setViewingContribution({ type: 'dictionary', contribution })}>
                        View Submission
                      </button>
                    )}
                    {contribution.status === 'approved' && (
                      <button className="ghost compact-button" onClick={() => navigate(ROUTES.dictionaryView)}>
                        View Dictionary
                      </button>
                    )}
                  </article>
                ))}
                {renderContributionPagination(
                  dictionaryContributionRows,
                  dictionaryContributionPage,
                  setDictionaryContributionPage,
                  'dictionary',
                )}
              </article>
	            </div>

	            <div className="admin-contribution-column">
	              <article className="admin-app-card admin-draft-list">
			                <div className="section-heading contribution-card-heading">
			                  <div className="contribution-card-titlebar">
			                    <h3>My Folklore Contributions</h3>
			                    {loadingDrafts && <p className="muted">Loading contributions...</p>}
			                    <button className="contribution-create-button" onClick={() => navigate(ROUTES.folkloreDraft)}>
			                      Add Entry
			                    </button>
			                  </div>
			                </div>
                <div className="admin-subtabs contribution-status-tabs" aria-label="Folklore contribution status">
                  <button
                    className={folkloreContributionTab === 'drafts' ? 'active' : ''}
                    onClick={() => {
                      setFolkloreContributionTab('drafts')
                      setFolkloreContributionPage(1)
                    }}
                  >
                    Drafts ({folkloreDraftRows.length})
                  </button>
                  <button
                    className={folkloreContributionTab === 'submitted' ? 'active' : ''}
                    onClick={() => {
                      setFolkloreContributionTab('submitted')
                      setFolkloreContributionPage(1)
                    }}
                  >
                    Submitted for Review ({folkloreSubmittedRows.length})
                  </button>
                </div>
                {!loadingDrafts && folkloreDrafts.length === 0 && <p className="muted">No folklore contributions yet.</p>}
                {!loadingDrafts && folkloreDrafts.length > 0 && folkloreContributionRows.length === 0 && (
                  <p className="muted">No folklore {folkloreContributionTab === 'drafts' ? 'drafts' : 'submitted entries'} yet.</p>
                )}
                {visibleFolkloreContributions.map((contribution) => (
                  <article key={contribution.revision_id} className="admin-draft-card">
                    <div className="queue-header">
                      <strong>{contribution.title || '(no title)'}</strong>
                      <span className={`badge status-${contribution.status || 'draft'}`}>
                        {contributionStatusLabel(contribution.status)}
                      </span>
                    </div>
                    {(contribution.category || contribution.subcategory) && (
                      <p className="meta">Category: {folkloreTaxonomyLabel(contribution.category, contribution.subcategory)}</p>
                    )}
                    {contribution.municipality_source && <p className="meta">Municipality: {contribution.municipality_source}</p>}
                    <p className="meta">{contributionStatusDetail(contribution)}</p>
                    {contribution.status === 'draft' && (
                      <div className="admin-draft-actions">
                        <button
                          className="ghost compact-button"
                          onClick={() => navigate(`${ROUTES.folkloreDraft}?revision_id=${encodeURIComponent(contribution.revision_id)}`)}
                        >
                          Edit Draft
                        </button>
                        <button
                          className="ghost compact-button danger"
                          disabled={deletingDraftId === contribution.revision_id}
                          onClick={() => setConfirmingDraftDelete({
                            type: 'folklore',
                            revisionId: contribution.revision_id,
                            title: contribution.title || '(no title)',
                          })}
                        >
                          {deletingDraftId === contribution.revision_id ? 'Deleting...' : 'Delete Draft'}
                        </button>
                      </div>
                    )}
                    {contribution.status !== 'draft' && (
                      <button className="ghost compact-button" onClick={() => setViewingContribution({ type: 'folklore', contribution })}>
                        View Submission
                      </button>
                    )}
                    {contribution.status === 'approved' && (
                      <button className="ghost compact-button" onClick={() => navigate(ROUTES.folkloreView)}>
                        View Folklore
                      </button>
                    )}
                  </article>
                ))}
                {renderContributionPagination(
                  folkloreContributionRows,
                  folkloreContributionPage,
                  setFolkloreContributionPage,
                  'folklore',
                )}
              </article>
            </div>
          </div>

          <aside className="admin-app-card admin-published-panel">
            <div className="section-heading">
              <div>
                <h2>My Published Entries</h2>
              </div>
            </div>

            <div className="admin-subtabs" aria-label="Published contribution type">
              <button
                className={publishedContributionTab === 'dictionary' ? 'active' : ''}
                onClick={() => setPublishedContributionTab('dictionary')}
              >
                Dictionary
              </button>
              <button
                className={publishedContributionTab === 'folklore' ? 'active' : ''}
                onClick={() => setPublishedContributionTab('folklore')}
              >
                Folklore
              </button>
            </div>

            {publishedContributionTab === 'dictionary' && (
              <div className="admin-published-list">
                {!loadingDrafts && dictionaryPublished.length === 0 && <p className="muted">No published dictionary entries yet.</p>}
                {dictionaryPublished.map((entry) => (
                  <article key={entry.revision_id} className="admin-published-row">
                    <div>
                      <strong>{entry.term || '(no headword)'}</strong>
                      {entry.meaning && <p className="meta">{entry.meaning}</p>}
                      {entry.part_of_speech && <p className="meta">{entry.part_of_speech}</p>}
                    </div>
                    <button
                      className="ghost compact-button"
                      onClick={() =>
                        navigate(
                          entry.entry_id
                            ? `${ROUTES.dictionaryView}?entry_id=${encodeURIComponent(entry.entry_id)}`
                            : ROUTES.dictionaryView,
                        )
                      }
                    >
                      View
                    </button>
                  </article>
                ))}
              </div>
            )}

            {publishedContributionTab === 'folklore' && (
              <div className="admin-published-list">
                {!loadingDrafts && folklorePublished.length === 0 && <p className="muted">No published folklore entries yet.</p>}
                {folklorePublished.map((entry) => (
                  <article key={entry.revision_id} className="admin-published-row">
                    <div>
                      <strong>{entry.title || '(no title)'}</strong>
                      {(entry.category || entry.subcategory) && (
                        <p className="meta">{folkloreTaxonomyLabel(entry.category, entry.subcategory)}</p>
                      )}
                      {entry.municipality_source && <p className="meta">{entry.municipality_source}</p>}
                    </div>
                    <button
                      className="ghost compact-button"
                      onClick={() =>
                        navigate(
                          entry.entry_id
                            ? `${ROUTES.folkloreView}?entry_id=${encodeURIComponent(entry.entry_id)}`
                            : ROUTES.folkloreView,
                        )
                      }
                    >
                      View
                    </button>
                  </article>
                ))}
              </div>
            )}
          </aside>
          {renderContributionPreviewModal()}
          <ConfirmDialog
            open={Boolean(confirmingDraftDelete)}
            title="Delete this draft?"
            message={
              confirmingDraftDelete
                ? `You are about to delete "${confirmingDraftDelete.title}".`
                : ''
            }
            detail="This removes the saved draft from your Contributions list. Submitted entries are not affected."
            confirmLabel="Delete Draft"
            cancelLabel="Keep Draft"
            busy={Boolean(deletingDraftId)}
            onCancel={() => setConfirmingDraftDelete(null)}
            onConfirm={() =>
              deleteContributionDraft(
                confirmingDraftDelete.type,
                confirmingDraftDelete.revisionId,
              )
            }
          />
        </section>
      )}

      {canReviewRoles && activeTab === 'reviews' && (
        <ReviewerDashboardPage currentUser={currentUser} refreshToken={reviewRefreshToken} />
      )}
    </section>
  )
}

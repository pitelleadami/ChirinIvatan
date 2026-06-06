/*
  RoleCenterPage.jsx

  Unified onboarding UI:
  - apply for contributor/reviewer role
  - reviewer/admin decision actions
  - reviewer/admin direct invitations
*/

import { useEffect, useState } from 'react'

import { apiRequest } from '../lib/api'
import { emailValidationMessage } from '../lib/emailValidation'
import { ROUTES, navigate } from '../lib/router'

const MUNICIPALITIES = ['Basco', 'Mahatao', 'Ivana', 'Uyugan', 'Sabtang', 'Itbayat']
const EMPTY_CULTURAL_AFFILIATION = { role: '', organization: '' }
const EMPTY_OTHER_AFFILIATION = { designation: '', institution: '' }

const ROLE_OPTIONS = [
  {
    value: 'contributor',
    title: 'Contributor',
    summary: 'Share words, stories, and media that help preserve Ivatan language and heritage.',
    approval: 'Review flow: approved by one reviewer or admin.',
    whoCanJoin: 'Anyone who cares to contribute and learn.',
    details: [
      'Add Ivatan words, meanings, pronunciations, and usage notes',
      'Share folklore stories, sayings, songs, and oral traditions',
      'Upload photos and audio with clear, respectful source details',
    ],
  },
  {
    value: 'reviewer',
    title: 'Reviewer',
    summary: 'Help keep published entries accurate, respectful, and culturally grounded.',
    approval: 'Review flow: approved by two reviewers, or one reviewer plus one admin.',
    whoCanJoin: 'Language stewards, educators, and cultural advocates.',
    details: [
      'Review dictionary terms, folklore entries, and revisions',
      'Check language accuracy, source clarity, and cultural sensitivity',
      'Give constructive feedback to support contributors',
    ],
  },
]

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function roleLabel(value) {
  if (!value) return 'Role'
  if (value === 'admin') return 'Admin'
  if (value === 'consultant') return 'Consultant'
  return value === 'reviewer' ? 'Reviewer' : 'Contributor'
}

function applicationHelp(row) {
  if (row.status === 'pending') {
    if (row.approval_count > 0) {
      return row.target_role === 'reviewer'
        ? 'One approval has been recorded. Reviewer access is waiting for the remaining approval.'
        : 'One approval has been recorded. Final access is being updated.'
    }
    return row.target_role === 'reviewer'
      ? 'Waiting for reviewer quorum. Reviewer access needs two reviewers, or one reviewer plus one admin.'
      : 'Waiting for one reviewer or admin to approve contributor access.'
  }
  if (row.status === 'approved') {
    if (row.can_claim_credentials) {
      return 'Approved. Set your username and password below to activate your login.'
    }
    return 'Approved. Your account permissions are active.'
  }
  if (row.status === 'rejected') return 'Rejected. You may submit a clearer application later.'
  return 'Application status is being updated.'
}

function publicStatusLabel(row) {
  if (row.public_status === 'approved_final' || row.status === 'approved') return 'Approved final'
  if (row.public_status === 'rejected' || row.status === 'rejected') return 'Rejected'
  if (row.approval_count > 0) return `Approved by ${row.approval_count}`
  return 'Pending'
}

export default function RoleCenterPage({ currentUser = {} }) {
  // Section A: applicant self-service state.
  const [applyRole, setApplyRole] = useState('')
  const [myApplications, setMyApplications] = useState([])
  const [myApplicationsUserKey, setMyApplicationsUserKey] = useState('')
  const [hasRequestedMyApplications, setHasRequestedMyApplications] = useState(false)
  const [submittedApplication, setSubmittedApplication] = useState(null)
  const [showAuthenticatedApplicationSubmitted, setShowAuthenticatedApplicationSubmitted] = useState(false)
  const [statusEmail, setStatusEmail] = useState('')
  const [publicApplications, setPublicApplications] = useState([])
  const [statusLookupFeedback, setStatusLookupFeedback] = useState({ tone: '', text: '' })
  const [claimForms, setClaimForms] = useState({})
  const [invitationToken, setInvitationToken] = useState('')
  const [invitationDetails, setInvitationDetails] = useState(null)
  const [invitationClaimForm, setInvitationClaimForm] = useState({
    username: '',
    password: '',
    passwordConfirm: '',
  })
  const [inviteCelebration, setInviteCelebration] = useState(null)
  const [applicantForm, setApplicantForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    municipality: '',
    cultural_affiliations: [{ ...EMPTY_CULTURAL_AFFILIATION }],
    other_affiliations: [{ ...EMPTY_OTHER_AFFILIATION }],
    bio: '',
    reviewer_reason: '',
  })

  // Shared request/feedback state used across all sections.
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [applicantFormError, setApplicantFormError] = useState('')
  const [applicantMissingFields, setApplicantMissingFields] = useState([])
  const groups = currentUser.groups || []
  const isAuthenticated = Boolean(currentUser.is_authenticated)
  const isAdminUser = currentUser.is_superuser || groups.includes('Admin')
  const isReviewerUser = groups.includes('Reviewer')
  const isContributorUser = groups.includes('Contributor')
  const isCommunityMember = isAdminUser || isReviewerUser || isContributorUser
  const currentUserApplicationKey = isAuthenticated
    ? String(currentUser.username || currentUser.email || currentUser.id || 'authenticated-user')
    : ''
  const ownsMyApplications = Boolean(currentUserApplicationKey) && myApplicationsUserKey === currentUserApplicationKey
  const visibleMyApplications = isAuthenticated && ownsMyApplications ? myApplications : []
  const hasPendingSelectedRole =
    Boolean(applyRole) && visibleMyApplications.some((row) => row.target_role === applyRole && row.status === 'pending')
  const alreadyHasSelectedRole =
    applyRole === 'reviewer'
      ? isReviewerUser || isAdminUser
      : applyRole === 'contributor'
        ? isContributorUser || isReviewerUser || isAdminUser
        : false
  const invitedRole = ROLE_OPTIONS.find((role) => role.value === invitationDetails?.role)

  function updateApplicantField(field, value) {
    setApplicantForm((current) => ({ ...current, [field]: value }))
    if (applicantMissingFields.includes(field) && String(value || '').trim()) {
      setApplicantMissingFields((current) => current.filter((item) => item !== field))
    }
    if (applicantFormError) {
      setApplicantFormError('')
    }
  }

  function updateApplicantAffiliation(group, index, field, value) {
    setApplicantForm((current) => ({
      ...current,
      [group]: current[group].map((row, rowIndex) => (
        rowIndex === index ? { ...row, [field]: value } : row
      )),
    }))
  }

  function updateClaimField(applicationId, field, value) {
    setClaimForms((current) => ({
      ...current,
      [applicationId]: {
        username: current[applicationId]?.username || '',
        password: current[applicationId]?.password || '',
        passwordConfirm: current[applicationId]?.passwordConfirm || '',
        [field]: value,
      },
    }))
  }

  function updateInvitationClaimField(field, value) {
    setInvitationClaimForm((current) => ({ ...current, [field]: value }))
  }

  function addApplicantAffiliation(group) {
    const emptyRow = group === 'cultural_affiliations'
      ? EMPTY_CULTURAL_AFFILIATION
      : EMPTY_OTHER_AFFILIATION
    setApplicantForm((current) => ({
      ...current,
      [group]: [...current[group], { ...emptyRow }],
    }))
  }

  function removeApplicantAffiliation(group, index) {
    const emptyRow = group === 'cultural_affiliations'
      ? EMPTY_CULTURAL_AFFILIATION
      : EMPTY_OTHER_AFFILIATION
    setApplicantForm((current) => {
      const nextRows = current[group].filter((_, rowIndex) => rowIndex !== index)
      return {
        ...current,
        [group]: nextRows.length ? nextRows : [{ ...emptyRow }],
      }
    })
  }

  async function copyText(value, label) {
    // Utility for QA/testing flows where IDs are long UUID values.
    const text = String(value || '').trim()
    if (!text) {
      setError(`No ${label} to copy.`)
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setMessage(`${label} copied.`)
    } catch {
      setError('Clipboard copy failed. Copy manually.')
    }
  }

  async function run(action) {
    // Wrapper to keep loading/error handling consistent for every API call.
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchMyApplications() {
    if (!isAuthenticated) {
      throw new Error('Log in first so your application can be attached to your account.')
    }
    const payload = await apiRequest('/api/users/role-applications/my')
    const rows = payload.rows || []
    setMyApplicationsUserKey(currentUserApplicationKey)
    setMyApplications(rows)
    return rows
  }

  async function createApplication() {
    if (!applyRole) {
      setError('Choose Contributor or Reviewer first.')
      return
    }
    if (isAuthenticated && alreadyHasSelectedRole) {
      setError(`You already have ${roleLabel(applyRole)} access.`)
      return
    }
    if (isAuthenticated && hasPendingSelectedRole) {
      setError(`You already have a pending ${roleLabel(applyRole)} application.`)
      return
    }
    if (applyRole === 'reviewer' && !applicantForm.reviewer_reason.trim()) {
      setApplicantFormError('Please share why you want to become a reviewer.')
      setError('')
      return
    }
    if (!isAuthenticated) {
      const requiredFields = ['first_name', 'last_name', 'email', 'municipality']
      const missingFields = requiredFields.filter((field) => !applicantForm[field].trim())
      if (missingFields.length) {
        setApplicantMissingFields(missingFields)
        setApplicantFormError('Please fill in your name, email, and municipality before submitting.')
        setError('')
        return
      }
      const emailError = emailValidationMessage(applicantForm.email)
      if (emailError) {
        setApplicantMissingFields(['email'])
        setApplicantFormError(emailError)
        setError('')
        return
      }
    }
    setApplicantMissingFields([])
    setApplicantFormError('')
    if (!isAuthenticated) {
      setLoading(true)
      setError('')
      setMessage('')
      try {
        const payload = await apiRequest('/api/users/role-applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_role: applyRole, ...applicantForm }),
        })
        setStatusEmail(applicantForm.email)
        setPublicApplications([payload])
        setSubmittedApplication(payload)
      } catch (requestError) {
        const detail = requestError.message || 'Application could not be submitted.'
        setApplicantFormError(detail)
        setApplicantMissingFields(detail.toLowerCase().includes('email') ? ['email'] : [])
      } finally {
        setLoading(false)
      }
      return
    }

    // Applicant sends target role; backend enforces role validity + pending state.
    await run(async () => {
      const requestBody = isAuthenticated
        ? { target_role: applyRole, reviewer_reason: applicantForm.reviewer_reason }
        : { target_role: applyRole, ...applicantForm }
      const payload = await apiRequest('/api/users/role-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      if (isAuthenticated) {
        setHasRequestedMyApplications(true)
        setMyApplicationsUserKey(currentUserApplicationKey)
        await fetchMyApplications()
      } else {
        setStatusEmail(applicantForm.email)
        setPublicApplications([payload])
      }
      setSubmittedApplication(payload)
      if (isAuthenticated) {
        setShowAuthenticatedApplicationSubmitted(true)
      }
      setMessage(isAuthenticated ? 'Application submitted.' : '')
    })
  }

  async function lookupPublicApplications() {
    const email = statusEmail.trim().toLowerCase()
    setStatusLookupFeedback({ tone: '', text: '' })
    if (!email) {
      setStatusLookupFeedback({ tone: 'error', text: 'Enter the email address used in your application.' })
      return
    }
    const emailError = emailValidationMessage(email)
    if (emailError) {
      setStatusLookupFeedback({ tone: 'error', text: emailError })
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const payload = await apiRequest('/api/users/role-applications/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const rows = payload.rows || []
      setPublicApplications(rows)
      setSubmittedApplication(null)
      if (rows.length) {
        setStatusLookupFeedback({
          tone: 'ok',
          text: `Found ${rows.length} application${rows.length === 1 ? '' : 's'} for ${email}.`,
        })
      } else {
        setStatusLookupFeedback({
          tone: 'neutral',
          text: `No application found for ${email}. Check spelling or try the exact email used during application.`,
        })
      }
    } catch (requestError) {
      setPublicApplications([])
      setStatusLookupFeedback({
        tone: 'error',
        text: requestError.message || 'Could not check status right now. Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  async function claimRoleAccess(row) {
    const email = statusEmail.trim().toLowerCase()
    const claimRow = claimForms[row.application_id] || {}
    const username = (claimRow.username || '').trim()
    const password = claimRow.password || ''
    const passwordConfirm = claimRow.passwordConfirm || ''

    if (!email) {
      setError('Enter the same application email address before setting credentials.')
      return
    }
    const emailError = emailValidationMessage(email)
    if (emailError) {
      setError(emailError)
      return
    }
    if (!username || !password || !passwordConfirm) {
      setError('Username, password, and confirmation are required.')
      return
    }
    if (password !== passwordConfirm) {
      setError('Password confirmation does not match.')
      return
    }

    await run(async () => {
      await apiRequest('/api/auth/csrf')
      const claimPayload = await apiRequest('/api/users/role-applications/claim-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          application_id: row.application_id,
          username,
          password,
          password_confirm: passwordConfirm,
        }),
      })
      const refreshPayload = await apiRequest('/api/users/role-applications/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setPublicApplications(refreshPayload.rows || [])
      setClaimForms((current) => ({
        ...current,
        [row.application_id]: {
          username: '',
          password: '',
          passwordConfirm: '',
        },
      }))
      setStatusLookupFeedback({
        tone: 'ok',
        text: `Account setup complete. You can now log in as @${claimPayload.username}.`,
      })
    })
  }

  async function loadInvitation(token) {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const payload = await apiRequest(`/api/users/role-invitations/${token}`)
      setInvitationDetails(payload)
      setStatusEmail(payload.email || '')
      setInvitationClaimForm((current) => ({
        ...current,
        username: current.username || (payload.email ? payload.email.split('@')[0] : ''),
      }))
    } catch (requestError) {
      setInvitationDetails(null)
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function acceptInvitation() {
    if (!invitationToken) {
      setError('Invitation token is missing.')
      return
    }
    const username = invitationClaimForm.username.trim()
    const password = invitationClaimForm.password || ''
    const passwordConfirm = invitationClaimForm.passwordConfirm || ''
    if (!username || !password || !passwordConfirm) {
      setError('Username, password, and confirmation are required.')
      return
    }
    if (password !== passwordConfirm) {
      setError('Password confirmation does not match.')
      return
    }

    await run(async () => {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest(`/api/users/role-invitations/${invitationToken}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          password_confirm: passwordConfirm,
        }),
      })
      setInvitationDetails((current) => current ? { ...current, status: 'accepted' } : current)
      setInvitationClaimForm({ username: '', password: '', passwordConfirm: '' })
      setInviteCelebration({
        username: payload.username,
        role: invitationDetails?.role || payload.role,
        label: payload.accountability_label || 'Invitation accepted.',
      })
      setMessage(`${payload.accountability_label || 'Invitation accepted.'} You can now log in as @${payload.username}.`)
    })
  }

  async function loadMyApplications() {
    if (!isAuthenticated) {
      setError('Log in first to view your role applications.')
      return
    }
    setHasRequestedMyApplications(true)
    setMyApplicationsUserKey(currentUserApplicationKey)
    // Pull current user's own applications only.
    await run(async () => {
      const rows = await fetchMyApplications()
      if (!rows.length) {
        setMessage('No applications found for current user.')
      } else {
        setMessage('Loaded your applications.')
      }
    })
  }

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite') || ''
    if (!token) return
    setInvitationToken(token)
    loadInvitation(token)
  }, [])

  useEffect(() => {
    const requestedRole = new URLSearchParams(window.location.search).get('role') || ''
    if (ROLE_OPTIONS.some((role) => role.value === requestedRole)) {
      setApplyRole(requestedRole)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !currentUserApplicationKey || invitationToken) return

    let ignore = false
    setHasRequestedMyApplications(true)
    setMyApplicationsUserKey(currentUserApplicationKey)
    setLoading(true)
    setError('')
    apiRequest('/api/users/role-applications/my')
      .then((payload) => {
        if (!ignore) setMyApplications(payload.rows || [])
      })
      .catch((requestError) => {
        if (!ignore) setError(requestError.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [currentUserApplicationKey, invitationToken, isAuthenticated])

  return (
    <section className="role-center-page">
      {inviteCelebration && (
        <div className="celebration-backdrop" role="presentation">
          <section
            className="celebration-modal milestone role-invite-celebration"
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-invite-celebration-title"
            aria-describedby="role-invite-celebration-message"
          >
            <div className="celebration-burst" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <p className="profile-kicker">First step unlocked</p>
            <h2 id="role-invite-celebration-title">Cultural Steward Path Started</h2>
            <p id="role-invite-celebration-message">
              Your {roleLabel(inviteCelebration.role).toLowerCase()} access is active. This first step joins you to the
              shared work of protecting Ivatan language, folklore, and cultural memory.
            </p>
            <div className="celebration-stats" aria-label="Invitation acceptance details">
              <span>{roleLabel(inviteCelebration.role)}</span>
              <span>Steward endorsement recorded</span>
              <span>@{inviteCelebration.username}</span>
            </div>
            <button
              onClick={() => {
                setInviteCelebration(null)
                navigate(ROUTES.login)
              }}
            >
              Continue to Login
            </button>
          </section>
        </div>
      )}

      {!isAuthenticated && submittedApplication && (
        <div className="celebration-backdrop" role="presentation">
          <section
            className="celebration-modal milestone role-application-submitted-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-application-submitted-title"
            aria-describedby="role-application-submitted-message"
          >
            <p className="profile-kicker">Application submitted</p>
            <h2 id="role-application-submitted-title">Thank you for your interest in becoming a Cultural Bearer.</h2>
            <p id="role-application-submitted-message">
              Your application has been received. Once approved, you will receive an email with instructions for
              activating your access and joining the Digital Yaru.
            </p>
            <div className="celebration-stats" aria-label="Application details">
              <span>{roleLabel(submittedApplication.target_role)}</span>
              <span>{applicantForm.email}</span>
            </div>
            <button onClick={() => setSubmittedApplication(null)}>
              Got it
            </button>
          </section>
        </div>
      )}

      {isAuthenticated && showAuthenticatedApplicationSubmitted && submittedApplication && (
        <div className="celebration-backdrop" role="presentation">
          <section
            className="celebration-modal milestone role-application-submitted-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-application-submitted-title"
            aria-describedby="role-application-submitted-message"
          >
            <p className="profile-kicker">Application submitted</p>
            <h2 id="role-application-submitted-title">Your reviewer application is now pending.</h2>
            <p id="role-application-submitted-message">
              Thank you for sharing why you want to help review submissions. Your application is now visible in My Applications.
            </p>
            <div className="celebration-stats" aria-label="Application details">
              <span>{roleLabel(submittedApplication.target_role)}</span>
              <span>{submittedApplication.status}</span>
            </div>
            <button onClick={() => setShowAuthenticatedApplicationSubmitted(false)}>
              Got it
            </button>
          </section>
        </div>
      )}

      <section className="role-center-hero">
        <div>
          <h1>Join the Digital Yaru</h1>
        </div>
      </section>

      {invitationToken && (
        <section className="role-work-panel role-invitation-panel">
          <div className="section-heading">
            <div>
              <p className="profile-kicker">Invitation</p>
              <h3>Accept Role Invitation</h3>
              {invitationDetails ? (
                <p className="muted">
                  {invitationDetails.email} was invited to join as {roleLabel(invitationDetails.role)}.
                </p>
              ) : (
                <p className="muted">Loading invitation details...</p>
              )}
            </div>
            {invitationDetails?.status && (
              <span className={`badge status-${invitationDetails.status}`}>{invitationDetails.status}</span>
            )}
          </div>

          {invitationDetails?.status === 'pending' && (
            <div className="role-claim-access">
              {invitedRole && (
                <div className="role-invitation-context">
                  <strong>What a {invitedRole.title} does</strong>
                  <p>{invitedRole.summary}</p>
                  <ul>
                    {invitedRole.details.slice(0, 3).map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                  <p className="muted">
                    Accepting this invitation activates your {invitedRole.title.toLowerCase()} access directly because a
                    platform steward has already endorsed you.
                  </p>
                </div>
              )}
              <div className="field-grid">
                <label className="field" htmlFor="invite-claim-username">
                  <span>Create Username</span>
                  <input
                    id="invite-claim-username"
                    autoComplete="username"
                    value={invitationClaimForm.username}
                    onChange={(event) => updateInvitationClaimField('username', event.target.value)}
                    placeholder="Choose your username"
                  />
                </label>
              </div>
              <div className="field-grid">
                <label className="field" htmlFor="invite-claim-password">
                  <span>Create Password</span>
                  <input
                    id="invite-claim-password"
                    type="password"
                    autoComplete="new-password"
                    value={invitationClaimForm.password}
                    onChange={(event) => updateInvitationClaimField('password', event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="invite-claim-password-confirm">
                  <span>Confirm Password</span>
                  <input
                    id="invite-claim-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={invitationClaimForm.passwordConfirm}
                    onChange={(event) => updateInvitationClaimField('passwordConfirm', event.target.value)}
                  />
                </label>
              </div>
              <div className="actions">
                <button disabled={loading} onClick={() => acceptInvitation()}>
                  {loading ? 'Activating...' : 'Accept Invitation'}
                </button>
                <button className="ghost" disabled={loading} onClick={() => navigate(ROUTES.login)}>
                  Go to Login
                </button>
              </div>
            </div>
          )}

          {invitationDetails?.status === 'accepted' && (
            <div className="actions">
              <button onClick={() => navigate(ROUTES.login)}>Go to Login</button>
            </div>
          )}
        </section>
      )}

      {!invitationToken && (
      <section className="role-work-grid">
        <section className="role-work-panel role-apply-panel">
          <div className="section-heading">
            <div>
              <h3>Choose Your Community Role</h3>
              {isAuthenticated && isContributorUser && applyRole === 'reviewer' && !alreadyHasSelectedRole && (
                <p className="muted">You are applying to grow from Contributor into Reviewer access.</p>
              )}
            </div>
          </div>

          <div
            className={applyRole ? 'role-choice-list role-choice-list-has-selection' : 'role-choice-list'}
            role="radiogroup"
            aria-label="Role to apply for"
          >
            {ROLE_OPTIONS.map((role) => (
              <button
                key={role.value}
                type="button"
                className={applyRole === role.value ? 'role-choice-card selected' : 'role-choice-card'}
                onClick={() => setApplyRole(role.value)}
                aria-pressed={applyRole === role.value}
              >
                <span>
                  <strong>{role.title}</strong>
                  <small>{role.approval}</small>
                </span>
                <span>{role.summary}</span>
                <ul>
                  {role.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                <div className="role-who-can-join">
                  <span>Who can join?</span>
                  <p>{role.whoCanJoin}</p>
                </div>
              </button>
            ))}
          </div>

          {applyRole === 'reviewer' && (
            <label className="field role-reviewer-reason-field" htmlFor="role-reviewer-reason">
              <span>Why do you want to become a reviewer? *</span>
              <textarea
                id="role-reviewer-reason"
                value={applicantForm.reviewer_reason}
                onChange={(event) => updateApplicantField('reviewer_reason', event.target.value)}
                placeholder="Share your motivation, language or cultural background, and how you hope to help review submissions."
              />
            </label>
          )}
          {isAuthenticated && applicantFormError && <p className="inline-error role-public-form-error">{applicantFormError}</p>}

          {!isAuthenticated && applyRole && (
            <div className="role-public-form">
              <div className="field-grid role-public-identity-grid">
                <label className={applicantMissingFields.includes('first_name') ? 'field field-error' : 'field'} htmlFor="role-first-name">
                  <span>First Name *</span>
                  <input
                    id="role-first-name"
                    value={applicantForm.first_name}
                    onChange={(event) => updateApplicantField('first_name', event.target.value)}
                    aria-invalid={applicantMissingFields.includes('first_name')}
                  />
                </label>
                <label className={applicantMissingFields.includes('last_name') ? 'field field-error' : 'field'} htmlFor="role-last-name">
                  <span>Last Name *</span>
                  <input
                    id="role-last-name"
                    value={applicantForm.last_name}
                    onChange={(event) => updateApplicantField('last_name', event.target.value)}
                    aria-invalid={applicantMissingFields.includes('last_name')}
                  />
                </label>
              </div>
              <div className="field-grid role-public-contact-grid">
                <label className={applicantMissingFields.includes('email') ? 'field field-error' : 'field'} htmlFor="role-email">
                  <span>Email *</span>
                  <input
                    id="role-email"
                    type="email"
                    value={applicantForm.email}
                    onChange={(event) => updateApplicantField('email', event.target.value)}
                    aria-invalid={applicantMissingFields.includes('email')}
                  />
                </label>
                <label className={applicantMissingFields.includes('municipality') ? 'field field-error' : 'field'} htmlFor="role-municipality">
                  <span>Municipality *</span>
                  <select
                    id="role-municipality"
                    value={applicantForm.municipality}
                    onChange={(event) => updateApplicantField('municipality', event.target.value)}
                    aria-invalid={applicantMissingFields.includes('municipality')}
                  >
                    <option value="">Select municipality</option>
                    {MUNICIPALITIES.map((municipality) => (
                      <option key={municipality} value={municipality}>
                        {municipality}
                      </option>
                      ))}
                  </select>
                  <small className="muted municipality-helper">
                    Pick origin, residency, or spoken language. Contributions are credited to this municipality.
                  </small>
                </label>
              </div>

              <div className="affiliation-editor">
                <div className="affiliation-editor-heading">
                  <h4>Cultural / Community Affiliation</h4>
                  <button
                    type="button"
                    className="ghost compact-button"
                    onClick={() => addApplicantAffiliation('cultural_affiliations')}
                  >
                    Add another
                  </button>
                </div>
                {applicantForm.cultural_affiliations.map((row, index) => (
                  <div className="affiliation-row" key={`cultural-${index}`}>
                    <label className="field" htmlFor={`role-cultural-role-${index}`}>
                      <span>Position / Role</span>
                      <input
                        id={`role-cultural-role-${index}`}
                        placeholder="e.g., Resident, Member etc."
                        value={row.role}
                        onChange={(event) => updateApplicantAffiliation('cultural_affiliations', index, 'role', event.target.value)}
                      />
                    </label>
                    <label className="field" htmlFor={`role-cultural-organization-${index}`}>
                      <span>Agency/ Organization/ Group</span>
                      <input
                        id={`role-cultural-organization-${index}`}
                        placeholder="e.g., Brgy. San Antonio, Ivatan Cultural Council, etc."
                        value={row.organization}
                        onChange={(event) => updateApplicantAffiliation('cultural_affiliations', index, 'organization', event.target.value)}
                      />
                    </label>
                    {applicantForm.cultural_affiliations.length > 1 && (
                      <button
                        type="button"
                        className="ghost compact-button"
                        onClick={() => removeApplicantAffiliation('cultural_affiliations', index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="affiliation-editor">
                <div className="affiliation-editor-heading">
                  <h4>Professional / Other Affiliation</h4>
                  <button
                    type="button"
                    className="ghost compact-button"
                    onClick={() => addApplicantAffiliation('other_affiliations')}
                  >
                    Add another
                  </button>
                </div>
                {applicantForm.other_affiliations.map((row, index) => (
                  <div className="affiliation-row" key={`other-${index}`}>
                    <label className="field" htmlFor={`role-other-designation-${index}`}>
                      <span>Position / Role</span>
                      <input
                        id={`role-other-designation-${index}`}
                        placeholder="e.g., Student, Clerk, etc."
                        value={row.designation}
                        onChange={(event) => updateApplicantAffiliation('other_affiliations', index, 'designation', event.target.value)}
                      />
                    </label>
                    <label className="field" htmlFor={`role-other-institution-${index}`}>
                      <span>Agency/ Organization/ Group</span>
                      <input
                        id={`role-other-institution-${index}`}
                        placeholder="e.g., Batanes State College, LGU Basco, etc"
                        value={row.institution}
                        onChange={(event) => updateApplicantAffiliation('other_affiliations', index, 'institution', event.target.value)}
                      />
                    </label>
                    {applicantForm.other_affiliations.length > 1 && (
                      <button
                        type="button"
                        className="ghost compact-button"
                        onClick={() => removeApplicantAffiliation('other_affiliations', index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {applicantFormError && <p className="inline-error role-public-form-error">{applicantFormError}</p>}
              <div className="actions role-public-form-actions">
                <button disabled={loading || alreadyHasSelectedRole || hasPendingSelectedRole} onClick={() => createApplication()}>
                  {hasPendingSelectedRole
                    ? 'Application Pending'
                    : alreadyHasSelectedRole
                      ? 'Access Already Active'
                      : `Apply as ${roleLabel(applyRole)}`}
                </button>
              </div>
            </div>
          )}

          <div className="actions">
            {isAuthenticated && applyRole && (
              <button disabled={loading || alreadyHasSelectedRole || hasPendingSelectedRole} onClick={() => createApplication()}>
                {hasPendingSelectedRole
                  ? 'Application Pending'
                  : alreadyHasSelectedRole
                    ? 'Access Already Active'
                    : `Apply as ${roleLabel(applyRole)}`}
              </button>
            )}
            {isAuthenticated && (
              <button className="ghost" disabled={loading} onClick={() => loadMyApplications()}>
                Refresh My Applications
              </button>
            )}
          </div>
        </section>

        <section className="role-work-panel">
          <div className="section-heading">
            <div>
              <h3>My Applications</h3>
            </div>
          </div>

          {!isAuthenticated && (
            <form
              className="role-status-lookup"
              onSubmit={(event) => {
                event.preventDefault()
                lookupPublicApplications()
              }}
            >
              <p className="muted">
                Enter the email address you used to apply.
              </p>
              <div className="role-status-search">
                <label className="field" htmlFor="role-status-email">
                  <span>Email Address</span>
                  <input
                    id="role-status-email"
                    type="email"
                    value={statusEmail}
                    onChange={(event) => setStatusEmail(event.target.value)}
                    placeholder="name@example.com"
                  />
                </label>
                {statusLookupFeedback.text && (
                  <p
                    className={
                      statusLookupFeedback.tone === 'error'
                        ? 'inline-error role-status-feedback-box'
                        : statusLookupFeedback.tone === 'ok'
                          ? 'inline-ok role-status-feedback-box'
                          : 'muted role-status-feedback role-status-feedback-box'
                    }
                  >
                    {statusLookupFeedback.text}
                  </p>
                )}
                <button type="submit" disabled={loading}>
                  Check Status
                </button>
              </div>
            </form>
          )}

          {!isAuthenticated && publicApplications.length > 0 && (
            <div className="role-application-list role-public-status-list">
              {publicApplications.map((row) => (
                <article key={row.application_id} className="role-application-card">
                  <div className="queue-header">
                    <strong>{roleLabel(row.target_role)}</strong>
                    <span className={`badge status-${row.status}`}>{publicStatusLabel(row)}</span>
                  </div>
                  <p className="role-application-help">{applicationHelp(row)}</p>
                  {row.reviewer_reason && <p className="role-application-reason">{row.reviewer_reason}</p>}
                  <p className="meta">Submitted {formatDate(row.created_at)}</p>
                  {row.decided_at && <p className="meta">Decided {formatDate(row.decided_at)}</p>}
                  {row.can_claim_credentials && (
                    <div className="role-claim-access">
                      <div className="field-grid">
                        <label className="field" htmlFor={`claim-username-${row.application_id}`}>
                          <span>Create Username</span>
                          <input
                            id={`claim-username-${row.application_id}`}
                            autoComplete="username"
                            value={claimForms[row.application_id]?.username || ''}
                            onChange={(event) => updateClaimField(row.application_id, 'username', event.target.value)}
                            placeholder="Choose your username"
                          />
                        </label>
                      </div>
                      <div className="field-grid">
                        <label className="field" htmlFor={`claim-password-${row.application_id}`}>
                          <span>Create Password</span>
                          <input
                            id={`claim-password-${row.application_id}`}
                            type="password"
                            autoComplete="new-password"
                            value={claimForms[row.application_id]?.password || ''}
                            onChange={(event) => updateClaimField(row.application_id, 'password', event.target.value)}
                          />
                        </label>
                        <label className="field" htmlFor={`claim-password-confirm-${row.application_id}`}>
                          <span>Confirm Password</span>
                          <input
                            id={`claim-password-confirm-${row.application_id}`}
                            type="password"
                            autoComplete="new-password"
                            value={claimForms[row.application_id]?.passwordConfirm || ''}
                            onChange={(event) => updateClaimField(row.application_id, 'passwordConfirm', event.target.value)}
                          />
                        </label>
                      </div>
                      <div className="actions">
                        <button disabled={loading} onClick={() => claimRoleAccess(row)}>
                          {loading ? 'Saving...' : 'Set My Login Credentials'}
                        </button>
                        <button className="ghost" disabled={loading} onClick={() => navigate(ROUTES.login)}>
                          Go to Login
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {isAuthenticated && ownsMyApplications && loading && visibleMyApplications.length === 0 && (
            <p className="muted">Loading applications...</p>
          )}
          {isAuthenticated && ownsMyApplications && hasRequestedMyApplications && !loading && visibleMyApplications.length === 0 && (
            <p className="muted">No applications yet.</p>
          )}
          {isAuthenticated && (
            <div className="role-application-list">
              {visibleMyApplications.map((row) => (
                <article key={row.application_id} className="role-application-card">
                  <div className="queue-header">
                    <strong>{roleLabel(row.target_role)}</strong>
                    <span className={`badge status-${row.status}`}>{row.status}</span>
                  </div>
                  <p className="role-application-help">{applicationHelp(row)}</p>
                  {row.reviewer_reason && <p className="role-application-reason">{row.reviewer_reason}</p>}
                  <p className="meta">Submitted {formatDate(row.created_at)}</p>
                  {row.decided_at && <p className="meta">Decided {formatDate(row.decided_at)}</p>}
                  <details className="technical-details">
                    <summary>Application reference</summary>
                    <p className="meta">{row.application_id}</p>
                    <button className="ghost" onClick={() => copyText(row.application_id, 'Application ID')}>
                      Copy Reference
                    </button>
                  </details>
                </article>
              ))}
            </div>
          )}
          </section>
      </section>
      )}

      {!isCommunityMember && (
        <section className="role-final">
          <p className="role-final-text">
            Thank you for your willingness to apply to the Digital Yaru. Your intentions to lend your voice, knowledge,
            and care already helps strengthen the shared work of preserving Ivatan language and heritage!
          </p>
        </section>
      )}

      {error && <section className="alert error">{error}</section>}
      {message && <section className="alert ok">{message}</section>}
    </section>
  )
}

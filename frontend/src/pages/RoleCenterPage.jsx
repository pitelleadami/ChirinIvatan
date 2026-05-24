/*
  RoleCenterPage.jsx

  Unified onboarding UI:
  - apply for contributor/reviewer role
  - reviewer/admin decision actions
  - reviewer/admin direct invitations
*/

import { useState } from 'react'

import { apiRequest } from '../lib/api'
import { ROUTES, navigate } from '../lib/router'

const APPLY_ROLES = ['contributor', 'reviewer']
const DECISIONS = ['approve', 'reject']
const INVITE_ROLES = ['contributor', 'reviewer']

export default function RoleCenterPage({ currentUser = {} }) {
  // Section A: applicant self-service state.
  const [applyRole, setApplyRole] = useState('contributor')
  const [myApplications, setMyApplications] = useState([])

  // Section B: reviewer/admin screening state.
  const [applicationId, setApplicationId] = useState('')
  const [decision, setDecision] = useState('approve')
  const [decisionNotes, setDecisionNotes] = useState('')

  // Section C: reviewer/admin direct invitation state.
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteRole, setInviteRole] = useState('contributor')
  const [inviteNotes, setInviteNotes] = useState('')

  // Shared request/feedback state used across all sections.
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const groups = currentUser.groups || []
  const isAuthenticated = Boolean(currentUser.is_authenticated)
  const isAdminUser = currentUser.is_superuser || groups.includes('Admin')
  const isReviewerUser = groups.includes('Reviewer')
  const canScreenRoles = isAuthenticated && (isAdminUser || isReviewerUser)
  const canOpenAdminApplications = isAuthenticated && isAdminUser

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
    setMyApplications(rows)
    return rows
  }

  async function createApplication() {
    if (!isAuthenticated) {
      setError('Log in first to apply for contributor or reviewer access.')
      return
    }
    // Applicant sends target role; backend enforces role validity + pending state.
    await run(async () => {
      const payload = await apiRequest('/api/users/role-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_role: applyRole }),
      })
      await fetchMyApplications()
      setMessage(`Application submitted: ${payload.application_id}`)
    })
  }

  async function loadMyApplications() {
    if (!isAuthenticated) {
      setError('Log in first to view your role applications.')
      return
    }
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

  async function submitDecision() {
    if (!canScreenRoles) {
      setError('Reviewer or admin access is required to decide role applications.')
      return
    }
    const id = applicationId.trim()
    if (!id) {
      setError('Enter application ID first.')
      return
    }

    await run(async () => {
      // Reviewer/admin decides an application by UUID.
      // Backend enforces quorum rules and anti-self-decision checks.
      const payload = await apiRequest(`/api/users/role-applications/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: decisionNotes }),
      })
      setMessage(`Decision saved. Application status: ${payload.application_status}`)
    })
  }

  async function sendInvitation() {
    if (!canScreenRoles) {
      setError('Reviewer or admin access is required to send role invitations.')
      return
    }
    const username = inviteUsername.trim()
    if (!username) {
      setError('Enter invitee username first.')
      return
    }

    await run(async () => {
      // Direct invitation path (no quorum) with accountability notes support.
      const payload = await apiRequest('/api/users/role-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          role: inviteRole,
          notes: inviteNotes,
        }),
      })
      setMessage(payload.accountability_label || 'Invitation sent.')
    })
  }

  return (
    <section className="role-center-page">
      <section className="role-center-hero">
        <div>
          <p className="profile-kicker">Community access</p>
          <h1>Role Center</h1>
          <p>
            Choose the path that matches what you want to do in Chirin Ivatan. Visitors can explore, contributors can
            submit words and stories, reviewers can validate community submissions, and admins can manage applications.
          </p>
        </div>
        <div className="role-status-card">
          <p className="profile-kicker">Signed in as</p>
          <p className="stat-value">{isAuthenticated ? currentUser.username : 'Visitor'}</p>
          <p className="muted">{isAuthenticated ? groups.join(', ') || 'Registered user' : 'Log in to contribute'}</p>
        </div>
      </section>

      <section className="role-path-grid" aria-label="Role paths">
        <article className="role-path-card">
          <p className="profile-kicker">Visitors</p>
          <h2>Explore</h2>
          <p className="muted">Read approved dictionary entries, folklore, FAQs, and public contributor profiles.</p>
          <div className="actions compact">
            <button className="ghost" onClick={() => navigate(ROUTES.dictionaryView)}>
              Dictionary
            </button>
            <button className="ghost" onClick={() => navigate(ROUTES.folkloreView)}>
              Folklore
            </button>
          </div>
        </article>

        <article className="role-path-card">
          <p className="profile-kicker">Contributors</p>
          <h2>Share</h2>
          <p className="muted">Apply for access, complete your profile, then submit dictionary and folklore drafts.</p>
          <div className="actions compact">
            {!isAuthenticated && <button onClick={() => navigate(ROUTES.login)}>Log In</button>}
            {isAuthenticated && (
              <>
                <button className="ghost" onClick={() => navigate(ROUTES.profileEdit)}>
                  Edit Profile
                </button>
                <button className="ghost" onClick={() => navigate(ROUTES.dictionaryDraft)}>
                  Add Word
                </button>
              </>
            )}
          </div>
        </article>

        <article className={`role-path-card ${canScreenRoles ? '' : 'locked'}`}>
          <p className="profile-kicker">Reviewers</p>
          <h2>Review</h2>
          <p className="muted">Approve, reject, or flag submitted dictionary and folklore revisions.</p>
          <div className="actions compact">
            <button className="ghost" disabled={!canScreenRoles} onClick={() => navigate(ROUTES.dashboard)}>
              Review Dashboard
            </button>
          </div>
        </article>

        <article className={`role-path-card ${canOpenAdminApplications ? '' : 'locked'}`}>
          <p className="profile-kicker">Admins</p>
          <h2>Manage</h2>
          <p className="muted">Screen role applications and keep community permissions accountable.</p>
          <div className="actions compact">
            <button
              className="ghost"
              disabled={!canOpenAdminApplications}
              onClick={() => navigate(ROUTES.adminApplications)}
            >
              Applications
            </button>
          </div>
        </article>
      </section>

      <section className="panel role-work-panel">
        <h3>Apply for Role (Current Logged User)</h3>
        {!isAuthenticated && (
          <p className="alert error">You can read the public archive now, but you need to log in before applying.</p>
        )}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="apply-role">Target Role</label>
            <select id="apply-role" value={applyRole} onChange={(event) => setApplyRole(event.target.value)}>
              {APPLY_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="actions">
          <button disabled={loading} onClick={() => createApplication()}>
            Submit Role Application
          </button>
          <button className="ghost" disabled={loading} onClick={() => loadMyApplications()}>
            Load My Applications
          </button>
        </div>
      </section>

      <section className="panel role-work-panel">
        <h3>My Applications</h3>
        {myApplications.length === 0 && <p className="muted">No application rows loaded.</p>}
        {myApplications.map((row) => (
          <article key={row.application_id} className="queue-card">
            <p className="meta">Application ID: {row.application_id}</p>
            <p className="meta">Target Role: {row.target_role}</p>
            <p className="meta">Status: {row.status}</p>
            <p className="meta">Created: {row.created_at}</p>
            <div className="actions">
              <button
                className="ghost"
                onClick={() => {
                  setApplicationId(row.application_id)
                  setMessage(`Loaded ${row.application_id} into decision field.`)
                }}
              >
                Use for Decision
              </button>
              <button className="ghost" onClick={() => copyText(row.application_id, 'Application ID')}>
                Copy ID
              </button>
            </div>
          </article>
        ))}
      </section>

      {canScreenRoles ? (
        <>
          <section className="panel role-work-panel">
            <h3>Reviewer/Admin: Decide Application</h3>
            <p className="muted">Rejecting will immediately close the application; approvals require quorum.</p>
            <p className="muted">Reviewer application quorum reminder: 1 reviewer + 1 admin OR 2 reviewers.</p>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="decision-app-id">Application ID</label>
                <input
                  id="decision-app-id"
                  value={applicationId}
                  onChange={(event) => setApplicationId(event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="decision-value">Decision</label>
                <select id="decision-value" value={decision} onChange={(event) => setDecision(event.target.value)}>
                  {DECISIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="decision-notes">Decision Notes</label>
              <textarea
                id="decision-notes"
                rows={3}
                value={decisionNotes}
                onChange={(event) => setDecisionNotes(event.target.value)}
                placeholder="Explain approval/rejection context."
              />
            </div>

            <button disabled={loading} onClick={() => submitDecision()}>
              Submit Decision
            </button>
          </section>

          <section className="panel role-work-panel">
            <h3>Reviewer/Admin: Direct Invite</h3>
            <p className="muted">Single reviewer/admin can directly invite contributor/reviewer.</p>
            <p className="muted">Inviter becomes publicly accountable in the profile accountability line.</p>

            <div className="field-grid">
              <div className="field">
                <label htmlFor="invite-username">Invitee Username</label>
                <input
                  id="invite-username"
                  value={inviteUsername}
                  onChange={(event) => setInviteUsername(event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="invite-role">Role</label>
                <select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                  {INVITE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="invite-notes">Invite Notes</label>
              <textarea
                id="invite-notes"
                rows={3}
                value={inviteNotes}
                onChange={(event) => setInviteNotes(event.target.value)}
                placeholder="Optional accountability context"
              />
            </div>

            <button disabled={loading} onClick={() => sendInvitation()}>
              Send Invitation
            </button>
          </section>
        </>
      ) : (
        <section className="panel role-work-panel role-locked-panel">
          <h3>Reviewer/Admin Tools</h3>
          <p className="muted">
            Review decisions and direct invitations appear here after your account receives reviewer or admin access.
          </p>
        </section>
      )}

      {error && <section className="alert error">{error}</section>}
      {message && <section className="alert ok">{message}</section>}
    </section>
  )
}

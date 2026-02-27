/*
  RoleCenterPage.jsx

  Unified onboarding UI:
  - apply for contributor/reviewer role
  - reviewer/admin decision actions
  - reviewer/admin direct invitations
*/

import { useState } from 'react'

import { apiRequest } from '../lib/api'

const APPLY_ROLES = ['contributor', 'reviewer']
const DECISIONS = ['approve', 'reject']
const INVITE_ROLES = ['contributor', 'reviewer']

export default function RoleCenterPage() {
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

  async function createApplication() {
    // Applicant sends target role; backend enforces role validity + pending state.
    await run(async () => {
      const payload = await apiRequest('/api/users/role-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_role: applyRole }),
      })
      setMessage(`Application submitted: ${payload.application_id}`)
      await loadMyApplications()
    })
  }

  async function loadMyApplications() {
    // Pull current user's own applications only.
    await run(async () => {
      const payload = await apiRequest('/api/users/role-applications/my')
      setMyApplications(payload.rows || [])
      if (!payload.rows?.length) {
        setMessage('No applications found for current user.')
      }
    })
  }

  async function submitDecision() {
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
    <>
      <section className="panel">
        <h2>Role Center</h2>
        <p className="muted">This page combines role application, role screening decisions, and direct invitations.</p>
        <p className="muted">
          Reviewer application quorum reminder: 1 reviewer + 1 admin OR 2 reviewers.
        </p>
      </section>

      <section className="panel">
        <h3>Apply for Role (Current Logged User)</h3>
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
          <button disabled={loading} onClick={createApplication}>
            Submit Role Application
          </button>
          <button className="ghost" disabled={loading} onClick={loadMyApplications}>
            Load My Applications
          </button>
        </div>
      </section>

      <section className="panel">
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

      <section className="panel">
        <h3>Reviewer/Admin: Decide Application</h3>
        <p className="muted">Use this only when logged in as reviewer/admin.</p>
        <p className="muted">Rejecting will immediately close the application; approvals require quorum.</p>
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

        <button disabled={loading} onClick={submitDecision}>
          Submit Decision
        </button>
      </section>

      <section className="panel">
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

        <button disabled={loading} onClick={sendInvitation}>
          Send Invitation
        </button>
      </section>

      {error && <section className="alert error">{error}</section>}
      {message && <section className="alert ok">{message}</section>}
    </>
  )
}

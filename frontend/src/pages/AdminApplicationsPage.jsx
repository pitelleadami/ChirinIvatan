import { useEffect, useMemo, useState } from 'react'

import { apiRequest } from '../lib/api'
import { ROUTES, navigate } from '../lib/router'

const STATUSES = ['pending', 'approved', 'rejected', 'all']
const USER_GROUPS = ['all', 'Admin', 'Reviewer', 'Contributor']

function displayName(applicant) {
  const fullName = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ').trim()
  return fullName || applicant.username
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
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

export default function AdminApplicationsPage({ currentUser }) {
  const [activeTab, setActiveTab] = useState('applications')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [applications, setApplications] = useState([])
  const [people, setPeople] = useState([])
  const [peopleSearch, setPeopleSearch] = useState('')
  const [peopleGroup, setPeopleGroup] = useState('all')
  const [notesById, setNotesById] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingPeople, setLoadingPeople] = useState(false)
  const [actingId, setActingId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const isAdmin = currentUser?.is_superuser || currentUser?.groups?.includes('Admin')
  const counts = useMemo(
    () => ({
      pending: applications.filter((row) => row.status === 'pending').length,
      approved: applications.filter((row) => row.status === 'approved').length,
      rejected: applications.filter((row) => row.status === 'rejected').length,
      total: applications.length,
    }),
    [applications],
  )
  const peopleCounts = useMemo(
    () => ({
      total: people.length,
      admins: people.filter((row) => row.groups.includes('Admin') || row.is_superuser).length,
      reviewers: people.filter((row) => row.groups.includes('Reviewer')).length,
      contributors: people.filter((row) => row.groups.includes('Contributor')).length,
    }),
    [people],
  )

  async function loadApplications(nextFilter = statusFilter) {
    if (!isAdmin) return
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

  async function decide(applicationId, decision) {
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
          notes: notesById[applicationId] || '',
        }),
      })
      setMessage(`Application ${payload.application_status}.`)
      await loadApplications()
      await loadPeople()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setActingId('')
    }
  }

  useEffect(() => {
    loadApplications(statusFilter)
    // Reload when the current user or selected filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, statusFilter])

  useEffect(() => {
    loadPeople()
    // Load people when admin access is available or group filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, peopleGroup])

  if (!isAdmin) {
    return (
      <section className="panel">
        <h1>Community Admin</h1>
        <p className="alert error">Admin access required.</p>
        <button onClick={() => navigate(ROUTES.dictionaryView)}>Go to Dictionary</button>
      </section>
    )
  }

  return (
    <section className="admin-applications-page">
      <div className="admin-applications-header">
        <div>
          <p className="profile-kicker">Admin</p>
          <h1>Community Admin</h1>
          <p className="muted">Review role applications and see the people registered in the system.</p>
        </div>
        <button disabled={loading || loadingPeople} onClick={() => (activeTab === 'applications' ? loadApplications() : loadPeople())}>
          {loading || loadingPeople ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="admin-tabs" aria-label="Admin sections">
        <button
          className={activeTab === 'applications' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => setActiveTab('applications')}
        >
          Applications
        </button>
        <button
          className={activeTab === 'people' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => setActiveTab('people')}
        >
          People
        </button>
      </div>

      {activeTab === 'applications' && (
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
        <article>
          <p className="stat-label">Loaded</p>
          <p className="stat-value">{counts.total}</p>
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

          <div className="admin-app-list">
        {!loading && applications.length === 0 && <p className="muted">No applications found for this filter.</p>}
        {applications.map((application) => {
          const applicant = application.applicant
          const isPending = application.status === 'pending'
          return (
            <article key={application.application_id} className="admin-app-card">
              <div className="admin-app-main">
                <ApplicantAvatar applicant={applicant} />
                <div>
                  <div className="queue-header">
                    <h2>{displayName(applicant)}</h2>
                    <span className="badge">{application.status}</span>
                  </div>
                  <p className="meta">
                    @{applicant.username} applying as {application.target_role}
                  </p>
                  <p className="meta">
                    {applicant.municipality || 'No municipality yet'}
                    {applicant.affiliation ? ` - ${applicant.affiliation}` : ''}
                    {applicant.occupation ? ` - ${applicant.occupation}` : ''}
                  </p>
                  <p className="meta">Submitted {formatDate(application.created_at)}</p>
                </div>
              </div>

              <div className="admin-app-details">
                <div>
                  <p className="stat-label">Current Groups</p>
                  <p className="meta">{applicant.groups.length ? applicant.groups.join(', ') : 'None'}</p>
                </div>
                <div>
                  <p className="stat-label">Decision History</p>
                  {application.decisions.length === 0 ? (
                    <p className="meta">No decisions yet.</p>
                  ) : (
                    application.decisions.map((row) => (
                      <p key={row.decision_id} className="meta">
                        {row.decision} by {row.decided_by} on {formatDate(row.created_at)}
                        {row.notes ? ` - ${row.notes}` : ''}
                      </p>
                    ))
                  )}
                </div>
              </div>

              {isPending && (
                <div className="admin-app-actions">
                  <label className="field" htmlFor={`notes-${application.application_id}`}>
                    <span>Decision notes</span>
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
                      placeholder="Optional reason or accountability note"
                    />
                  </label>
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
                      onClick={() => decide(application.application_id, 'reject')}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
        </>
      )}

      {activeTab === 'people' && (
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
              <p className="stat-label">Reviewers</p>
              <p className="stat-value">{peopleCounts.reviewers}</p>
            </article>
            <article>
              <p className="stat-label">Contributors</p>
              <p className="stat-value">{peopleCounts.contributors}</p>
            </article>
          </div>

          <div className="admin-people-toolbar">
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
            <button disabled={loadingPeople} onClick={() => loadPeople()}>
              {loadingPeople ? 'Searching...' : 'Search'}
            </button>
          </div>

          {error && <p className="alert error">{error}</p>}
          {message && <p className="alert ok">{message}</p>}

          <div className="table-wrap">
            <table className="simple-table admin-people-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Roles</th>
                  <th>Municipality</th>
                  <th>Contributions</th>
                  <th>Reviews</th>
                  <th>Joined</th>
                  <th>Profile</th>
                </tr>
              </thead>
              <tbody>
                {!loadingPeople && people.length === 0 && (
                  <tr>
                    <td colSpan="7">No people found for this search.</td>
                  </tr>
                )}
                {people.map((person) => (
                  <tr key={person.username}>
                    <td>
                      <span className="admin-person-cell">
                        <ApplicantAvatar applicant={person} />
                        <span>
                          <strong>{displayName(person)}</strong>
                          <span className="meta">@{person.username}</span>
                          <span className="meta">{person.email || 'No email set'}</span>
                        </span>
                      </span>
                    </td>
                    <td>{person.groups.length ? person.groups.join(', ') : person.is_superuser ? 'Superuser' : 'Registered'}</td>
                    <td>{person.profile?.municipality || '-'}</td>
                    <td>{person.stats?.combined_total || 0}</td>
                    <td>{person.stats?.review_completed_total || 0}</td>
                    <td>{formatDate(person.date_joined)}</td>
                    <td>
                      <button
                        className="ghost"
                        onClick={() => navigate(`${ROUTES.profileView}?username=${encodeURIComponent(person.username)}`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

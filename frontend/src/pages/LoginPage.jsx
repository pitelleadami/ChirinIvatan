import { useEffect, useState } from 'react'

import { apiRequest } from '../lib/api'
import { ROUTES, navigate } from '../lib/router'

export default function LoginPage({ currentUser, onAuthChange }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const userGroups = currentUser?.groups || []
  const canReview = currentUser?.is_superuser || userGroups.includes('Admin') || userGroups.includes('Reviewer')

  function destinationForUser(user) {
    const groups = user?.groups || []
    if (user?.is_superuser || groups.includes('Admin')) return ROUTES.adminApplications
    if (groups.includes('Reviewer')) return ROUTES.dashboard
    return ROUTES.dictionaryView
  }

  useEffect(() => {
    apiRequest('/api/auth/csrf').catch(() => {
      setError('Backend is not reachable. Start Django on http://127.0.0.1:8000 first.')
    })
  }, [])

  useEffect(() => {
    if (currentUser?.is_authenticated) {
      navigate(destinationForUser(currentUser))
    }
    // Redirect whenever a logged-in user lands on the login screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.is_authenticated, currentUser?.username])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setStatus('')
    setIsSubmitting(true)

    try {
      await apiRequest('/api/auth/csrf')
      const user = await apiRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      onAuthChange(user)
      setPassword('')
      setStatus(`Signed in as ${user.username}.`)
      navigate(destinationForUser(user))
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="login-page">
      <div className="login-panel">
        <div>
          <h1>Log in</h1>
          <p className="muted">Use your admin, reviewer, contributor, or test account to access protected workflows.</p>
        </div>

        {currentUser?.is_authenticated ? (
          <div className="login-success">
            <p className="stat-value">{currentUser.username}</p>
            <p className="muted">
              {currentUser.is_superuser || currentUser.groups?.includes('Admin')
                ? 'Admin account'
                : currentUser.groups?.join(', ') || 'Signed-in account'}
            </p>
            <div className="actions">
              {canReview && <button onClick={() => navigate(ROUTES.dashboard)}>Reviewer Dashboard</button>}
              <button className="ghost" onClick={() => navigate(ROUTES.dictionaryDraft)}>
                Dictionary Draft
              </button>
              <button className="ghost" onClick={() => navigate(ROUTES.folkloreDraft)}>
                Folklore Draft
              </button>
              <button className="ghost" onClick={() => navigate(ROUTES.roleCenter)}>
                Role Center
              </button>
            </div>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field" htmlFor="login-username">
              <span>Username</span>
              <input
                id="login-username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>

            <label className="field" htmlFor="login-password">
              <span>Password</span>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error && <p className="alert error">{error}</p>}
            {status && <p className="alert ok">{status}</p>}

            <div className="actions">
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Log in'}
              </button>
              <button type="button" className="ghost" onClick={() => navigate(ROUTES.home)}>
                Back to Home
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}

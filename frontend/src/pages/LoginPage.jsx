import { useEffect, useState } from 'react'

import { apiRequest } from '../lib/api'
import heroVillageImage from '../assets/landing/ivatan-village-hero.jpg'
import { ROUTES, navigate } from '../lib/router'

const PUBLIC_SIGN_IN_ERROR = 'Unable to sign in right now. Please try again later.'

function isInfrastructureError(message) {
  return /backend is not reachable|csrf verification failed|failed to fetch|networkerror|load failed|request failed with status 5/i.test(
    message || '',
  )
}

export default function LoginPage({ currentUser, onAuthChange }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const userGroups = currentUser?.groups || []
  const isAdminUser = currentUser?.is_superuser || userGroups.includes('Admin')
  const canReview = currentUser?.is_superuser || userGroups.includes('Admin') || userGroups.includes('Reviewer')

  function loginErrorMessage(errorMessage) {
    if (isAdminUser) return errorMessage
    if (isInfrastructureError(errorMessage)) return PUBLIC_SIGN_IN_ERROR
    return errorMessage || PUBLIC_SIGN_IN_ERROR
  }

  function destinationForUser(user) {
    if (user?.is_authenticated && !user?.profile_complete) return ROUTES.profileEdit
    const groups = user?.groups || []
    const isAdminUser = user?.is_superuser || groups.includes('Admin')
    if (!isAdminUser && groups.includes('Reviewer')) return ROUTES.dashboard
    return ROUTES.adminApplications
  }

  useEffect(() => {
    apiRequest('/api/auth/csrf').catch(() => {
      if (isAdminUser) {
        setError('Backend is not reachable. Start Django on http://127.0.0.1:8000 first.')
      }
    })
  }, [isAdminUser])

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
      setError(loginErrorMessage(err.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="login-page" style={{ '--login-hero-image': `url(${heroVillageImage})` }}>
      <div className="login-page-inner">
        <div className="login-panel">
          <div>
            <h1>Log in</h1>
            <p className="muted">Use your contributor or reviewer account to access protected workflows.</p>
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
                {!currentUser.profile_complete && (
                  <button onClick={() => navigate(ROUTES.profileEdit)}>Complete Profile</button>
                )}
                {currentUser.profile_complete && (
                  <button onClick={() => navigate(ROUTES.adminApplications)}>Steward's Desk</button>
                )}
                {canReview && currentUser.profile_complete && (
                  <button className="ghost" onClick={() => navigate(ROUTES.dashboard)}>Reviewer Dashboard</button>
                )}
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
      </div>
    </section>
  )
}

import { useEffect, useState } from 'react'

import TurnstileWidget from '../components/TurnstileWidget'
import { apiRequest } from '../lib/api'
import heroVillageImage from '../assets/landing/ivatan-village-hero.jpg'
import { ROUTES, navigate } from '../lib/router'

const PUBLIC_SIGN_IN_ERROR = 'Unable to sign in right now. Please try again later.'

function isInfrastructureError(message) {
  return /backend is not reachable|csrf verification failed|failed to fetch|networkerror|load failed|request failed with status 5/i.test(
    message || '',
  )
}

function PasswordEyeIcon({ visible }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {!visible && (
        <path d="M4 4l16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  )
}

export default function LoginPage({ currentUser, onAuthChange }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [showResetForm, setShowResetForm] = useState(false)
  const [resetTurnstileToken, setResetTurnstileToken] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResetSubmitting, setIsResetSubmitting] = useState(false)
  const userGroups = currentUser?.groups || []
  const isAdminUser = currentUser?.is_superuser || userGroups.includes('Admin')

  function loginErrorMessage(errorMessage) {
    if (isAdminUser) return errorMessage
    if (isInfrastructureError(errorMessage)) return PUBLIC_SIGN_IN_ERROR
    return errorMessage || PUBLIC_SIGN_IN_ERROR
  }

  function destinationForUser(user) {
    const needsOnboarding =
      user?.is_authenticated &&
      !user?.onboarding_prompt_dismissed &&
      (user?.onboarding_prompt_pending || !user?.profile_complete)
    if (needsOnboarding) {
      return `${ROUTES.adminApplications}?tab=contributions&welcome=onboarding`
    }
    const groups = user?.groups || []
    const isAdminUser = user?.is_superuser || groups.includes('Admin')
    const canReview = isAdminUser || groups.includes('Reviewer') || groups.includes('Consultant')
    if (!isAdminUser && canReview) return `${ROUTES.adminApplications}?tab=reviews`
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

  async function handlePasswordReset(event) {
    event.preventDefault()
    setError('')
    setStatus('')
    setIsResetSubmitting(true)

    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail,
          turnstile_token: resetTurnstileToken,
        }),
      })
      setStatus(
        payload.detail || 'If an active account uses that email, a password reset link has been sent.',
      )
      setResetEmail('')
      setResetTurnstileToken('')
      setShowResetForm(false)
    } catch (err) {
      setError(loginErrorMessage(err.message))
    } finally {
      setIsResetSubmitting(false)
    }
  }

  return (
    <section className="login-page" style={{ '--login-hero-image': `url(${heroVillageImage})` }}>
      <div className="login-page-inner">
        <div className="login-panel">
          <div>
            <h1>Log in</h1>
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
                {!currentUser.onboarding_prompt_dismissed &&
                (currentUser.onboarding_prompt_pending || !currentUser.profile_complete) ? (
                  <button onClick={() => navigate(ROUTES.profileEdit)}>Complete Profile</button>
                ) : (
                  <button onClick={() => navigate(ROUTES.adminApplications)}>Steward's Desk</button>
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
                <span className="password-field-control">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="password-visibility-button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-pressed={showPassword}
                  >
                    <PasswordEyeIcon visible={showPassword} />
                    <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
                  </button>
                </span>
              </label>

              <div className="login-assist-row">
                <button
                  type="button"
                  className="inline-link-button login-discreet-link"
                  onClick={() => {
                    setShowResetForm((current) => !current)
                    setError('')
                    setStatus('')
                  }}
                >
                  Forgot password?
                </button>
              </div>

              {showResetForm && (
                <div className="login-reset-panel">
                  <label className="field" htmlFor="login-reset-email">
                    <span>Account email</span>
                    <input
                      id="login-reset-email"
                      type="email"
                      autoComplete="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      placeholder="name@example.com"
                    />
                  </label>
                  <TurnstileWidget
                    action="password-reset"
                    onToken={setResetTurnstileToken}
                    onError={(message) => setError(message)}
                  />
                  <button
                    type="button"
                    className="ghost compact-button"
                    disabled={isResetSubmitting}
                    onClick={handlePasswordReset}
                  >
                    {isResetSubmitting ? 'Sending...' : 'Send reset link'}
                  </button>
                </div>
              )}

              {error && <p className="alert error">{error}</p>}
              {status && <p className="alert ok">{status}</p>}

              <div className="actions">
                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Signing in...' : 'Log in'}
                </button>
              </div>
              <p className="login-join-copy">
                Don&apos;t have an account yet?{' '}
                <button
                  type="button"
                  className="inline-link-button"
                  onClick={() => navigate(ROUTES.roleCenter)}
                >
                  Join the Digital Yaru now!
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

/*
  App.jsx

  Shell layout + simple route switching.
  This app intentionally uses lightweight history-based routing instead of
  a full routing library to keep beginner setup simple.
*/

import { useEffect, useState } from 'react'
import './App.css'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import AboutProjectPage from './pages/AboutProjectPage'
import YaruPage from './pages/YaruPage'
import FaqPage from './pages/FaqPage'
import UserManualPage from './pages/UserManualPage'
import ReviewerDashboardPage from './pages/ReviewerDashboardPage'
import AdminApplicationsPage from './pages/AdminApplicationsPage'
import DictionaryViewerPage from './pages/DictionaryViewerPage'
import DictionaryDraftBuilderPage from './pages/DictionaryDraftBuilderPage'
import FolkloreViewerPage from './pages/FolkloreViewerPage'
import FolkloreDraftBuilderPage from './pages/FolkloreDraftBuilderPage'
import PublicProfilePage from './pages/PublicProfilePage'
import ProfileEditPage from './pages/ProfileEditPage'
import LeaderboardPage from './pages/LeaderboardPage'
import RoleCenterPage from './pages/RoleCenterPage'
import { apiRequest } from './lib/api'
import { ROUTES, navigate, normalizePath } from './lib/router'

export default function App() {
  // Keep route state in sync with browser navigation (back/forward buttons).
  const [pathname, setPathname] = useState(normalizePath(window.location.pathname))
  const [currentUser, setCurrentUser] = useState({ is_authenticated: false })

  useEffect(() => {
    const onPopState = () => setPathname(normalizePath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    apiRequest('/api/auth/me')
      .then(setCurrentUser)
      .catch(() => setCurrentUser({ is_authenticated: false }))
  }, [])

  const isHome = pathname === ROUTES.home
  const apiBase = import.meta.env.VITE_API_BASE || ''
  const adminHref = `${apiBase}/admin/`
  const userGroups = currentUser.groups || []
  const isAdminUser = currentUser.is_superuser || userGroups.includes('Admin')
  const isReviewerUser = userGroups.includes('Reviewer')
  const canReview = currentUser.is_authenticated && (isAdminUser || isReviewerUser)
  const canOpenAdmin = currentUser.is_authenticated && (currentUser.is_staff || isAdminUser)

  function activeClass(route) {
    return pathname === route ? 'top-link-button active' : 'top-link-button'
  }

  function activeProps(route) {
    return pathname === route ? { 'aria-current': 'page' } : {}
  }

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/csrf')
      const payload = await apiRequest('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      setCurrentUser(payload)
      navigate(ROUTES.login)
    } catch {
      setCurrentUser({ is_authenticated: false })
      navigate(ROUTES.login)
    }
  }

  return (
    <div className="site-bg">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand-wrap brand-home-button" onClick={() => navigate(ROUTES.home)}>
            <div className="logo-placeholder" aria-hidden="true" />
            <div>
              <p className="brand">Chirin Ivatan</p>
              <p className="brand-sub">Preserving our language through the spirit of the Ivatan Yaru</p>
            </div>
          </button>
          <nav className="top-links" aria-label="Visitor navigation">
            <button className={activeClass(ROUTES.about)} {...activeProps(ROUTES.about)} onClick={() => navigate(ROUTES.about)}>
              About this Project
            </button>
            <button className={activeClass(ROUTES.yaru)} {...activeProps(ROUTES.yaru)} onClick={() => navigate(ROUTES.yaru)}>
              The Digital Yaru
            </button>
            <button
              className={activeClass(ROUTES.dictionaryView)}
              {...activeProps(ROUTES.dictionaryView)}
              onClick={() => navigate(ROUTES.dictionaryView)}
            >
              Dictionary
            </button>
            <button
              className={activeClass(ROUTES.folkloreView)}
              {...activeProps(ROUTES.folkloreView)}
              onClick={() => navigate(ROUTES.folkloreView)}
            >
              Folklore
            </button>
            <button
              className={activeClass(ROUTES.leaderboards)}
              {...activeProps(ROUTES.leaderboards)}
              onClick={() => navigate(ROUTES.leaderboards)}
            >
              Leaderboards
            </button>
            <button className={activeClass(ROUTES.faqs)} {...activeProps(ROUTES.faqs)} onClick={() => navigate(ROUTES.faqs)}>
              FAQs
            </button>
            <button
              className={activeClass(ROUTES.manual)}
              {...activeProps(ROUTES.manual)}
              onClick={() => navigate(ROUTES.manual)}
            >
              Manual
            </button>
            {currentUser.is_authenticated && (
              <details className="top-tools-menu">
                <summary>My Tools</summary>
                <div className="top-tools-panel">
                  <button className="top-link-button" onClick={() => navigate(ROUTES.manual)}>
                    User Manual
                  </button>
                  <button className="top-link-button" onClick={() => navigate(ROUTES.dictionaryDraft)}>
                    Add Dictionary Entry
                  </button>
                  <button className="top-link-button" onClick={() => navigate(ROUTES.folkloreDraft)}>
                    Add Folklore
                  </button>
                  <button className="top-link-button" onClick={() => navigate(ROUTES.roleCenter)}>
                    Roles
                  </button>
                  <button
                    className="top-link-button"
                    onClick={() =>
                      navigate(`${ROUTES.profileView}?username=${encodeURIComponent(currentUser.username)}`)
                    }
                  >
                    My Profile
                  </button>
                  {canReview && (
                    <button className="top-link-button" onClick={() => navigate(ROUTES.dashboard)}>
                      Review Dashboard
                    </button>
                  )}
                  {isAdminUser && (
                    <button className="top-link-button" onClick={() => navigate(ROUTES.adminApplications)}>
                      Community Admin
                    </button>
                  )}
                  {canOpenAdmin && (
                    <a className="top-admin-link" href={adminHref} target="_blank" rel="noreferrer">
                      Django Admin Console
                    </a>
                  )}
                </div>
              </details>
            )}
            {currentUser.is_authenticated ? (
              <button className="pill-link top-pill-button" onClick={handleLogout}>
                Log Out {currentUser.username}
              </button>
            ) : (
              <button className="pill-link top-pill-button" onClick={() => navigate(ROUTES.login)}>
                Log In
              </button>
            )}
          </nav>
        </div>
      </header>

      <main id="main-content" className={isHome ? 'app-shell app-shell-home' : 'app-shell'}>
        {pathname === ROUTES.home && <HomePage />}
        {pathname === ROUTES.login && <LoginPage currentUser={currentUser} onAuthChange={setCurrentUser} />}
        {pathname === ROUTES.about && <AboutProjectPage />}
        {pathname === ROUTES.yaru && <YaruPage />}
        {pathname === ROUTES.faqs && <FaqPage />}
        {pathname === ROUTES.manual && <UserManualPage />}
        {pathname === ROUTES.dashboard && <ReviewerDashboardPage />}
        {pathname === ROUTES.adminApplications && <AdminApplicationsPage currentUser={currentUser} />}
        {pathname === ROUTES.dictionaryView && <DictionaryViewerPage currentUser={currentUser} />}
        {pathname === ROUTES.dictionaryDraft && <DictionaryDraftBuilderPage />}
        {pathname === ROUTES.folkloreView && <FolkloreViewerPage currentUser={currentUser} />}
        {pathname === ROUTES.folkloreDraft && <FolkloreDraftBuilderPage />}
        {pathname === ROUTES.profileView && <PublicProfilePage currentUser={currentUser} />}
        {pathname === ROUTES.profileEdit && (
          <ProfileEditPage currentUser={currentUser} onAuthChange={setCurrentUser} />
        )}
        {pathname === ROUTES.leaderboards && <LeaderboardPage />}
        {pathname === ROUTES.roleCenter && <RoleCenterPage currentUser={currentUser} />}
      </main>
    </div>
  )
}

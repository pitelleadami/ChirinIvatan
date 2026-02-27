/*
  App.jsx

  Shell layout + simple route switching.
  This app intentionally uses lightweight history-based routing instead of
  a full routing library to keep beginner setup simple.
*/

import { useEffect, useState } from 'react'
import './App.css'

import HomePage from './pages/HomePage'
import ReviewerDashboardPage from './pages/ReviewerDashboardPage'
import DictionaryViewerPage from './pages/DictionaryViewerPage'
import FolkloreViewerPage from './pages/FolkloreViewerPage'
import FolkloreDraftBuilderPage from './pages/FolkloreDraftBuilderPage'
import PublicProfilePage from './pages/PublicProfilePage'
import LeaderboardPage from './pages/LeaderboardPage'
import RoleCenterPage from './pages/RoleCenterPage'
import { ROUTES, navigate, normalizePath } from './lib/router'

export default function App() {
  // Keep route state in sync with browser navigation (back/forward buttons).
  const [pathname, setPathname] = useState(normalizePath(window.location.pathname))

  useEffect(() => {
    const onPopState = () => setPathname(normalizePath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return (
    <div className="site-bg">
      <header className="topbar">
        <div className="topbar-inner">
          <div>
            <p className="brand">Chirin Ivatan</p>
            <p className="brand-sub">Digital language and folklore archive console</p>
          </div>
          <a className="pill-link" href="/admin/" target="_blank" rel="noreferrer">
            Admin Login
          </a>
        </div>
      </header>

      <main className="app-shell">
        {/* Simple tab navigation so each workflow page is one click away. */}
        <nav className="nav" aria-label="Primary navigation">
          <button
            className={pathname === ROUTES.home ? 'tab active' : 'tab'}
            onClick={() => navigate(ROUTES.home)}
          >
            Home
          </button>
          <button
            className={pathname === ROUTES.dashboard ? 'tab active' : 'tab'}
            onClick={() => navigate(ROUTES.dashboard)}
          >
            Reviewer Dashboard
          </button>
          <button
            className={pathname === ROUTES.dictionaryView ? 'tab active' : 'tab'}
            onClick={() => navigate(ROUTES.dictionaryView)}
          >
            Dictionary Viewer
          </button>
          <button
            className={pathname === ROUTES.folkloreView ? 'tab active' : 'tab'}
            onClick={() => navigate(ROUTES.folkloreView)}
          >
            Folklore Viewer
          </button>
          <button
            className={pathname === ROUTES.folkloreDraft ? 'tab active' : 'tab'}
            onClick={() => navigate(ROUTES.folkloreDraft)}
          >
            Folklore Draft Builder
          </button>
          <button
            className={pathname === ROUTES.profileView ? 'tab active' : 'tab'}
            onClick={() => navigate(ROUTES.profileView)}
          >
            Public Profile
          </button>
          <button
            className={pathname === ROUTES.leaderboards ? 'tab active' : 'tab'}
            onClick={() => navigate(ROUTES.leaderboards)}
          >
            Leaderboards
          </button>
          <button
            className={pathname === ROUTES.roleCenter ? 'tab active' : 'tab'}
            onClick={() => navigate(ROUTES.roleCenter)}
          >
            Role Center
          </button>
        </nav>

        {pathname === ROUTES.home && <HomePage />}
        {pathname === ROUTES.dashboard && <ReviewerDashboardPage />}
        {pathname === ROUTES.dictionaryView && <DictionaryViewerPage />}
        {pathname === ROUTES.folkloreView && <FolkloreViewerPage />}
        {pathname === ROUTES.folkloreDraft && <FolkloreDraftBuilderPage />}
        {pathname === ROUTES.profileView && <PublicProfilePage />}
        {pathname === ROUTES.leaderboards && <LeaderboardPage />}
        {pathname === ROUTES.roleCenter && <RoleCenterPage />}
      </main>
    </div>
  )
}

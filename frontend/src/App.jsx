import { useEffect, useState } from 'react'
import './App.css'

import HomePage from './pages/HomePage'
import ReviewerDashboardPage from './pages/ReviewerDashboardPage'
import DictionaryViewerPage from './pages/DictionaryViewerPage'
import FolkloreViewerPage from './pages/FolkloreViewerPage'
import FolkloreDraftBuilderPage from './pages/FolkloreDraftBuilderPage'
import { ROUTES, navigate, normalizePath } from './lib/router'

export default function App() {
  const [pathname, setPathname] = useState(normalizePath(window.location.pathname))

  useEffect(() => {
    const onPopState = () => setPathname(normalizePath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Chirin Ivatan Console</h1>
        <nav className="nav">
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
          <a className="tab link" href="/admin/" target="_blank" rel="noreferrer">
            Admin Login
          </a>
        </nav>
      </header>

      {pathname === ROUTES.home && <HomePage />}
      {pathname === ROUTES.dashboard && <ReviewerDashboardPage />}
      {pathname === ROUTES.dictionaryView && <DictionaryViewerPage />}
      {pathname === ROUTES.folkloreView && <FolkloreViewerPage />}
      {pathname === ROUTES.folkloreDraft && <FolkloreDraftBuilderPage />}
    </main>
  )
}

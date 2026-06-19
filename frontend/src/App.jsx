/*
  App.jsx

  Shell layout + simple route switching.
  This app intentionally uses lightweight history-based routing instead of
  a full routing library to keep beginner setup simple.
*/

import { useEffect, useState } from 'react'
import './App.css'

import brandLogo from './assets/brand/chirin-ivatan-logo.png'
import NotificationBell from './components/NotificationBell'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import AboutProjectPage from './pages/AboutProjectPage'
import YaruPage from './pages/YaruPage'
import FaqPage from './pages/FaqPage'
import AdminApplicationsPage from './pages/AdminApplicationsPage'
import DictionaryViewerPage from './pages/DictionaryViewerPage'
import DictionaryDraftBuilderPage from './pages/DictionaryDraftBuilderPage'
import FolkloreViewerPage from './pages/FolkloreViewerPage'
import FolkloreDraftBuilderPage from './pages/FolkloreDraftBuilderPage'
import PublicProfilePage from './pages/PublicProfilePage'
import ProfileEditPage from './pages/ProfileEditPage'
import LeaderboardPage from './pages/LeaderboardPage'
import RoleCenterPage from './pages/RoleCenterPage'
import { initAnalytics, trackPageView } from './lib/analytics'
import { apiRequest } from './lib/api'
import { ROUTES, legacyRedirectFor, navigate, normalizePath } from './lib/router'
import { DEFAULT_SITE_CONTENT, normalizeSiteContent } from './lib/siteContent'

const BRAND_HIDDEN_ROUTES = new Set([ROUTES.home, ROUTES.dictionaryView, ROUTES.folkloreView])

function currentAppPath() {
  const legacyTarget = legacyRedirectFor(window.location.pathname)
  if (!legacyTarget) return normalizePath(window.location.pathname)

  window.history.replaceState({}, '', legacyTarget)
  return normalizePath(new URL(legacyTarget, window.location.origin).pathname)
}

function MaintenancePage({ message, currentUser, onLogout }) {
  const isSignedIn = Boolean(currentUser?.is_authenticated)
  return (
    <section className="maintenance-page">
      <div className="maintenance-panel">
        <p className="profile-kicker">Maintenance</p>
        <h1>Chirin Ivatan is temporarily paused</h1>
        <p>{message}</p>
        <div className="actions">
          {!isSignedIn && (
            <button type="button" onClick={() => navigate(ROUTES.login)}>
              Admin Login
            </button>
          )}
          {isSignedIn && (
            <button type="button" onClick={onLogout}>
              Log Out
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export default function App() {
  // Keep route state in sync with browser navigation (back/forward buttons).
  const [pathname, setPathname] = useState(currentAppPath)
  const [hideHomeBrandText, setHideHomeBrandText] = useState(() => BRAND_HIDDEN_ROUTES.has(currentAppPath()))
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState({ is_authenticated: false })
  const [authChecked, setAuthChecked] = useState(false)
  const [siteContent, setSiteContent] = useState(DEFAULT_SITE_CONTENT)
  const [siteContentLoaded, setSiteContentLoaded] = useState(false)

  useEffect(() => {
    initAnalytics()

    function handleRouteAnalytics() {
      trackPageView()
    }

    window.addEventListener('popstate', handleRouteAnalytics)
    return () => window.removeEventListener('popstate', handleRouteAnalytics)
  }, [])

  useEffect(() => {
    const onPopState = () => {
      setPathname(currentAppPath())
      setIsMobileMenuOpen(false)
      setIsToolsMenuOpen(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    function closeToolsOnOutsideInteraction(event) {
      if (!isToolsMenuOpen) return
      if (event.target.closest('.top-tools-menu')) return
      setIsToolsMenuOpen(false)
    }

    function closeToolsOnEscape(event) {
      if (event.key === 'Escape') setIsToolsMenuOpen(false)
    }

    document.addEventListener('click', closeToolsOnOutsideInteraction)
    document.addEventListener('keydown', closeToolsOnEscape)
    return () => {
      document.removeEventListener('click', closeToolsOnOutsideInteraction)
      document.removeEventListener('keydown', closeToolsOnEscape)
    }
  }, [isToolsMenuOpen])

  useEffect(() => {
    apiRequest('/api/auth/me')
      .then((data) => {
        setCurrentUser(data)
        if (
          data?.is_authenticated &&
          (data?.onboarding_prompt_pending || !data?.profile_complete) &&
          !data?.onboarding_prompt_dismissed &&
          window.location.pathname !== ROUTES.profileEdit &&
          window.location.pathname !== ROUTES.login
        ) {
          navigate(`${ROUTES.adminApplications}?tab=contributions&welcome=onboarding`)
        }
      })
      .catch(() => setCurrentUser({ is_authenticated: false }))
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    apiRequest('/api/site-content')
      .then((payload) => setSiteContent(normalizeSiteContent(payload)))
      .catch(() => setSiteContent(DEFAULT_SITE_CONTENT))
      .finally(() => setSiteContentLoaded(true))
  }, [])

  const isHome = pathname === ROUTES.home
  const isLogin = pathname === ROUTES.login
  const isDictionaryView = pathname === ROUTES.dictionaryView
  const isFolkloreView = pathname === ROUTES.folkloreView
  const apiBase = import.meta.env.VITE_API_BASE || ''
  const adminHref = `${apiBase}/admin/`
  const userGroups = currentUser.groups || []
  const isAdminUser = currentUser.is_superuser || userGroups.includes('Admin')
  const isConsultantUser = userGroups.includes('Consultant')
  const isReviewerUser = userGroups.includes('Reviewer')
  const isContributorUser = userGroups.includes('Contributor')
  const canUseContributorTools = isAdminUser || isReviewerUser || isConsultantUser || isContributorUser
  const canUseReviewerTools = isAdminUser || isReviewerUser || isConsultantUser
  const canOpenAdmin = currentUser.is_authenticated && isAdminUser
  const isMaintenanceMode =
    authChecked && siteContentLoaded && siteContent.maintenance_enabled && !isAdminUser && !isLogin

  useEffect(() => {
    let frameId = 0

    function scheduleBrandVisibility(value) {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => setHideHomeBrandText(value))
    }

    if (isDictionaryView || isFolkloreView) {
      scheduleBrandVisibility(true)
      return () => cancelAnimationFrame(frameId)
    }

    if (!isHome) {
      scheduleBrandVisibility(false)
      return () => cancelAnimationFrame(frameId)
    }

    const homeScroller = document.querySelector('.home-seamless')
    if (!homeScroller) {
      scheduleBrandVisibility(true)
      return () => cancelAnimationFrame(frameId)
    }

    function updateBrandVisibility() {
      const style = window.getComputedStyle(homeScroller)
      const usesPageScroll =
        style.overflowY === 'visible' || homeScroller.scrollHeight <= homeScroller.clientHeight + 1

      if (usesPageScroll) {
        const homeTop = homeScroller.getBoundingClientRect().top + window.scrollY
        const scrollWithinHome = Math.max(0, window.scrollY - homeTop)
        scheduleBrandVisibility(scrollWithinHome < window.innerHeight * 0.5)
        return
      }

      scheduleBrandVisibility(homeScroller.scrollTop < homeScroller.clientHeight * 0.5)
    }

    updateBrandVisibility()
    homeScroller.addEventListener('scroll', updateBrandVisibility, { passive: true })
    window.addEventListener('scroll', updateBrandVisibility, { passive: true })
    window.addEventListener('resize', updateBrandVisibility)

    return () => {
      cancelAnimationFrame(frameId)
      homeScroller.removeEventListener('scroll', updateBrandVisibility)
      window.removeEventListener('scroll', updateBrandVisibility)
      window.removeEventListener('resize', updateBrandVisibility)
    }
  }, [isDictionaryView, isFolkloreView, isHome])

  function activeClass(route) {
    return pathname === route ? 'top-link-button active' : 'top-link-button'
  }

  function activeProps(route) {
    return pathname === route ? { 'aria-current': 'page' } : {}
  }

  function closeMenusAndNavigate(route) {
    setIsMobileMenuOpen(false)
    setIsToolsMenuOpen(false)
    navigate(route)
  }

  async function handleLogout() {
    setIsToolsMenuOpen(false)
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
          <button
            className="brand-wrap brand-home-button"
            onClick={() => {
              closeMenusAndNavigate(ROUTES.home)
            }}
          >
            <img
              className={isHome && hideHomeBrandText ? 'site-logo site-logo-hidden' : 'site-logo'}
              src={siteContent.brand_logo_url || brandLogo}
              alt={`${siteContent.brand_name} logo`}
            />
            <div className={hideHomeBrandText ? 'brand-text brand-text-hidden' : 'brand-text'}>
              <p className="brand">{siteContent.brand_name}</p>
            </div>
          </button>
          <button
            className={isMobileMenuOpen ? 'mobile-menu-button mobile-menu-button-open' : 'mobile-menu-button'}
            type="button"
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-controls="top-navigation"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((current) => !current)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
          <nav
            id="top-navigation"
            className={isMobileMenuOpen ? 'top-links top-links-open' : 'top-links'}
            aria-label="Visitor navigation"
            onClick={(event) => {
              if (event.target.closest('summary')) return
              if (event.target.closest('.notification-bell')) return
              if (event.target.closest('button, a')) setIsMobileMenuOpen(false)
            }}
          >
            <button
              className={activeClass(ROUTES.about)}
              {...activeProps(ROUTES.about)}
              onClick={() => navigate(ROUTES.about)}
            >
              About the Project
            </button>
            <button
              className={activeClass(ROUTES.yaru)}
              {...activeProps(ROUTES.yaru)}
              onClick={() => navigate(ROUTES.yaru)}
            >
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
              Hall of Stewards
            </button>
            {currentUser.is_authenticated ? (
              <>
                <details
                  className="top-tools-menu"
                  open={isToolsMenuOpen}
                  onToggle={(event) => setIsToolsMenuOpen(event.currentTarget.open)}
                >
                  <summary>Workspace</summary>
                  <div className="top-tools-panel">
                    <div className="top-tools-section">
                      <p>Personal</p>
                      <button
                        className="top-link-button"
                        onClick={() => {
                          closeMenusAndNavigate(
                            `${ROUTES.profileView}?username=${encodeURIComponent(currentUser.username)}`,
                          )
                        }}
                      >
                        My Profile
                      </button>
                    </div>
                    {canUseContributorTools && (
                      <div className="top-tools-section">
                        <p>
                          {isAdminUser
                            ? 'Admin Workspace'
                            : canUseReviewerTools
                              ? 'Review & Contribute'
                              : 'Contribute'}
                        </p>
                        <button
                          className="top-link-button top-tools-parent-link"
                          onClick={() =>
                            closeMenusAndNavigate(
                              isAdminUser
                                ? `${ROUTES.adminApplications}?tab=overview`
                                : ROUTES.adminApplications,
                            )
                          }
                        >
                          {isAdminUser ? 'Admin Dashboard' : "Steward's Desk"}
                        </button>
                        <div
                          className="top-tools-subsection"
                          aria-label={isAdminUser ? 'Admin workspace sections' : "Steward's Desk sections"}
                        >
                          {isAdminUser ? (
                            <>
                              <button
                                className="top-link-button"
                                onClick={() =>
                                  closeMenusAndNavigate(`${ROUTES.adminApplications}?tab=overview`)
                                }
                              >
                                Overview
                              </button>
                              <button
                                className="top-link-button"
                                onClick={() =>
                                  closeMenusAndNavigate(`${ROUTES.adminApplications}?tab=reviews`)
                                }
                              >
                                Reviews
                              </button>
                              <button
                                className="top-link-button"
                                onClick={() =>
                                  closeMenusAndNavigate(`${ROUTES.adminApplications}?tab=applications`)
                                }
                              >
                                Role Applications
                              </button>
                              <button
                                className="top-link-button"
                                onClick={() =>
                                  closeMenusAndNavigate(`${ROUTES.adminApplications}?tab=people`)
                                }
                              >
                                People & Accounts
                              </button>
                              <button
                                className="top-link-button"
                                onClick={() =>
                                  closeMenusAndNavigate(`${ROUTES.adminApplications}?tab=archive`)
                                }
                              >
                                Entry Archive
                              </button>
                              <button
                                className="top-link-button"
                                onClick={() => closeMenusAndNavigate(`${ROUTES.adminApplications}?tab=site`)}
                              >
                                Site Content
                              </button>
                              <button
                                className="top-link-button"
                                onClick={() =>
                                  closeMenusAndNavigate(`${ROUTES.adminApplications}?tab=contributions`)
                                }
                              >
                                Contributions
                              </button>
                            </>
                          ) : (
                            canUseReviewerTools && (
                              <>
                                <button
                                  className="top-link-button"
                                  onClick={() =>
                                    closeMenusAndNavigate(`${ROUTES.adminApplications}?tab=reviews`)
                                  }
                                >
                                  Reviews
                                </button>
                                <button
                                  className="top-link-button"
                                  onClick={() =>
                                    closeMenusAndNavigate(`${ROUTES.adminApplications}?tab=applications`)
                                  }
                                >
                                  Applications
                                </button>
                              </>
                            )
                          )}
                          <button
                            className="top-link-button"
                            onClick={() => closeMenusAndNavigate(ROUTES.dictionaryDraft)}
                          >
                            Add New Dictionary Entry
                          </button>
                          <button
                            className="top-link-button"
                            onClick={() => closeMenusAndNavigate(ROUTES.folkloreDraft)}
                          >
                            Add New Folklore Entry
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="top-tools-section">
                      <p>Help</p>
                      <button className="top-link-button" onClick={() => closeMenusAndNavigate(ROUTES.faqs)}>
                        FAQs
                      </button>
                      {canOpenAdmin && (
                        <a
                          className="top-admin-link"
                          href={adminHref}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setIsToolsMenuOpen(false)}
                        >
                          Django Admin Console
                        </a>
                      )}
                    </div>
                  </div>
                </details>
                <NotificationBell currentUser={currentUser} />
              </>
            ) : (
              <>
                <button
                  className={activeClass(ROUTES.faqs)}
                  {...activeProps(ROUTES.faqs)}
                  onClick={() => navigate(ROUTES.faqs)}
                >
                  FAQs
                </button>
              </>
            )}
            {currentUser.is_authenticated ? (
              <button className="pill-link top-pill-button" onClick={handleLogout}>
                Log Out
              </button>
            ) : (
              <button className="pill-link top-pill-button" onClick={() => navigate(ROUTES.login)}>
                Log In
              </button>
            )}
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        className={
          isMaintenanceMode
            ? 'app-shell'
            : isHome || isLogin
              ? 'app-shell app-shell-home'
              : isDictionaryView || isFolkloreView
                ? 'app-shell app-shell-dictionary'
                : 'app-shell'
        }
      >
        {isMaintenanceMode ? (
          <MaintenancePage
            message={siteContent.maintenance_message}
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        ) : (
          <>
            {pathname === ROUTES.home && <HomePage currentUser={currentUser} />}
            {pathname === ROUTES.login && (
              <LoginPage currentUser={currentUser} onAuthChange={setCurrentUser} />
            )}
            {pathname === ROUTES.about && <AboutProjectPage />}
            {pathname === ROUTES.yaru && <YaruPage currentUser={currentUser} />}
            {(pathname === ROUTES.faqs || pathname === ROUTES.manual) && (
              <FaqPage currentUser={currentUser} />
            )}
            {pathname === ROUTES.adminApplications && (
              <AdminApplicationsPage currentUser={currentUser} onAuthChange={setCurrentUser} />
            )}
            {pathname === ROUTES.dictionaryView && <DictionaryViewerPage currentUser={currentUser} />}
            {pathname === ROUTES.dictionaryDraft && <DictionaryDraftBuilderPage />}
            {pathname === ROUTES.folkloreView && <FolkloreViewerPage currentUser={currentUser} />}
            {pathname === ROUTES.folkloreDraft && <FolkloreDraftBuilderPage />}
            {pathname === ROUTES.profileView && <PublicProfilePage currentUser={currentUser} />}
            {pathname === ROUTES.profileEdit && (
              <ProfileEditPage currentUser={currentUser} onAuthChange={setCurrentUser} />
            )}
            {pathname === ROUTES.leaderboards && <LeaderboardPage currentUser={currentUser} />}
            {pathname === ROUTES.roleCenter && <RoleCenterPage currentUser={currentUser} />}
          </>
        )}
      </main>
      {!isHome && !isLogin && !isMaintenanceMode && (
        <footer className="site-footer">
          <div className="site-footer-inner">
            <span className="site-footer-left">{siteContent.footer_left_text}</span>
            <span className="site-footer-center">
              <em>{siteContent.footer_center_text}</em>
            </span>
            <span className="site-footer-right">{siteContent.footer_right_text}</span>
            <span className="site-footer-mobile">
              {[siteContent.footer_left_text, siteContent.footer_center_text, siteContent.footer_right_text]
                .filter(Boolean)
                .join(' ')}
            </span>
          </div>
        </footer>
      )}
    </div>
  )
}

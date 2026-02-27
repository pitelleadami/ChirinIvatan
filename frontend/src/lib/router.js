export const ROUTES = {
  home: '/',
  dashboard: '/dashboard',
  dictionaryView: '/dictionary-view',
  folkloreView: '/folklore-view',
  folkloreDraft: '/folklore-draft',
  profileView: '/profile-view',
  leaderboards: '/leaderboards',
  roleCenter: '/roles',
}

// Only these routes are considered valid app pages.
const ALLOWED = new Set(Object.values(ROUTES))

export function normalizePath(pathname) {
  // Guards against unknown URLs; unknown paths fall back to home.
  return ALLOWED.has(pathname) ? pathname : ROUTES.home
}

export function navigate(to) {
  // Lightweight client navigation without adding a full routing library.
  window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

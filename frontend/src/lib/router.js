export const ROUTES = {
  home: '/',
  login: '/login',
  about: '/about',
  yaru: '/yaru',
  faqs: '/faqs',
  manual: '/manual',
  dashboard: '/dashboard',
  adminApplications: '/admin-applications',
  dictionaryView: '/dictionary-view',
  dictionaryDraft: '/dictionary-draft',
  folkloreView: '/folklore-view',
  folkloreDraft: '/folklore-draft',
  profileView: '/profile-view',
  profileEdit: '/profile-edit',
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

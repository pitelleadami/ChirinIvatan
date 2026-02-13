export const ROUTES = {
  home: '/',
  dashboard: '/dashboard',
  dictionaryView: '/dictionary-view',
  folkloreView: '/folklore-view',
  folkloreDraft: '/folklore-draft',
}

const ALLOWED = new Set(Object.values(ROUTES))

export function normalizePath(pathname) {
  return ALLOWED.has(pathname) ? pathname : ROUTES.home
}

export function navigate(to) {
  window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

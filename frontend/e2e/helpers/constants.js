// Shared constants for the E2E suite. Must match backend
// `manage.py seed_e2e_testdata` (users/management/commands/seed_e2e_testdata.py).

export const PASSWORD = 'e2e-test-pass-1234'

export const ACCOUNTS = {
  contributor: { username: 'e2e_contributor', password: PASSWORD },
  reviewer1: { username: 'e2e_reviewer1', password: PASSWORD },
  reviewer2: { username: 'e2e_reviewer2', password: PASSWORD },
  admin: { username: 'e2e_admin', password: PASSWORD },
}

// Pending submissions seeded for the reviewer quorum flows.
export const PENDING_TERM = 'e2e_pending_term'
export const PENDING_FOLKLORE_TITLE = 'e2e_pending_folklore'

// A deterministic published dictionary entry the visitor tests search for.
export const PUBLISHED_TERM = 'Ekspublistest'
export const PUBLISHED_MEANING = 'A seeded published dictionary entry for end-to-end tests.'

export const ROUTES = {
  home: '/',
  login: '/login',
  dictionaryView: '/dictionary-view',
  dictionaryDraft: '/dictionary-draft',
  folkloreView: '/folklore-view',
  reviewerDashboard: '/admin-applications?tab=reviews',
}

// Per-role saved session state written by auth.setup.js.
export const storageStateFor = (role) => `e2e/.auth/${role}.json`

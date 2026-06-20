# Post-Beta Planned Mini-Features

Use this file to track larger follow-up improvements that should be planned rather than mixed into quick beta cleanup.

When an item is fully implemented, deployed, and verified, remove it from this file.

Last reviewed: 2026-06-13

## Planned Later

- [ ] Replace or rework the Accuracy Champion badge image so it has stronger contrast and remains readable on light backgrounds.

## Completed

- [x] Merge the standalone Reviewer Dashboard into Steward's Desk and redirect the old reviewer dashboard route to the review section. (`/reviewer-dashboard` → `/admin-applications?tab=reviews` via legacy redirect in `frontend/src/lib/router.js`; ReviewerDashboardPage is now an embedded component within Steward's Desk.)
- [x] New-user onboarding redirect fires on both login and page-load/refresh — users with `onboarding_prompt_pending` are redirected to the welcome flow from `App.jsx` on mount, matching the existing login-path behaviour in `LoginPage.jsx`.

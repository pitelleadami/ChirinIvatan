# End-to-End Tests (Playwright)

Browser tests for the three core pre-launch workflows:

| Spec                  | Workflow                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `visitor.spec.js`     | Anonymous public user browses the dictionary/folklore, searches for and opens an entry, and is confirmed unauthenticated.                              |
| `contributor.spec.js` | Logged-in contributor submits a new **dictionary** entry for review via the real form.                                                                 |
| `folklore.spec.js`    | Contributor submits a new **folklore** entry (incl. the rich-text editor); two reviewers reach quorum and the folklore entry is published.             |
| `reviewer.spec.js`    | Two distinct reviewers approve the same **dictionary** submission to meet the **quorum of two**, then the entry is published and visible to a visitor. |

## Viewports (projects)

| Project                   | Runs                      | Why                                                                                         |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| `chromium`                | All specs (desktop)       | Full coverage incl. reviewer modal flows.                                                   |
| `mobile-chrome` (Pixel 7) | `visitor` + `contributor` | The flows real beta testers do on a phone. Reviewer/folklore modal flows stay desktop-only. |

Run one project: `./node_modules/.bin/playwright test --project=mobile-chrome`

## Safety

- **Local only.** `baseURL` is hard-locked to `http://localhost:5173`. The suite
  drives the local Django `runserver` + Vite against the local `db.sqlite3`.
  It cannot reach production.
- **Throwaway accounts only.** All logins use `e2e_*` accounts created by
  `backend/users/management/commands/seed_e2e_testdata.py`. Your real local
  accounts are never touched.
- **Production guard.** The seed command aborts unless the DB is SQLite _and_
  `DEBUG=True`, so it can never run against the Postgres production DB.

## Run

From `frontend/`:

```bash
npm run e2e            # headless, all specs
npm run e2e:ui         # interactive UI mode
npm run e2e:report     # open last HTML report
./node_modules/.bin/playwright test reviewer --project=chromium   # one spec
```

What happens automatically on each run:

1. `globalSetup` runs `manage.py seed_e2e_testdata` (resets accounts, fresh
   PENDING dictionary + folklore submissions for the reviewer flows, and one
   already-published dictionary entry the visitor search test relies on).
2. `webServer` boots the Django backend (`:8000`) and Vite (`:5173`) if they
   aren't already running. It reuses your running servers if present.
3. The `setup` project logs each role in via the CSRF + session API and saves a
   reusable session to `e2e/.auth/<role>.json`.

## Notes

- **Turnstile:** the config injects Cloudflare's always-pass sandbox keys, so
  the widget never blocks automation. (Login itself does not use Turnstile.)
- The contributor spec creates a uniquely-named entry (`e2e_ui_<timestamp>`)
  each run; these accumulate as harmless pending revisions in the local DB.
- Artifacts (`.auth/`, `.report/`, `.shots/`, `test-results/`) are gitignored.
- Prerequisite (first time only): `npx playwright install chromium chromium-headless-shell`.

## If you ever point this at a live/staging host

Only run **harmless, read-only** specs there (visitor browsing, login,
redirects, button visibility). Do **not** run `contributor.spec.js` or
`reviewer.spec.js` against live data — they create and publish content.

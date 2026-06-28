# Changelog

Plain-language record of visible product changes, workflow decisions, and public-facing fixes.

This file is reconstructed from Git history, project specs, deployment notes, and recent implementation work. It is not a full commit log. Use Git history for exact file-level changes.

## 2026-06-28

### Review And Re-Review Governance

- Clarified and enforced that one rejection on an initial pending submission returns
  the revision to the contributor as rejected/Needs Changes.
- Tightened reviewer queues so reviewers/admins see eligible items in newest-first
  order, excluding their own submissions and items they already reviewed in the
  current round.
- Hid stale quorum rows once a revision has already received a rejection in the
  active initial review round.
- Fixed Return for Fixing in re-review so the selected approved snapshot and
  assigned contributor are sent correctly.

### Accounts And Onboarding

- Added duplicate role-application handling for reused email/application cases,
  with guidance to check activation email, wait for review, or log in if already
  activated.
- Improved profile suffix/credentials handling so names do not duplicate when a
  user enters their name again in the suffix field.

### Public Counts, Resources, And Sharing

- Standardized public live-entry totals across home, dictionary, and leaderboard
  views.
- Moved learning resources into Steward's Desk instead of the public top bar.
- Added admin-managed resource documents with title, description, category, file,
  publication status, and role-based visibility.
- Improved mobile recognition image export and caption-copy behavior.

## 2026-06-22

### Admin Account Follow-Up

- Added an admin-only resend setup link flow for approved applicants who have not completed account activation.
- Marked approved but unclaimed applicants in the People profile modal as `Approved, not joined`.
- Added an admin-only email log in the People profile modal, hidden behind a `View email log` button, showing setup reminders and password reset messages sent to the selected person.
- Recorded setup reminder sends as admin account actions alongside password reset sends, so email follow-up remains auditable.

## 2026-06-19

### Security

- Changed backend security defaults so `DJANGO_DEBUG` defaults to `False`.
- Removed the production-capable committed fallback secret key behavior. `DJANGO_SECRET_KEY` is now required whenever debug is not true.
- Documented the fail-closed behavior in deployment docs and ADR-0010.

### Engineering Practice

- Added GitHub Actions continuous integration for backend tests, frontend lint/build, and Playwright e2e.
- Standardized backend dependency installs on the root `requirements.txt` so CI and deployment use the same pinned package list.
- Made Playwright's Python binary configurable with `E2E_PYTHON` so e2e tests can run both locally and in GitHub Actions.
- Added PR-based contribution workflow documentation, a pull request template, and branch protection setup notes.
- Documented the decision to protect `main` through pull requests and CI in ADR-0012.
- Enabled and verified GitHub branch protection for `main` with required CI checks, one approval, stale-review dismissal, conversation resolution, admin enforcement, and no force-push/deletion access.
- Added automated PostgreSQL plus media backup scripts, systemd timer templates, a restore smoke test, and a backup/restore runbook.
- Documented the decision to treat tested application data backups as required preservation infrastructure in ADR-0013.

### Dictionary

- Added dictionary variant type labels:
  - `Borrowed Form`
  - `Newly Coined Term / Expression`
- Kept existing variant labels:
  - `Ivatan (Common Usage)`
  - `Isamurungen`
  - `Ivasayen`
  - `Itbayaten`
  - `Old / Historical Form`
- Updated contributor guide text and rebuild specification with the current variant type list.
- Adjusted the Word of the Day card so long headwords wrap inside the panel instead of overflowing.
- Latest approved terms are intended to show mother terms only; connected variants remain visible inside the selected term page.

### Navigation

- Improved dictionary and folklore detail-page navigation so detail views keep a clean back-to-collection flow.
- Added deterministic in-page back behavior so users do not have to rely only on browser history.

### Review Stability

- Hardened review preview rendering so unusual object or array field values do not blank the page.
- Improved revision preview behavior for previously rejected/resubmitted entries.

### Live Deploys

- Frontend deployment backups created during this work include:
  - `20260619-010333`
  - `20260619-011725`
  - `20260619-021907`

## 2026-06-18

### Public Launch Readiness

- Removed beta-lock dependency from ordinary public participation workflows so contributors and reviewers can begin joining and submitting.
- Restored admin visibility for controlling beta/public access settings.
- Added Google Analytics measurement ID support for public site tracking.
- Changed public wording from "partners" to "supporting organizations."
- Tuned Supporting Organizations logo sizing and spacing.

### Contributor And Reviewer Workflows

- Confirmed returned/rejected submissions should appear in Needs Changes.
- Set contributor contribution tabs to use this priority when auto-opening: Needs Changes, Drafts, Approved, Submitted for Review.
- Adjusted contribution panel layout and Add Entry placement.
- Removed the separate Published Entries panel from contributor workspace to reduce duplication.
- Made review queue cards more deliberate: reviewers open the full preview before approve/reject actions.
- Styled contribution/review stats consistently across tabs.

### Dictionary And Folklore Forms

- Required dictionary headword before saving a draft.
- Required folklore title before saving a draft.
- Added media ownership/license capture with `CC BY-NC 4.0` as the platform default when contributors own or produce uploaded media and do not choose another license.
- Removed redundant image optimization messaging from contributor forms.
- Improved dictionary variant form layout, including pronunciation text and phonetic notation fields.
- Split synonyms and antonyms into cleaner rows.

### User Accounts And Profile Data

- Normalized usernames to lowercase.
- Added clearer handling for accounts that previously had capitalized usernames.
- Added capitalization normalization for person names and affiliation text.
- Added sentence normalization rules for all-caps submitted sentence fields and missing final punctuation.
- Continued onboarding checks after account activation so new users can complete or skip profile setup.

### Public Pages

- Made folklore list cards clickable with previews instead of relying on a separate Read Entry button.
- Improved mobile layout for folklore detail pages, metadata panels, community voices, and action links.
- Added pagination to long contribution and invitation lists.
- Improved badge spacing and mobile badge layout.

## 2026-06-14 to 2026-06-17

### Beta And Production Preparation

- Prepared beta tester packet and bug log template.
- Added production deployment checklist and runbook.
- Added manual QA checklist and QA worksheet.
- Added defense architecture diagrams and updated rebuild specification.
- Prepared public site pages, mobile layouts, and contributor/reviewer workspace polish.

## Earlier Build History

### Governance And Review Lifecycle

- Implemented revision-first workflows for dictionary and folklore entries.
- Added draft, pending, approved, rejected/needs changes, and re-review states.
- Added two-reviewer approval quorum for publication workflows.
- Added re-review/flagging workflows for already approved public entries.
- Added revision retention and original approved snapshot behavior.

### Dictionary

- Implemented dictionary entries, revisions, variant groups, mother terms, connected variants, and variant-specific display.
- Separated semantic core fields from variant-specific fields.
- Added public dictionary browsing, search, latest approved terms, English lookup, and term detail pages.

### Folklore

- Implemented folklore entries, revisions, taxonomy, alternate versions, media support, and community comments.
- Added public folklore browsing by category and entry detail pages.

### People And Roles

- Implemented contributor, reviewer, consultant, and admin roles.
- Added role applications, invitations, onboarding records, and account activation.
- Added steward/admin workspace for reviews, applications, people, archive, site content, and contributions.

### Recognition And Accountability

- Added public profiles, contribution history, reviewer/contributor badges, leaderboard controls, and activity logs.
- Added notifications for key role and contribution events.

# SPEC-03 Manual QA Checklist (Site-First)

This version is optimized for browser/site QA.  
Use Postman only if you want extra API-only checks.

Companion execution table:

- `docs/SPEC-03_QA_EXECUTION_SHEET.md`
  Simple editable worksheet (no table):
- `docs/SPEC-03_QA_WORKSHEET_EDITABLE.md`

---

## 1) Setup

1. Open backend root:
   - `cd /Users/admin/Documents/GitHub/ChirinIvatan/backend`
2. Start server:
   - `python3 manage.py runserver`
3. Confirm users exist:
   - contributor account
   - reviewer account (`Reviewer` group)
   - admin account (`Admin` group or superuser)
4. Keep one browser for user pages and one for `/admin/`.

---

## 2) Baseline Health

1. Run migrations:
   - `python3 manage.py migrate`
2. Run tests:
   - `python3 manage.py test users reviews dictionary folklore`
3. Expected:
   - no migration errors
   - tests pass

---

## 3) Browser-Only Access Checks

1. While logged out, open:
   - `http://127.0.0.1:8000/api/reviews/dashboard`
2. Expected:
   - JSON with `{"detail":"Authentication required."}` and HTTP 401
3. Log in as reviewer, open same URL.
4. Expected:
   - HTTP 200 JSON
   - keys: `dictionary`, `folklore`, `reviews`
5. Log in as a non-reviewer/non-admin account and open same URL.
6. Expected:
   - HTTP 403 with reviewer/admin access error

---

## 4) Dictionary QA from Site/Admin

## A. Contributor Dictionary Draft Builder

1. Open frontend dictionary contributor page:
   - `http://127.0.0.1:5174/dictionary-draft`
2. Create a new draft with:
   - term
   - meaning
   - part_of_speech
   - optional variant/source/example fields
3. Expected:
   - draft created successfully
   - revision ID displayed
4. Update the same draft.
5. Expected:
   - latest field values persist
6. Submit the draft.
7. Expected:
   - status transitions from `draft` to `pending`
8. Start a revision from an existing approved entry ID.
9. Expected:
   - current approved entry values prefill into a new draft revision
10. For `inflected_forms`, enter invalid JSON and submit/update.
11. Expected:

- controlled validation error

## B. Admin Form Field Exposure

1. Open admin:
   - `http://127.0.0.1:8000/admin/`
2. Go to Dictionary -> Entry revisions -> open a revision.
3. Expected:
   - Real fields are visible (not only raw `proposed_data`):
     - term, meaning, part_of_speech
     - pronunciation/audio fields
     - variant/source fields
     - synonyms/antonyms
     - inflected_forms
     - photo fields

## C. Approval/Rejection Actions

1. In Dictionary -> Entry revisions list, select a `pending` revision.
2. Run action `Approve selected revisions`.
3. Expected:
   - revision transitions to `approved` once quorum is met
   - entry is published/updated
4. Select another `pending` revision and run `Reject selected revisions`.
5. Expected:
   - revision becomes `rejected`

## D. Public Entry View Behavior

1. Open:
   - `http://127.0.0.1:8000/api/dictionary/entries/<entry_uuid>`
2. Expected:
   - `header`, `semantic_core`, `variant_section`, `connected_variants`, `contributors`, `attribution`, `revision_history`
3. Verify masking:
   - self-knowledge term source hidden
   - self-recorded audio source hidden
   - contributor-owned photo source hidden
4. Verify revision history visibility:
   - public account sees base snapshot + last 5
   - reviewer/admin account sees base snapshot + last 15

---

## 5) Folklore Contributor Flow (Site-Focused)

Use your frontend contributor form if available.  
If frontend is incomplete, use API endpoints from browser network calls.

## A. Required Field Rules

Expected behavior on create/update/submit draft:

1. `title`, `content`, `category`, and `subcategory` are required.
2. `source` required unless self-knowledge is checked.
3. If media exists (URL/photo/audio), `media_source` required unless self-produced is checked.
4. Municipality must be one of:
   - `Basco`, `Mahatao`, `Ivana`, `Uyugan`, `Sabtang`, `Itbayat`, `Not Applicable`
5. If `copyright_usage`
   is left blank, license defaults to `CC BY-NC 4.0` at approval.

## B. Upload Checks

1. Attach photo and submit draft.
2. Expected:
   - accepted and visible in revision payload/detail
   - image is at least `200px x 200px`
3. Attach audio and submit draft.
4. Expected:
   - accepted and visible in revision payload/detail

---

## 6) Folklore Review Flow (Site + Reviewer)

1. Reviewer opens:
   - `http://127.0.0.1:8000/api/reviews/dashboard`
2. Confirm folklore pending submissions appear under:
   - `folklore.pending_submissions`
3. Review decisions expected outcomes:
   - first approve: may remain pending until quorum
   - quorum approve: revision `approved`, entry `approved`
   - flag approved entry from the live Folklore detail page with notes: entry `approved_under_review`
   - Reject/Archive during re-review: entry `archived` and removed from public view
   - Return for Fixing during re-review: assigned correction draft appears in Needs Changes

Note:

- Published entries are not shown as review cards in the Reviews tab.
- Reviewers/admins should not see their own submissions in review queues.

---

## 7) Public Folklore View

1. Open:
   - `http://127.0.0.1:8000/api/folklore/entries`
2. Expected:
   - only `approved` or `approved_under_review` entries listed
3. Open:
   - `http://127.0.0.1:8000/api/folklore/entries/<entry_uuid>`
4. Expected masking:
   - `source` hidden when self-knowledge = true
   - `media_source` hidden when self-produced-media = true
5. As reviewer/admin, confirm eligible approved entries show a flag-for-re-review action that requires notes.
6. Confirm the browser URL updates to `?entry_id=<uuid>` when an entry detail is opened, and clears when closed. Confirm the URL can be shared/bookmarked.

---

## 7A) Folklore Revision Ownership

1. Log in as the **original contributor** of a published folklore entry.
2. Open the entry detail. Expected: "Revise this entry" button is visible.
3. Click "Revise this entry". Expected: redirected to draft builder pre-seeded with current entry content.
4. Log in as a **different authenticated user** (not the entry owner, not a reviewer).
5. Open the same entry detail. Expected: "Submit an alternate version" button is visible; "Revise this entry" is NOT visible.
6. Attempt `POST /api/folklore/entries/<id>/revisions/start` as the non-owner directly. Expected: HTTP 403.
7. Log in as an **Admin**. Expected: "Revise this entry" is visible and functional for any entry.
8. Log in as a **Reviewer** who does NOT own the entry. Expected: "Submit an alternate version" visible; "Revise this entry" NOT visible.
9. Log in as a **Reviewer** who IS the original contributor. Expected: "Revise this entry" visible.

---

## 7B) Alternate Versions (Variants)

1. As a non-owner authenticated user, click "Submit an alternate version" on a published entry.
2. Expected: draft builder opens with an **empty form** (not pre-seeded with original entry's content).
3. Fill in the variant and submit for review.
4. As a reviewer, approve the variant through the normal review workflow.
5. After approval, open the original entry. Expected: an "Alternate Versions" section appears listing the approved variant.
6. Click a variant in that section. Expected: detail panel loads the variant's entry.
7. Confirm approved variant entries are independently browsable (appear in the public list).
8. Confirm `variant_of` is recorded on the revision; `alternate_versions` is present in the entry detail API response.

---

## 7C) Community Voices (Comments)

1. Open a published folklore entry as an **unauthenticated visitor**.
2. Expected: "Community Voices" section visible below the 2-column metadata; comment form shows a login nudge instead of the text area.
3. Log in as any authenticated user.
4. Post a comment (up to 2000 chars). Expected: comment appears immediately with author name, avatar/initial, and timestamp.
5. Attempt to post an empty comment. Expected: blocked client-side and/or server returns 400.
6. Attempt to post a comment longer than 2000 characters. Expected: blocked/400.
7. Confirm "Delete" button appears only on the user's own comments.
8. Delete own comment. Expected: removed from the list.
9. Log in as a different user. Attempt to delete another user's comment via `DELETE /api/folklore/comments/<id>/delete`. Expected: HTTP 403.
10. Log in as an **Admin**. Expected: delete button appears on all comments; admin can delete any comment.
11. Confirm the "Community Voices" heading is full-width (not constrained to the 2-column layout), uses the platform heading font (Lora), and is black without uppercase styling.

---

## 8) Governance and Lifecycle Checks

1. In admin, confirm folklore `archived_at` is read-only.
2. Confirm contributor-facing forms do not allow manual `archived_at`.
3. Run maintenance:
   - `python3 manage.py run_lifecycle_maintenance`
4. Expected:
   - lifecycle transitions execute without errors

---

## 9) Admin Site Content and Leaderboard Privacy

1. Log in as an Admin account and open:
   - Steward's Desk -> Site Content
2. Update and save:
   - About page heading and paragraphs
   - Digital Yaru introductory text
   - at least one Statement of Support
   - at least one Partner Detail
   - at least one FAQ section/question with role visibility
   - at least one FAQ image upload or image URL
3. Expected:
   - About and Digital Yaru pages show the saved copy
   - support/partner sections appear only when rows are populated
   - FAQs show admin-saved sections only to selected roles
   - FAQ images render inside answers
   - non-admin users cannot save `/api/site-content`
4. In the same Site Content tab, enable maintenance mode and set a custom visitor message.
5. Open the site in a logged-out/incognito browser.
6. Expected:
   - visitor sees the custom maintenance message
   - visitor can still navigate to admin/login access
   - public API calls return controlled `503`
7. Log in as admin and confirm Steward's Desk remains available.
8. Disable maintenance mode and save.
9. Open a public profile as the profile owner.
10. Confirm the profile owner cannot see or use the leaderboard visibility control.
11. Expected:

- public profile contribution credits remain visible
- profile owners cannot hide or restore leaderboard participation

12. Open a public profile as admin and use the leaderboard visibility action.
13. Expected:

- admin can hide or restore that person's leaderboard participation
- individual leaderboard rows no longer include hidden users

---

## 10) Notifications, Submission Status, Onboarding, and Invitation Email

### A. In-App Notifications

1. Log in as a contributor and submit one dictionary or folklore draft.
2. Expected:
   - no notification is created merely because the submission entered the review queue
3. Approve or reject the submission from a reviewer/admin account.
4. Return to the contributor account or focus its browser window.
5. Expected:
   - final decision notification appears
   - rejection message includes reviewer feedback when supplied
   - linked notification opens the relevant draft or published entry
   - flagging a live entry for re-review creates no notification
   - final re-review approval or rejection creates a notification

### B. My Contributions Status

1. Open Steward's Desk -> Contributions.
2. Check both Dictionary and Folklore columns.
3. Expected:
   - tabs are Needs Changes, Drafts, Approved, and Submitted for Review
   - each tab shows a count
   - cards show a clear status and date
   - rejected cards show reviewer feedback directly
   - assigned correction drafts from Return for Fixing appear under Needs Changes
   - Fix Submission reopens the same rejected private submission
   - reviewer notes appear inside the editor before the editable fields
   - saving and resubmitting updates the same submission rather than creating a public revision

### C. One-Time Welcome

1. Accept a new role invitation and create the invited account.
2. Log in for the first time.
3. Expected:
   - Steward's Desk opens with one welcome screen
   - Complete Profile and role-appropriate next-step actions are available
4. Select Not Now, log out, and log in again.
5. Expected:
   - welcome screen does not reappear
6. With `onboarding_prompt_pending = true` and NOT yet dismissed, close the browser tab and reopen the site directly (without going through login again).
7. Expected:
   - page-load auth check redirects to the welcome flow even without re-logging in
8. Navigate directly to `/reviewer-dashboard`.
9. Expected:
   - silently redirected to `/admin-applications?tab=reviews` with no error

### D. HTML Invitation Email

1. Send an email role invitation using a test mail backend/inbox.
2. Expected:
   - message has a plain-text body
   - message has a branded HTML alternative
   - inviter and role are visible
   - accept button and fallback URL both point to the invitation flow

---

## 11) Final Go/No-Go

Mark GO only if all are true:

1. Baseline tests pass.
2. Role-based access responses are correct (401/403/200).
3. Dictionary contributor draft flow works (create/start-edit/update/submit).
4. Dictionary and folklore approval/rejection/re-review outcomes match spec.
5. Folklore conditional validation rules behave exactly as expected.
6. Public visibility and masking rules are correct.
7. Revision history limits and audience visibility are correct.
8. Admin-managed site content, maintenance mode, and leaderboard participation settings work.
9. Notification events, unread state, and target navigation work.
10. My Contributions shows all four statuses and rejection feedback.
11. Invitation onboarding appears once and persists dismissal.
12. Invitation email includes both HTML and plain-text versions.

If any check fails, log:

- exact URL or screen
- user role used
- payload/field values entered
- actual vs expected outcome

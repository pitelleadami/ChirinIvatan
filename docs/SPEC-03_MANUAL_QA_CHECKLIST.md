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
   - one reject during re-review: entry `rejected`

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
4. Open a public profile as the profile owner.
5. Confirm the profile owner cannot see or use the leaderboard visibility control.
6. Expected:
   - public profile contribution credits remain visible
   - profile owners cannot hide or restore leaderboard participation
7. Open a public profile as admin and use the leaderboard visibility action.
8. Expected:
   - admin can hide or restore that person's leaderboard participation
   - individual leaderboard rows no longer include hidden users

---

## 10) Final Go/No-Go

Mark GO only if all are true:
1. Baseline tests pass.
2. Role-based access responses are correct (401/403/200).
3. Dictionary contributor draft flow works (create/start-edit/update/submit).
4. Dictionary and folklore approval/rejection/re-review outcomes match spec.
5. Folklore conditional validation rules behave exactly as expected.
6. Public visibility and masking rules are correct.
7. Revision history limits and audience visibility are correct.
8. Admin-managed site content and leaderboard participation settings work.

If any check fails, log:
- exact URL or screen
- user role used
- payload/field values entered
- actual vs expected outcome

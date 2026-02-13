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

## A. Admin Form Field Exposure
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

## B. Approval/Rejection Actions
1. In Dictionary -> Entry revisions list, select a `pending` revision.
2. Run action `Approve selected revisions`.
3. Expected:
   - revision transitions to `approved` once quorum is met
   - entry is published/updated
4. Select another `pending` revision and run `Reject selected revisions`.
5. Expected:
   - revision becomes `rejected`

## C. Public Entry View Behavior
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
1. `title`, `content`, `category` are required.
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
   - flag approved entry: entry `approved_under_review`
   - one reject during re-review: entry `rejected`

Note:
- If your frontend has no review action buttons yet, this is a frontend gap, not necessarily backend logic failure.

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

---

## 8) Governance and Lifecycle Checks

1. In admin, confirm folklore `archived_at` is read-only.
2. Confirm contributor-facing forms do not allow manual `archived_at`.
3. Run maintenance:
   - `python3 manage.py run_lifecycle_maintenance`
4. Expected:
   - lifecycle transitions execute without errors

---

## 9) Final Go/No-Go

Mark GO only if all are true:
1. Baseline tests pass.
2. Role-based access responses are correct (401/403/200).
3. Dictionary and folklore approval/rejection/re-review outcomes match spec.
4. Folklore conditional validation rules behave exactly as expected.
5. Public visibility and masking rules are correct.
6. Revision history limits and audience visibility are correct.

If any check fails, log:
- exact URL or screen
- user role used
- payload/field values entered
- actual vs expected outcome

# SPEC-03 Manual QA Checklist

Purpose: verify end-to-end backend behavior after the SPEC-03 refactor.

Assumptions:
- Backend runs at `http://127.0.0.1:8000`
- You have users for roles: contributor, reviewer, admin
- You can authenticate requests (session or token, depending on your setup)

## 1) Baseline Health

1. Run migrations:
   - `python3 manage.py migrate`
2. Run full tests:
   - `python3 manage.py test users reviews dictionary folklore`
3. Expected:
   - No migration pending
   - Tests pass

## 2) Dictionary Approval Flow

1. Create a dictionary draft revision (new term) as contributor.
2. Submit draft to `PENDING`.
3. Approve as reviewer #1 (should remain pending).
4. Approve as reviewer #2 or admin (should publish).
5. Verify:
   - Entry visible at `GET /api/dictionary/entries/<entry_id>`
   - Revision status is `APPROVED`
   - Entry status is `APPROVED`

## 3) Dictionary Re-Review Flow

1. Flag an approved revision via reviewer.
2. Verify entry moves to `APPROVED_UNDER_REVIEW`.
3. Re-review reject once:
   - Entry should move to `REJECTED`.
4. Repeat with fresh approved entry:
   - Flag again
   - Approve with quorum (2 reviewers or reviewer+admin)
   - Entry returns to `APPROVED`

## 4) Folklore Contributor Revision Flow (Canonical)

1. Create draft revision:
   - `POST /api/folklore/revisions/create`
2. List my revisions:
   - `GET /api/folklore/revisions/my`
3. Edit draft:
   - `PATCH /api/folklore/revisions/<revision_id>`
4. Submit draft:
   - `POST /api/folklore/revisions/<revision_id>/submit`
5. Verify:
   - Revision status transitions `DRAFT -> PENDING`
   - Required fields (`title/content/category/source`) enforced

## 5) Folklore Review Flow

1. Reviewer approves pending folklore revision once:
   - Should remain `PENDING`.
2. Second quorum approval:
   - Revision becomes `APPROVED`
   - Entry is created/published and becomes `APPROVED`
3. Flag approved folklore revision:
   - Entry becomes `APPROVED_UNDER_REVIEW`
4. Re-review reject once:
   - Entry becomes `REJECTED`

## 6) Folklore Review API Compatibility

1. Submit review using canonical payload:
   - `POST /api/reviews/folklore/submit` with `revision_id`
2. Submit review using compatibility payload:
   - same endpoint with `entry_id` only
3. Verify:
   - Request succeeds
   - For `entry_id` fallback, system derives/creates revision safely

## 7) Reviewer Dashboard

1. Open `GET /api/reviews/dashboard` as reviewer.
2. Verify keys include:
   - `pending_submissions`
   - `pending_folklore_submissions` (revision-based)
   - `pending_rereview`
   - `pending_folklore_rereview`
3. Verify filtering:
   - Reviewer does not see items they already reviewed in same round
   - Admin sees full pending list

## 8) Admin Override

1. Put dictionary entry under review, then call:
   - `POST /api/reviews/admin/override` with `target_type=dictionary`
2. Repeat for folklore:
   - same endpoint with `target_type=folklore`
3. Verify:
   - Actions require admin + notes
   - Actions update target state correctly
   - Override record appears in admin audit

## 9) Public Read Surfaces

1. Dictionary detail:
   - `GET /api/dictionary/entries/<entry_id>`
   - Verify semantic core + variant sections + revision history limits
2. Folklore list/detail:
   - `GET /api/folklore/entries`
   - `GET /api/folklore/entries/<entry_id>`
3. Verify visibility:
   - Public only sees `APPROVED` and `APPROVED_UNDER_REVIEW`
   - Source masking works for self flags

## 10) Leaderboard and Profile

1. Check global leaderboard:
   - `GET /leaderboard/global`
2. Check municipality leaderboard:
   - `GET /leaderboard/municipality?municipality=<name>`
3. Check public profile:
   - `GET /api/users/<username>`
4. Verify:
   - Totals follow `dictionary_terms + folklore_entries + revisions`
   - Revision contribution is unique per contributor per entry lifetime

## 11) Lifecycle Maintenance

1. Run:
   - `python3 manage.py run_lifecycle_maintenance`
2. Verify logs include counts for:
   - `dictionary_archived`, `dictionary_deleted`
   - `folklore_archived`, `folklore_deleted`
3. Confirm scheduled execution exists (cron/launchd/systemd).

## 12) Go/No-Go Criteria

Release-ready if all are true:
- Full tests pass locally.
- Dictionary + folklore approval/re-review paths pass manual checks.
- Dashboard and admin override flows pass.
- Public endpoints and attribution masking pass.
- Leaderboard/profile counts remain correct after archive/delete lifecycle actions.

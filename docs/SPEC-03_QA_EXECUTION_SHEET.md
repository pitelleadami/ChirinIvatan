# SPEC-03 QA Execution Sheet (Pass/Fail + Remarks)

Use this sheet while testing so each rule has a clear status and comment trail.

## Legend

- Status values: `PASS`, `FAIL`, `BLOCKED`, `N/A`
- Evidence: screenshot path, response JSON snippet, or admin page note

## Run Metadata

| Field | Value |
|---|---|
| Tester |  |
| Date |  |
| Branch/Commit |  |
| Environment | Local / Staging / Prod-like |
| Backend URL | `http://127.0.0.1:8000` |

## Execution Table

| ID | Area | Scenario | Steps | Expected Outcome | Status | Remarks | Evidence |
|---|---|---|---|---|---|---|---|
| BH-01 | Baseline | Migrations | Run `python3 manage.py migrate` | No migration errors |  |  |  |
| BH-02 | Baseline | Tests | Run `python3 manage.py test users reviews dictionary folklore` | Tests pass |  |  |  |
| AC-01 | Access | Dashboard unauthenticated | Open `/api/reviews/dashboard` while logged out | HTTP 401 JSON auth error |  |  |  |
| AC-02 | Access | Dashboard contributor | Open `/api/reviews/dashboard` as contributor | HTTP 403 |  |  |  |
| AC-03 | Access | Dashboard reviewer/admin | Open `/api/reviews/dashboard` as reviewer/admin | HTTP 200 with `dictionary`, `folklore`, `reviews` keys |  |  |  |
| DI-01 | Dictionary | Admin revision form fields | Open Dictionary revision in admin | Real domain fields visible (not only raw JSON) |  |  |  |
| DI-02 | Dictionary | New revision draft submit | Create dictionary revision draft, submit | `draft -> pending` |  |  |  |
| DI-03 | Dictionary | First approve only | One reviewer approves pending revision | Remains pending until quorum |  |  |  |
| DI-04 | Dictionary | Quorum approve | Second reviewer/admin approves same pending revision | Revision `approved`, entry published `approved` |  |  |  |
| DI-05 | Dictionary | Immediate rejection | Reject a pending dictionary revision with notes | Revision immediately `rejected` |  |  |  |
| DI-06 | Dictionary | Reject without notes | Attempt reject without notes | Validation error / HTTP 400 |  |  |  |
| DI-07 | Dictionary | Flag approved revision | Flag approved dictionary revision | Entry `approved_under_review` |  |  |  |
| DI-08 | Dictionary | Re-review reject | Reject once during re-review | Entry `rejected` |  |  |  |
| DI-09 | Dictionary | Re-review restore by quorum | Approve by quorum in active re-review round | Entry returns `approved` |  |  |  |
| DI-10 | Dictionary | Mother promotion | Approve General/General Ivatan variant in a group | Promotes to mother; previous mother becomes variant |  |  |  |
| DI-11 | Dictionary | Mother fallback | Archive/remove current mother | Earliest approved non-archived variant becomes mother |  |  |  |
| DI-12 | Dictionary | Semantic inheritance | Open variant detail `/api/dictionary/entries/<id>` | `semantic_core` sourced from mother |  |  |  |
| DI-13 | Dictionary | Variant section fidelity | Open variant detail | `variant_section` shows clicked variant-specific fields |  |  |  |
| DI-14 | Dictionary | Attribution masking term | Set self-knowledge term source | Public hides term source |  |  |  |
| DI-15 | Dictionary | Attribution masking audio | Set self-recorded audio | Public hides audio source |  |  |  |
| DI-16 | Dictionary | Attribution masking photo | Set contributor-owned photo | Public hides photo source |  |  |  |
| DI-17 | Dictionary | Public revision window | Open as public | Base snapshot + last 5 approved revisions |  |  |  |
| DI-18 | Dictionary | Staff revision window | Open as reviewer/admin | Base snapshot + last 15 approved revisions |  |  |  |
| DI-19 | Dictionary | Media constraints | Replace audio/photo through revision | Only one active audio/photo; previous preserved in history |  |  |  |
| FO-01 | Folklore | Draft create required fields | Create draft missing title/content/category | Validation error |  |  |  |
| FO-02 | Folklore | Conditional source required | `self_knowledge=false` and empty source | Validation error |  |  |  |
| FO-03 | Folklore | Conditional source bypass | `self_knowledge=true` and empty source | Accepted |  |  |  |
| FO-04 | Folklore | Conditional media source required | Media present + `self_produced_media=false` + empty media_source | Validation error |  |  |  |
| FO-05 | Folklore | Conditional media source bypass | Media present + `self_produced_media=true` + empty media_source | Accepted |  |  |  |
| FO-06 | Folklore | Municipality validation | Submit invalid municipality value | Validation error / HTTP 400 |  |  |  |
| FO-07 | Folklore | Municipality allowed list | Test each allowed value | All accepted |  |  |  |
| FO-08 | Folklore | Photo upload | Upload `photo_upload` in create/update | Accepted and returned in detail/revision |  |  |  |
| FO-09 | Folklore | Audio upload | Upload `audio_upload` in create/update | Accepted and returned in detail/revision |  |  |  |
| FO-10 | Folklore | YouTube/media URL | Save YouTube link in `media_url` | URL stored and returned |  |  |  |
| FO-11 | Folklore | Submit draft | Submit valid folklore draft | Revision `draft -> pending` |  |  |  |
| FO-12 | Folklore | First approval only | First approve on pending folklore revision | May remain pending until quorum |  |  |  |
| FO-13 | Folklore | Quorum approval | Quorum approve folklore pending revision | Revision `approved`, entry `approved` |  |  |  |
| FO-14 | Folklore | Flag approved folklore | Flag approved folklore revision | Entry `approved_under_review` |  |  |  |
| FO-15 | Folklore | Re-review reject | Reject once in folklore re-review | Entry `rejected` |  |  |  |
| FO-16 | Folklore | License default | Approve with empty `copyright_usage` | Auto-sets `CC BY-NC 4.0` |  |  |  |
| FO-17 | Folklore | License immutability | Edit approved entry license directly | Blocked; must use revision |  |  |  |
| FO-18 | Folklore | Public list visibility | Open `/api/folklore/entries` | Only `approved` + `approved_under_review` rows |  |  |  |
| FO-19 | Folklore | Public source masking | Open folklore detail for self-knowledge record | `source` hidden |  |  |  |
| FO-20 | Folklore | Public media source masking | Open folklore detail for self-produced media | `media_source` hidden |  |  |  |
| RV-01 | Reviews | Duplicate review prevention | Same reviewer reviews same revision/round twice | Validation error |  |  |  |
| RV-02 | Reviews | Self-review prevention | Contributor attempts reviewing own revision | Validation error |  |  |  |
| RV-03 | Reviews | Invalid UUID handling | Submit review with invalid UUID | HTTP 400 JSON error (not 500) |  |  |  |
| RV-04 | Reviews | Admin override force reject | Override entry under re-review with `force_reject` | Entry moves to `rejected` |  |  |  |
| RV-05 | Reviews | Admin override restore | Override entry under re-review with `restore_approved` | Entry moves to `approved` |  |  |  |
| RV-06 | Reviews | Admin override archive | Override entry under re-review with `archive` | Entry moves to `archived` |  |  |  |
| RV-07 | Reviews | Override authorization | Non-admin calls override endpoint | HTTP 403 |  |  |  |
| CT-01 | Contributions | Dictionary original contribution | First approved mother term | `dictionary_term` event awarded once |  |  |  |
| CT-02 | Contributions | Folklore original contribution | First approved folklore entry | `folklore_entry` event awarded once |  |  |  |
| CT-03 | Contributions | Revision uniqueness | Same user approves multiple revisions on same entry | Revision count increments only once per entry |  |  |  |
| CT-04 | Contributions | Historical persistence | Archive/delete/re-review reject after prior awards | Contribution totals remain unchanged |  |  |  |
| LC-01 | Lifecycle | Archived field control | Contributor UI and APIs | `archived_at` not user-editable |  |  |  |
| LC-02 | Lifecycle | Admin read-only visibility | Folklore admin form | `archived_at` read-only |  |  |  |
| LC-03 | Lifecycle maintenance command | Run `python3 manage.py run_lifecycle_maintenance` | Command runs without errors |  |  |  |

## Summary

| Metric | Count |
|---|---|
| Total Cases | 63 |
| Pass |  |
| Fail |  |
| Blocked |  |
| N/A |  |

## Sign-Off

| Role | Name | Date | Decision | Notes |
|---|---|---|---|---|
| QA Tester |  |  | GO / NO-GO |  |
| Reviewer |  |  | GO / NO-GO |  |
| Admin/Product Owner |  |  | GO / NO-GO |  |

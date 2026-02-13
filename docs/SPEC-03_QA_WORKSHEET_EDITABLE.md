# SPEC-03 QA Worksheet (Editable, No Table)

Use this when the table format is hard to manage.  
Fill each item with:
- `Status:` `PASS` / `FAIL` / `BLOCKED` / `N/A`
- `Remarks:` your notes
- `Evidence:` screenshot path, URL, JSON snippet, or admin page note

---

## Coverage and Confidence

This worksheet is comprehensive for SPEC-03 backend behavior:
- state transitions
- review/re-review/admin override
- dictionary mother/variant logic
- folklore validation/media/license rules
- contribution and lifecycle behavior
- role access and public masking

What it does not fully guarantee by itself:
- custom frontend UI polish/usability
- frontend-only controls not yet implemented

If all items below pass and no item is blocked, you can reasonably mark backend/system behavior as working.

---

## Run Info

- Tester:
- Date:
- Branch/Commit:
- Environment:
- Backend URL: `http://127.0.0.1:8000`

---

## A) Baseline

- [ ] `BH-01` Migrations run cleanly (`python3 manage.py migrate`)
  - How to check: In terminal at `backend/`, run command and confirm output ends without traceback.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `BH-02` Tests pass (`python3 manage.py test users reviews dictionary folklore`)
  - How to check: Run command and confirm final line says tests passed (`OK`).
  - Status:
  - Remarks:
  - Evidence:

---

## B) Access and Roles

- [ ] `AC-01` Dashboard unauthenticated -> HTTP 401
  - How to check: Logout, open `http://127.0.0.1:8000/api/reviews/dashboard`, verify JSON auth error.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `AC-02` Dashboard as contributor -> HTTP 403
  - How to check: Login as contributor, open same URL, verify permission denied response.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `AC-03` Dashboard as reviewer/admin -> HTTP 200 with `dictionary`, `folklore`, `reviews`
  - How to check: Login as reviewer/admin, open same URL, confirm JSON keys are present.
  - Status:
  - Remarks:
  - Evidence:

---

## C) Dictionary

- [ ] `DI-01` Admin revision form shows real fields (not raw JSON only)
  - How to check: Go to `/admin/` -> Dictionary -> Entry revisions -> open one; confirm term/meaning/etc fields are visible.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-02` New revision submit: `draft -> pending`
  - How to check: Create or edit a revision in admin/frontend, submit it, then refresh revision status.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-03` First approve only: remains pending (no quorum yet)
  - How to check: As reviewer A, approve a pending revision once; confirm still pending.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-04` Quorum approve: revision `approved`, entry `approved`
  - How to check: As reviewer B (or admin), approve same revision; confirm revision and entry become approved.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-05` Reject pending revision with notes: immediate `rejected`
  - How to check: Submit reject action with non-empty notes on pending revision; confirm status immediately rejected.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-06` Reject without notes: validation error / HTTP 400
  - How to check: Attempt reject with empty notes from review action endpoint/UI; verify validation error appears.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-07` Flag approved revision: entry `approved_under_review`
  - How to check: On an approved dictionary revision, choose flag with notes; then check entry status.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-08` Re-review reject once: entry `rejected`
  - How to check: While entry is under review, submit one reject in that round; confirm entry goes rejected.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-09` Re-review quorum approve: entry returns `approved`
  - How to check: Flag a fresh approved entry, then collect quorum approvals in active round; confirm back to approved.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-10` Mother promotion (General/General Ivatan): becomes mother
  - How to check: Approve grouped variant with `variant_type` set to General/General Ivatan; verify group mother switches.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-11` Mother fallback on archive/remove: earliest approved non-archived variant becomes mother
  - How to check: Archive current mother, then inspect group members in admin/API and verify deterministic fallback mother.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-12` Variant detail: `semantic_core` comes from mother
  - How to check: Open `/api/dictionary/entries/<variant_id>` and compare `semantic_core.source_entry_id` to group mother ID.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-13` Variant detail: `variant_section` shows clicked variant fields
  - How to check: In same response, verify `variant_section.term` matches clicked variant, not mother term.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-14` Term source masking works (self-knowledge)
  - How to check: Use entry with `term_source_is_self_knowledge=true`; in public response, term source should be empty.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-15` Audio source masking works (self-recorded)
  - How to check: Set `audio_source_is_self_recorded=true`; public response should hide audio source.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-16` Photo source masking works (contributor-owned)
  - How to check: Set `photo_source_is_contributor_owned=true`; public response should hide photo source.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-17` Public revision history: base + last 5 approved revisions
  - How to check: Open entry API while logged out, count `revision_history.recent_approved_revisions` max 5 plus base snapshot.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-18` Staff revision history: base + last 15 approved revisions
  - How to check: Open same endpoint as reviewer/admin, confirm max 15 recent plus base snapshot.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `DI-19` Media replacement keeps single active audio/photo and preserves old in history
  - How to check: Approve revision replacing audio/photo; confirm new media is active and old media only appears in older revision snapshots.
  - Status:
  - Remarks:
  - Evidence:

---

## D) Folklore

- [ ] `FO-01` Missing title/content/category -> validation error
  - How to check: Create folklore draft missing one required field; submit and confirm error message.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-02` `self_knowledge=false` + empty source -> validation error
  - How to check: Submit folklore with self-knowledge unchecked and blank source; confirm rejection.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-03` `self_knowledge=true` + empty source -> accepted
  - How to check: Check self-knowledge and leave source blank; create/submit should pass this rule.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-04` Media present + `self_produced_media=false` + empty media_source -> validation error
  - How to check: Add media URL or upload, leave media_source blank, self-produced unchecked; confirm error.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-05` Media present + `self_produced_media=true` + empty media_source -> accepted
  - How to check: Keep media present, check self-produced media, leave media_source blank; should pass.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-06` Invalid municipality -> HTTP 400
  - How to check: Send invalid municipality via form/API (e.g., custom value), confirm validation error.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-07` All allowed municipality values accepted
  - How to check: Test each allowed value one by one and ensure save/submit succeeds.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-08` Photo upload accepted and returned
  - How to check: Upload photo in folklore create/update, then open detail response and confirm `photo_upload_url`.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-09` Audio upload accepted and returned
  - How to check: Upload audio in folklore create/update, then open detail response and confirm `audio_upload_url`.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-10` YouTube/media URL stored and returned
  - How to check: Enter YouTube link in `media_url`, save and re-open detail to verify same URL.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-11` Valid folklore draft submit: `draft -> pending`
  - How to check: Create valid draft then submit; refresh revision and confirm status changed to pending.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-12` First approve only on pending folklore: may remain pending (no quorum)
  - How to check: Reviewer A approves pending folklore revision; check that final publish did not happen yet.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-13` Quorum folklore approve: revision `approved`, entry `approved`
  - How to check: Reviewer B/admin approves same revision; confirm revision approved and live entry approved.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-14` Flag approved folklore: entry `approved_under_review`
  - How to check: Flag approved folklore revision with notes; inspect entry status.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-15` Re-review reject once: entry `rejected`
  - How to check: In active folklore re-review round, submit one reject; entry should become rejected immediately.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-16` Empty copyright on approval -> auto `CC BY-NC 4.0`
  - How to check: Approve folklore where copyright field is blank; verify stored value becomes `CC BY-NC 4.0`.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-17` Approved license direct edit blocked (must use revision)
  - How to check: Try to edit approved entry license directly in admin/model flow; expect validation block.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-18` Public folklore list shows only `approved` + `approved_under_review`
  - How to check: Open `/api/folklore/entries` and confirm rejected/archived/draft/pending entries are not listed.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-19` Public source hidden when self-knowledge
  - How to check: Open folklore detail for self-knowledge item; `source` should be empty in response.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `FO-20` Public media_source hidden when self-produced media
  - How to check: Open folklore detail for self-produced media item; `media_source` should be empty.
  - Status:
  - Remarks:
  - Evidence:

---

## E) Reviews and Overrides

- [ ] `RV-01` Duplicate same reviewer+round review blocked
  - How to check: Submit review once, then repeat same reviewer/round action; expect duplicate review validation error.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `RV-02` Self-review blocked
  - How to check: Log in as original contributor and attempt review on own revision; confirm blocked.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `RV-03` Invalid UUID returns HTTP 400 JSON (not 500)
  - How to check: Call submit review endpoint with invalid `revision_id` text; confirm clean HTTP 400 JSON error.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `RV-04` Admin override `force_reject` works
  - How to check: As admin, call override on under-review entry with `force_reject`; confirm status becomes rejected.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `RV-05` Admin override `restore_approved` works
  - How to check: As admin, call override with `restore_approved`; confirm status becomes approved.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `RV-06` Admin override `archive` works
  - How to check: As admin, call override with `archive`; confirm status archived and archived date set.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `RV-07` Non-admin override attempt -> HTTP 403
  - How to check: As contributor/reviewer (non-admin), call override endpoint; verify forbidden response.
  - Status:
  - Remarks:
  - Evidence:

---

## F) Contributions and Lifecycle

- [ ] `CT-01` First approved mother term awards one `dictionary_term` event
  - How to check: After first approved mother publish, inspect leaderboard or contribution event rows for one dictionary_term event.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `CT-02` First approved folklore entry awards one `folklore_entry` event
  - How to check: Approve first folklore submission by user, then verify one folklore_entry contribution event exists.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `CT-03` Same user multiple revisions on same entry only counts once
  - How to check: Approve two revisions by same user on same entry; revision contribution total should increase only once.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `CT-04` Contribution counts persist after archive/delete/re-review rejection
  - How to check: Earn contributions, then archive/delete/reject via re-review; verify totals remain unchanged.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `LC-01` `archived_at` is not contributor-editable
  - How to check: In contributor-facing forms/APIs, ensure no editable archived timestamp field exists.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `LC-02` Folklore admin shows `archived_at` as read-only
  - How to check: Open folklore entry in admin and confirm archived field cannot be edited.
  - Status:
  - Remarks:
  - Evidence:

- [ ] `LC-03` Lifecycle command runs without errors (`python3 manage.py run_lifecycle_maintenance`)
  - How to check: Run command in terminal; confirm completion without traceback.
  - Status:
  - Remarks:
  - Evidence:

---

## Final Summary

- Total checks:
- PASS:
- FAIL:
- BLOCKED:
- N/A:
- Final decision: `GO` / `NO-GO`
- Final notes:

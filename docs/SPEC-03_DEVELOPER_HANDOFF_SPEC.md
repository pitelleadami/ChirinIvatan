# SPEC-03 Developer Handoff Specification (Authoritative, Exhaustive)

Status: locked handoff for reimplementation  
Audience: backend + frontend engineers rebuilding this exact system  
Goal: zero room for interpretation drift

---

## 1. Scope, Sources, and Non-Negotiables

### 1.1 Scope
This document defines:
- all domain entities and fields
- all state transitions
- all review and re-review governance rules
- all mother/variant deterministic behavior
- all retention and contribution counting rules
- all API contracts expected by frontend and QA

### 1.2 Canonical Reference
This handoff is aligned to current backend implementation in:
- `backend/dictionary/`
- `backend/folklore/`
- `backend/reviews/`
- `backend/users/`

### 1.3 Design Principle
The platform is revision-centric:
- live entry models store currently active published state
- revision models store submissions and historical snapshots
- reviews act on revisions, then apply effects to live entries

---

## 2. Roles and Access Control

Roles:
- Contributor
- Reviewer (`Reviewer` group)
- Admin (`Admin` group or superuser)

Rules:
- Contributor can create/edit/submit own draft revisions.
- Reviewer/Admin can approve/reject/flag.
- Self-review is forbidden in both dictionary and folklore.
- Admin has additional override power (`force_reject`, `restore_approved`, `archive`).

---

## 3. State Machines (Strict)

### 3.1 Entry States (Dictionary and Folklore)
Allowed values:
- `draft`
- `pending`
- `approved`
- `approved_under_review`
- `rejected`
- `archived`
- `deleted`

Allowed transitions only:
- `draft -> pending`
- `pending -> approved | rejected`
- `approved -> approved_under_review | archived`
- `approved_under_review -> approved | rejected`
- `rejected -> archived`
- `archived -> approved | deleted`
- `deleted ->` none

No transition outside this table is legal.

### 3.2 Revision States (Dictionary and Folklore)
Allowed values:
- `draft`
- `pending`
- `approved`
- `rejected`

Interpretation:
- revisions are submission objects
- entry state may remain `approved` while a new revision is still `pending`

---

## 4. Dictionary Domain (Complete Contract)

### 4.1 Live Model: `Entry` Field Contract

Variant/group fields:
- `id`: UUID, PK
- `variant_group`: FK nullable -> `VariantGroup`
- `is_mother`: bool

Semantic-core fields (authoritative on mother):
- `meaning`: text
- `part_of_speech`: string
- `photo`: image nullable
- `photo_source`: text
- `photo_source_is_contributor_owned`: bool
- `english_synonym`: string
- `ivatan_synonym`: string
- `english_antonym`: string
- `ivatan_antonym`: string
- `inflected_forms`: JSON

Variant-specific fields:
- `term`: string, required
- `pronunciation_text`: string
- `audio_pronunciation`: file nullable
- `audio_source`: text
- `audio_source_is_self_recorded`: bool
- `variant_type`: string
- `usage_notes`: text
- `etymology`: text
- `example_sentence`: text
- `example_translation`: text
- `source_text`: text
- `term_source_is_self_knowledge`: bool

Attribution/governance fields:
- `audio_contributor`: FK nullable user
- `photo_contributor`: FK nullable user
- `status`: enum (`EntryStatus`)
- `initial_contributor`: FK user, required
- `last_revised_by`: FK nullable user
- `last_approved_by`: M2M users
- `last_approved_at`: datetime nullable
- `archived_at`: datetime nullable
- `created_at`: datetime

### 4.2 Snapshot Fields Used in Dictionary Revisions
The revision payload must follow `ENTRY_SNAPSHOT_FIELDS` in `backend/dictionary/services.py`:
- `term`
- `meaning`
- `part_of_speech`
- `photo`
- `photo_source`
- `photo_source_is_contributor_owned`
- `english_synonym`
- `ivatan_synonym`
- `english_antonym`
- `ivatan_antonym`
- `pronunciation_text`
- `audio_pronunciation`
- `audio_source`
- `audio_source_is_self_recorded`
- `variant_type`
- `usage_notes`
- `etymology`
- `example_sentence`
- `example_translation`
- `source_text`
- `term_source_is_self_knowledge`
- `inflected_forms`

### 4.3 Revision Model: `EntryRevision` Field Contract
- `id`: UUID, PK
- `entry`: FK nullable -> `Entry` (null for brand-new submission)
- `contributor`: FK user, required
- `proposed_data`: JSON full snapshot
- `status`: `draft|pending|approved|rejected`
- `reviewer_notes`: text
- `is_base_snapshot`: bool (first approved revision for an entry)
- `created_at`: datetime
- `approved_at`: datetime nullable

### 4.4 Mother/Variant Deterministic Rules
- All related terms are in a `VariantGroup`.
- Group may temporarily have no mother (`mother_entry = null`).
- On first publish with no group, create group and set entry as mother.
- `General` or `General Ivatan` (case-insensitive aliases) auto-promotes approved entry to mother.
- If current mother is archived/removed, fallback mother = earliest approved non-archived variant by:
  1. `first_approved_at` (minimum approved revision time),
  2. `created_at`,
  3. UUID lexical tiebreak.
- If no approved candidates exist, group remains motherless until next approved candidate.

### 4.5 Dictionary Media Rules
- At most one active audio and one active photo per entry.
- Media replacement only through revision approval.
- Old media remains in revision history, not active public view.
- If approved revision changes active audio/photo, media contributor shifts to that revising contributor.

### 4.6 Semantic Core Inheritance Rule
- Semantic core shown for variants comes from mother entry.
- Variant entry keeps variant-specific fields independent.
- Public detail endpoint must show:
  - semantic core sourced from mother
  - variant section sourced from clicked variant

---

## 5. Folklore Domain (Complete Contract)

### 5.1 Live Model: `FolkloreEntry` Field Contract
- `id`: UUID, PK
- `title`: string, required
- `content`: text, required
- `category`: enum required:
  - `myth`, `legend`, `laji`, `poem`, `proverb`, `idiom`
- `municipality_source`: enum required, allowed:
  - `Basco`, `Mahatao`, `Ivana`, `Uyugan`, `Sabtang`, `Itbayat`, `Not Applicable`
- `source`: text (conditionally required)
- `self_knowledge`: bool
- `media_url`: URL optional
- `photo_upload`: image optional
- `audio_upload`: file optional
- `media_source`: text (conditionally required)
- `self_produced_media`: bool
- `copyright_usage`: string
- `contributor`: FK user required
- `status`: `draft|pending|approved|approved_under_review|rejected|archived|deleted`
- `archived_at`: datetime nullable
- `created_at`, `updated_at`: datetime

### 5.2 Folklore Validation Rules (Hard Rules)
- `municipality_source` must be one of strict choices.
- If `self_knowledge = false`, `source` must be non-empty.
- Media is considered present if any of:
  - `media_url` non-empty
  - `photo_upload` present
  - `audio_upload` present
- If media is present and `self_produced_media = false`, `media_source` must be non-empty.

### 5.3 Folklore License Rule
- On save when status is `approved`:
  - if `copyright_usage` empty, auto-fill `CC BY-NC 4.0`.
- Once approved, changing `copyright_usage` directly is blocked.
- License changes require a new approved revision snapshot.

### 5.4 Revision Model: `FolkloreRevision` Field Contract
- `id`: UUID, PK
- `entry`: FK nullable -> `FolkloreEntry`
- `contributor`: FK user
- `proposed_data`: JSON snapshot
- `photo_upload`: image optional
- `audio_upload`: file optional
- `status`: `draft|pending|approved|rejected`
- `reviewer_notes`: text
- `is_base_snapshot`: bool
- `created_at`, `approved_at`

### 5.5 Snapshot Fields Used in Folklore Revisions
Must align with `FOLKLORE_SNAPSHOT_FIELDS`:
- `title`
- `content`
- `category`
- `municipality_source`
- `source`
- `self_knowledge`
- `media_url`
- `media_source`
- `self_produced_media`
- `copyright_usage`
- `photo_upload`
- `audio_upload`

---

## 6. Review Governance (Dictionary + Folklore)

### 6.1 Decision Types
- `approve`
- `reject`
- `flag`

### 6.2 Review Rounds
- Initial review round is `0`.
- Every `flag` starts next re-review round (`review_round = previous max + 1`).
- A reviewer can review at most once per revision per round.

### 6.3 Initial Submission Rules
- Approve quorum:
  - 2 reviewers, or
  - 1 reviewer + 1 admin
- One reject immediately rejects pending revision.
- Reject requires notes.

### 6.4 Post-Publish Re-Review Rules
- Only approved published revisions can be flagged.
- Flag requires notes.
- Flag moves entry to `approved_under_review`, still publicly visible.
- In active re-review round:
  - one reject -> entry `rejected`
  - quorum approve -> entry back to `approved`

### 6.5 Admin Override Rules
Allowed only for entries in `approved_under_review`:
- `force_reject`
- `restore_approved`
- `archive`

Admin override requires notes and is logged in `ReviewAdminOverride`.

---

## 7. Revision Retention and Visibility

### 7.1 Base Snapshot Rule
For each entry, first approved revision:
- `is_base_snapshot = true`
- excluded from deletion pruning
- permanent origin snapshot

### 7.2 Retention Rule
For each entry:
- keep max 20 approved non-base revisions
- when overflowing, delete oldest approved non-base first

### 7.3 Visibility Rule
- Public: base snapshot + last 5 approved non-base revisions
- Reviewer/Admin: base snapshot + last 15 approved non-base revisions

---

## 8. Contribution and Leaderboard Rules

### 8.1 Contribution Event Types
- `dictionary_term`
- `folklore_entry`
- `revision`

### 8.2 Award Triggers
- Dictionary original: on first approved publish that is a mother term.
- Folklore original: on first approved publish.
- Revision: approved update on existing entry.

### 8.3 Uniqueness Rule
Revision contributions are unique per `(user, entry, revision-type)` lifetime:
- dictionary: unique by user + dictionary_entry + `revision`
- folklore: unique by user + folklore_entry + `revision`

Repeated revisions by same user on same entry do not increase count.

### 8.4 Historical Persistence Rule
Contribution events are never decremented due to:
- archive
- deletion
- re-review rejection

### 8.5 Leaderboard Formula
`total = dictionary_terms + folklore_entries + revisions`

---

## 9. Public Visibility and Masking Rules

### 9.1 Visibility
Only `approved` and `approved_under_review` are public in list/detail endpoints.

### 9.2 Dictionary Attribution Masking
- Term source hidden when `term_source_is_self_knowledge = true`.
- Audio source hidden when `audio_source_is_self_recorded = true`.
- Photo source hidden when `photo_source_is_contributor_owned = true`.
- Audio contributor hidden when same person as term initial contributor.
- Always visible governance:
  - `last_revised_by`
  - `reviewed_and_approved_by`

### 9.3 Folklore Masking
- Hide `source` when `self_knowledge = true`.
- Hide `media_source` when `self_produced_media = true`.

---

## 10. API Contracts (Current Backend)

Important routing note:
- Project root mounts app URLs at `""`, not `/api` root index.
- Valid endpoints are full paths below (for example `/api/reviews/dashboard`).

### 10.1 Dictionary
- `GET /api/dictionary/entries/<uuid:entry_id>`
  - Public if entry is `approved` or `approved_under_review`
  - Returns:
    - `header`
    - `semantic_core`
    - `variant_section`
    - `connected_variants`
    - `contributors`
    - `attribution`
    - `revision_history`
    - backward-compatible compact `entry`

### 10.2 Folklore Public
- `GET /api/folklore/entries`
- `GET /api/folklore/entries/<uuid:entry_id>`

### 10.3 Folklore Contributor (Canonical)
- `GET /api/folklore/revisions/my`
- `POST /api/folklore/revisions/create`
- `PATCH /api/folklore/revisions/<uuid:revision_id>`
- `POST /api/folklore/revisions/<uuid:revision_id>/submit`

Legacy compatibility aliases (still active):
- `GET /api/folklore/entries/my`
- `POST /api/folklore/entries/create`
- `PATCH /api/folklore/entries/<uuid:revision_id>/draft`
- `POST /api/folklore/entries/<uuid:revision_id>/submit`

### 10.4 Review APIs
- `GET /api/reviews/dashboard`
  - Auth required reviewer/admin
  - Returns grouped payload:
    - `dictionary.pending_submissions`
    - `dictionary.pending_rereview`
    - `folklore.pending_submissions`
    - `folklore.pending_rereview`
    - `reviews.my_reviews`
    - `reviews.awaiting_quorum_after_my_approval`
  - Also includes legacy top-level aliases for backward compatibility

- `POST /api/reviews/dictionary/submit`
  - Body:
    - `revision_id` required UUID
    - `decision` required (`approve|reject|flag`)
    - `notes` required for `reject|flag`

- `POST /api/reviews/folklore/submit`
  - Canonical body:
    - `revision_id`
    - `decision`
    - `notes`
  - Compatibility body:
    - `entry_id` accepted if `revision_id` not provided
  - Legacy compatibility behavior:
    - if legacy entry has no matching revision row, backend may synthesize one to process review

- `POST /api/reviews/admin/override`
  - Body:
    - `target_type` (`dictionary|folklore`)
    - `target_id` UUID
    - `action` (`force_reject|restore_approved|archive`)
    - `notes` required

### 10.5 User/Leaderboard APIs
- `GET /leaderboard/global`
- `GET /leaderboard/municipality?municipality=<name>`
- `GET /api/users/<username>`

---

## 11. Error Contract

Expected response classes:
- `400`: invalid JSON, invalid UUID, invalid decision/action, validation error
- `401`: unauthenticated for protected endpoint
- `403`: authenticated but insufficient role
- `404`: target revision/entry not found

Known implementation detail:
- Placeholder text such as `PASTE_REVISION_ID_HERE` causes invalid UUID errors.

---

## 12. Admin UX Requirements (Backend-Backed)

Dictionary admin:
- `EntryRevision` admin form must expose real domain fields, not raw JSON-only editing.
- Save writes back into `proposed_data`.

Folklore admin:
- `FolkloreEntry` keeps `contributor` and `archived_at` read-only.
- `FolkloreRevision` admin is read-only audit (no add/change/delete).

---

## 13. Frontend Form Requirements

### 13.1 Folklore Contributor Form
Must implement:
- municipality dropdown using exact 7 allowed values
- `source` required unless self-knowledge checked
- `media_source` required only when media exists and self-produced is false
- contributor auto-derived from authenticated user
- archive fields not user-editable
- show license notice:
  - if empty at approval, defaults to `CC BY-NC 4.0`
- actions:
  - Save as Draft
  - Submit
  - Delete Draft
  - note: current backend does not expose a dedicated delete-draft endpoint yet; frontend delete requires adding one or using local draft discard behavior

### 13.2 Reviewer Dashboard UX Recommendation
Recommended sections:
- Dictionary:
  - Submissions (new terms)
  - Revisions (updates to published terms)
  - Under Re-review
- Folklore:
  - Submissions
  - Revisions
  - Under Re-review
- Reviews:
  - My Reviews
  - Awaiting Quorum

This structure is primarily frontend composition of backend payloads.

### 13.3 Screen-by-Screen Contracts (Frontend Handoff)

Screen: `Reviewer Dashboard`
- Data source: `GET /api/reviews/dashboard`
- Must render:
  - Dictionary queue from `dictionary.pending_submissions`
  - Dictionary re-review queue from `dictionary.pending_rereview`
  - Folklore queue from `folklore.pending_submissions`
  - Folklore re-review queue from `folklore.pending_rereview`
  - Review history from `reviews.my_reviews`
  - Quorum wait list from `reviews.awaiting_quorum_after_my_approval`
- Expected outcomes:
  - reviewer/admin gets HTTP 200 with grouped payload
  - unauthenticated gets 401
  - wrong role gets 403

Screen: `Dictionary Entry Detail`
- Data source: `GET /api/dictionary/entries/<entry_id>`
- Header must show:
  - clicked term
  - mother term
  - variant badge when `is_variant=true`
  - pronunciation
  - audio URL
  - variant type
- Semantic core block must use `semantic_core` object (mother-authoritative fields).
- Variant block must use `variant_section` object.
- Connected terms must use `connected_variants`.
- Contributor block must use `contributors` and `attribution`.
- Expected outcomes:
  - if entry is variant, semantics still come from mother source entry
  - masked sources remain hidden per attribution flags
  - revision history slice obeys audience limits

Screen: `Folklore Create/Edit Draft`
- Data source:
  - create: `POST /api/folklore/revisions/create`
  - update: `PATCH /api/folklore/revisions/<revision_id>`
  - submit: `POST /api/folklore/revisions/<revision_id>/submit`
- Form controls required:
  - title, content, category, municipality_source, source/self_knowledge
  - media_url, photo_upload, audio_upload, media_source/self_produced_media
  - copyright_usage
- Form logic required:
  - disable source requirement if self_knowledge=true
  - disable media_source requirement if self_produced_media=true
  - municipality must be dropdown with exact allowed values
  - contributor derived from authenticated session only
- Expected outcomes:
  - invalid combinations return 400 with validation detail
  - successful create returns revision id and license reminder
  - submit moves revision to pending

Screen: `Folklore Public List/Detail`
- Data source:
  - list: `GET /api/folklore/entries`
  - detail: `GET /api/folklore/entries/<entry_id>`
- Expected outcomes:
  - only `approved` and `approved_under_review` appear
  - hidden source/media_source values obey self flags
  - media URLs present only when uploaded

Screen: `Review Action Controls`
- Data source:
  - dictionary: `POST /api/reviews/dictionary/submit`
  - folklore: `POST /api/reviews/folklore/submit`
- Control requirements:
  - approve/reject/flag buttons
  - notes input required for reject and flag
  - disable duplicate action per same revision and review round if backend returns duplicate-review error
- Expected outcomes:
  - one reject can immediately reject pending or re-review flows
  - quorum approve transitions to approved outcomes
  - flag transitions to under-review state

Screen: `Admin Override Panel` (if implemented)
- Data source: `POST /api/reviews/admin/override`
- Required fields:
  - target type, target id, action, notes
- Expected outcomes:
  - only admins can execute
  - non-admin call returns 403
  - override writes final status immediately
  - override record is auditable

---

## 14. Operational and QA Notes

- `/.well-known/appspecific/com.chrome.devtools.json` 404 is harmless.
- If browser console shows HTML parse error on JSON parse, check server traceback.
- Use actual UUIDs from dashboard/list responses, never placeholders.

Minimum acceptance gate:
1. `python3 manage.py migrate`
2. `python3 manage.py test users reviews dictionary folklore`
3. run `docs/SPEC-03_MANUAL_QA_CHECKLIST.md`
4. verify reviewer/admin paths can approve/reject/flag/override from API
5. verify masking and retention behavior from public endpoints

---

## 15. Equivalence Definition

A new developer implementation is equivalent only if:
- field-level data model and conditional validation rules match this document
- state transitions are exactly constrained to allowed table
- mother/variant promotion and fallback are deterministic as specified
- review quorum/re-review/admin override behavior is identical
- retention, contribution counting, and visibility rules are identical
- API contracts and key names expected by frontend remain compatible

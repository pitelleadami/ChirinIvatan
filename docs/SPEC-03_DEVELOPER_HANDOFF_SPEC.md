# SPEC-03 Developer Handoff Specification (Authoritative, Exhaustive)

Status: implementation handoff; superseded by `SPEC-03_REBUILD_SPEC.md` where conflicts exist
Audience: backend + frontend engineers rebuilding this exact system  
Goal: zero room for interpretation drift

Implementation status snapshot (2026-06-13):

- Backend core workflows are implemented and test-backed.
- Frontend product screens are implemented and build successfully.
- In-app notifications, contribution status tracking, one-time onboarding, and HTML role invitations are implemented and deployed.
- Admin-managed maintenance mode is implemented.
- Use `SPEC-03_REBUILD_SPEC.md` as the rebuild-grade master specification.

Canonical path note:

- Active backend root: `backend/`
- Active frontend root: `frontend/`
- Use only these two roots for all new development and onboarding.
- If this file conflicts with `docs/SPEC-03_REBUILD_SPEC.md`, the rebuild spec wins.

Display normalization decisions:

- Usernames are handles: store and display them lowercase, resolve profile lookups case-insensitively, and never convert username fallbacks into person-style names.
- Login resolves username handles case-insensitively before password authentication so legacy mixed-case usernames remain valid.
- Invalid login errors may include a generic hint to try lowercase usernames, but must not confirm whether a username exists.
- Person names may be display-normalized when obvious all-caps input is detected.
- Profile affiliation rows and generated affiliation/occupation summaries use title-style capitalization; post-nominals and credentials remain as entered.

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
- Admins archive from the actual dictionary or folklore entry view. Steward's Desk includes an admin-only Archive tab for searching and restoring preserved records with required audit notes.
- Automatic permanent deletion of archived entries is disabled. Archived records remain preserved unless the project owner explicitly approves a future deletion workflow.
- Admin can edit public About/Digital Yaru copy, Statements of Support, Supporting Organizations, role-aware FAQ sections, and FAQ images through Steward's Desk -> Site Content.
- Each user profile has `include_in_leaderboard`; when false, contribution credits remain on the public profile but the user is excluded from Hall of Stewards leaderboard rows and municipality aggregate scores. Only admins can toggle this through `POST /api/users/<username>/leaderboard-visibility` or the admin profile/people controls.

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
- `photo_license`: string (defaults to `CC BY-NC 4.0`; blank when no photo)
- `english_synonym`: string
- `ivatan_synonym`: string
- `english_antonym`: string
- `ivatan_antonym`: string
- `inflected_forms`: JSON

Variant-specific fields:

- `term`: string, required
- `pronunciation_text`: string
- `phonetic`: string
- `audio_pronunciation`: file nullable
- `audio_source`: text
- `audio_source_is_self_recorded`: bool
- `audio_license`: string (defaults to `CC BY-NC 4.0`; blank when audio is not self-recorded)
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
- `photo_license`
- `english_synonym`
- `ivatan_synonym`
- `english_antonym`
- `ivatan_antonym`
- `pronunciation_text`
- `phonetic`
- `audio_pronunciation`
- `audio_source`
- `audio_source_is_self_recorded`
- `audio_license`
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
- `photo_license` / `audio_license` (string, `DEFAULT_MEDIA_LICENSE = "CC BY-NC 4.0"` in `dictionary/views.py`): normalized on submit/revise via `_normalize_media_licenses` — set to the default (or the supplied value) when the matching media is present, cleared to empty otherwise. Public detail surfaces the license only for self-recorded audio and contributor-owned photos.

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
  - `oral_narratives`
  - `wisdom_expressions`
  - `songs_poetry`
  - `beliefs_ritual_life`
  - `traditional_knowledge`
- `subcategory`: enum required, must belong to selected category
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
- `entry`: FK nullable -> `FolkloreEntry` (null when `revision_type = variant` until approval)
- `variant_of`: FK nullable -> `FolkloreEntry` (set for `variant` type; tracks lineage to source entry)
- `contributor`: FK user
- `proposed_data`: JSON snapshot
- `photo_upload`: image optional
- `audio_upload`: file optional
- `revision_type`: `revision` | `variant` (default `revision`)
- `status`: `draft|pending|approved|rejected`
- `reviewer_notes`: text
- `is_base_snapshot`: bool
- `created_at`, `approved_at`

`revision_type` semantics:

- `revision`: contributor is editing an entry they originally submitted. `entry` set, `variant_of` null. On approval, overwrites the live `FolkloreEntry`.
- `variant`: any authenticated user submitting an alternate version of someone else's entry. `entry` is null pre-publish, `variant_of` set. On approval, `publish_revision` creates a new `FolkloreEntry` and sets `revision.entry` to it.

### 5.5 Snapshot Fields Used in Folklore Revisions

Must align with `FOLKLORE_SNAPSHOT_FIELDS`:

- `title`
- `content`
- `category`
- `subcategory`
- `municipality_source`
- `source`
- `self_knowledge`
- `media_url`
- `media_source`
- `self_produced_media`
- `copyright_usage`
- `photo_upload`
- `audio_upload`

### 5.6 Folklore Revision Ownership Rules

Folklore entries are **contributor-owned archival records**. Ownership is enforced at the view layer.

| Actor                              | Can revise            | Can submit variant  | Can review               |
| ---------------------------------- | --------------------- | ------------------- | ------------------------ |
| Original contributor (entry owner) | Yes                   | Yes (but pointless) | No (self-review blocked) |
| Other contributor                  | No (403)              | Yes                 | No                       |
| Reviewer                           | No (403 if not owner) | Yes                 | Yes                      |
| Admin / Superuser                  | Yes (any entry)       | Yes                 | Yes                      |

Enforcement:

- `start_folklore_entry_revision_view` checks `_is_entry_owner_or_admin(user, entry)`. Non-owners receive HTTP 403 with a message pointing them to the variant endpoint.
- `start_folklore_variant_view` requires authentication only (no ownership check).
- Admins are identified as superuser OR member of the `Admin` group.

Service responsibilities:

- `create_revision_from_entry()` — owner edits; `revision_type=revision`.
- `create_variant_from_entry()` — any authenticated user; `revision_type=variant`; `proposed_data={}` (empty — contributor writes from scratch, not seeded from original).

### 5.7 Variant Submission Flow

1. Non-owner clicks "Submit an alternate version" on the folklore entry detail page.
2. Frontend calls `POST /api/folklore/entries/<entry_id>/variants/start`.
3. Backend calls `create_variant_from_entry(entry=..., contributor=request.user)`.
4. An empty `FolkloreRevision` is created: `entry=None`, `variant_of=<source_entry>`, `proposed_data={}`, `revision_type=variant`.
5. Frontend navigates to the draft builder (`?revision_id=<id>`) where the contributor writes the variant from scratch.
6. Variant goes through the same review workflow (quorum, flagging, etc.) as a regular submission.
7. On approval, `publish_revision` creates a new `FolkloreEntry` and links it back via `revision.entry`.
8. Approved variants appear in the "Alternate Versions" section on the source entry's detail page. Lookup uses `FolkloreRevision(variant_of=entry, revision_type=variant, is_base_snapshot=True)` → `revision.entry`.

### 5.8 FolkloreComment Model

Flat public comment thread ("Community Voices") on published folklore entries.

Fields:

- `id`: UUID PK
- `entry`: FK -> `FolkloreEntry` (CASCADE)
- `author`: FK -> `User` (PROTECT)
- `body`: text, max 2000 chars
- `created_at`: datetime auto, ascending sort

Rules:

- Any authenticated user may post.
- Only comment author or admin/superuser may delete.
- No threading/nesting.
- `clean()` enforces non-empty body and 2000-char limit.

API endpoints:

- `GET /api/folklore/entries/<uuid>/comments` — public, returns list with `author_photo_url` from `UserProfile.profile_photo`.
- `POST /api/folklore/entries/<uuid>/comments/create` — authenticated.
- `DELETE /api/folklore/comments/<uuid>/delete` — author or admin only.

Frontend display:

- Section named **Community Voices**, full-width below the 2-column metadata layout.
- Each comment shows: 28px avatar circle (profile photo or initial fallback), author name, timestamp, body, and a delete button if `is_own=true` or user is admin.
- Unauthenticated users see a login nudge instead of the comment form.

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
  - Reject/Archive -> entry `archived` and removed from public view
  - Return for Fixing -> assigned correction draft appears as Needs Changes for the assignee
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
  - Returns `alternate_versions` list (approved variants linked to this entry)
- `GET /api/folklore/entries/<uuid:entry_id>/comments` — public comment list

### 10.3 Folklore Contributor (Canonical)

- `GET /api/folklore/revisions/my`
- `POST /api/folklore/revisions/create`
- `PATCH /api/folklore/revisions/<uuid:revision_id>`
- `POST /api/folklore/revisions/<uuid:revision_id>/submit`
- `POST /api/folklore/entries/<uuid:entry_id>/revisions/start` — owner/admin only; starts revision draft pre-seeded from live entry
- `POST /api/folklore/entries/<uuid:entry_id>/variants/start` — any authenticated user; starts empty variant draft linked to source entry via `variant_of`
- `POST /api/folklore/entries/<uuid:entry_id>/comments/create` — authenticated
- `DELETE /api/folklore/comments/<uuid:comment_id>/delete` — comment author or admin only

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

### 10.6 Notification and Onboarding APIs

- `GET /api/notifications`
  - returns the signed-in user's newest 40 notifications and total unread count
- `POST /api/notifications/mark-read`
  - marks all unread notifications, or only UUIDs supplied in `ids`
- `POST /api/profile/onboarding/dismiss`
  - persists completion/dismissal of the one-time welcome prompt
- `GET /api/auth/me`
  - includes `onboarding_prompt_pending` and `onboarding_prompt_dismissed`

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
- do not show routine “loaded draft” notification banners; draft state should be obvious from the form state
- source and usage/copyright permission belong in one related panel
- uploaded images must be at least `200px x 200px`
- preview images whose longest side is less than `600px` should render in the right/half column rather than full width

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
- Must not render:
  - `dictionary.published_entries`
  - `folklore.published_entries`
- Queue card UX:
  - Each card shows title (plain bold text, no eye icon) + status badge + entry preview fields
  - A "Review" button at the bottom of each card opens a full-screen preview modal
  - Awaiting-quorum cards are read-only (no Review button); they use the expand/collapse toggle only
  - Each card with an approved entry shows a "View live entry" link (renamed from "View actual item")
- Contributor naming (applies to all four queue serializers):
  - Backend includes `contributor_display_name` alongside `contributor_username` in
    `dictionary.pending_submissions`, `dictionary.pending_rereview`,
    `folklore.pending_submissions`, `folklore.pending_rereview` (and the published/flag serializers)
  - `contributor_display_name` = full name + name extension + post-nominals, via `users.names.display_name`
  - Post-nominals are capped at the LAST 2 entries in the review context only (the global
    `users.names.display_name` is unchanged — long credential lists stay intact elsewhere)
  - Frontend falls back to `contributor_username` when no display name is set
  - Queries `select_related("contributor__profile")` so the display name adds no extra DB hits
- Preview modal:
  - Header is the kicker ("Dictionary Term Preview" / "Folklore Entry Preview") + status badge only
  - The head term/title renders INSIDE the preview body (dictionary headword / folklore title),
    not duplicated in the modal header
  - No "By … | submitted …" meta line at the top; that attribution lives in the Attribution section
  - The contributor name in the Attribution section links to `/profile-view?username=<username>`
  - Actions: Approve / Reject / Return for Fixing / Flag (shown per mode) + "View live entry" + Close
  - "View live entry" uses solid button styling consistent with the other action buttons
  - Neither the modal header nor the bottom action bar is sticky — both scroll with content so
    nothing overlaps the entry text
- Decision result + auto-close:
  - After Approve/Reject a result toast appears (auto-dismisses after ~4.2s)
  - Dismissing the toast (manual Close OR the auto-timeout) also closes the open preview modal,
    so a reviewed entry never lingers in a stale preview
- Queue filtering:
  - exclude rows where `contributor_username` matches the logged-in reviewer/admin
  - backend still enforces self-review prevention even if a client bypasses UI filtering
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
- Public visibility includes `approved` and `approved_under_review` entries so a flagged entry remains browsable while under re-review.
- Reviewer/admin users may see a “Flag for re-review” action when `review_action.can_flag_for_rereview=true`.
- Flag action must POST `decision=flag` with non-empty notes to `/api/reviews/dictionary/submit` using `review_action.latest_approved_revision_id`.
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
  - title, content, category, subcategory, municipality_source, source/self_knowledge
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
- Reviewer/admin users may see a “Flag for re-review” action when `review_action.can_flag_for_rereview=true`.
- Flag action must POST `decision=flag` with non-empty notes to `/api/reviews/folklore/submit` using `review_action.latest_approved_revision_id`.

Screen: `Review Action Controls`

- Data source:
  - dictionary: `POST /api/reviews/dictionary/submit`
  - folklore: `POST /api/reviews/folklore/submit`
- Control requirements:
  - Reviewer Dashboard queues show approve/reject controls for pending and re-review rows
  - Reviewer Dashboard full previews include submitted media and review-relevant metadata: dictionary audio/photo URLs, variants and variant audio, source/license fields, etymology, examples, related words; folklore rich text, uploaded photo/audio, external media URL, source/media source, and license
  - live Dictionary/Folklore entry details show flag-for-re-review controls for flaggable published entries
  - notes input required for reject and flag
  - disable duplicate action per same revision and review round if backend returns duplicate-review error
- Expected outcomes:
  - one reject immediately rejects a pending revision
  - in re-review, Reject/Archive removes the published entry from public view
  - in re-review, Return for Fixing creates an assigned correction draft and should appear to that assignee as Needs Changes
  - quorum approve transitions to approved outcomes
  - flag transitions to under-review state

Screen: `Steward Workspace`

- Top navigation workspace menu must show:
  - Personal: My Profile
  - Steward's Desk with indented subsections in this order:
    1. Reviews
    2. Applications
    3. Add New Dictionary Entry
    4. Add New Folklore Entry
  - Help: FAQs
- Hidden/retired:
  - Edit Profile
  - Role Center
  - Standalone User Manual (manual content is incorporated into role-aware FAQs)
- Reviews and Applications must keep the Steward's Desk page title/tab frame instead of navigating to an unrelated-looking view.
- Contributions must show separate Needs Changes, Drafts, Approved, and Submitted for Review tabs for both dictionary and folklore.
- Rejected cards must render `reviewer_notes` as visible reviewer feedback and link to the same revision for correction.
- Assigned correction drafts created by Return for Fixing are stored as draft revisions but must be grouped and labeled as Needs Changes until resubmitted.

Screen: `Notification Bell`

- Render for authenticated users in the global shell.
- Data source: `GET /api/notifications`.
- Show unread badge, newest-first rows, relative timestamps, and linked target routes.
- Opening the panel preserves unread state. Clicking a row marks that row read, while `Mark all as read` clears all unread rows through `POST /api/notifications/mark-read`.
- Approval notifications link to the published dictionary or folklore entry.
- Rejection notifications link to the same private rejected submission, where reviewer notes are shown and the contributor can fix and resubmit it without creating a public revision.
- Refresh on initial mount, browser focus, and once per minute while the page is visible.

Screen: `First-Login Welcome`

- Email invitation acceptance sets a persistent pending flag on the user's profile.
- On the next login, route to Steward's Desk and show one modal explaining available work.
- Actions:
  - complete profile
  - open the role-appropriate contribution/review/admin area
  - dismiss for now
- Dismissal must call `POST /api/profile/onboarding/dismiss` and must prevent the prompt from reappearing on later logins.

Screen: `FAQs and Guides`

- Public visitors see public dictionary, folklore, joining, and troubleshooting guidance.
- Contributors see contributor workflow, status, quality/cultural care, troubleshooting, and dictionary field guides.
- Reviewers see contributor guidance plus reviewer responsibilities and re-review guidance.
- Admins see all FAQ sections, including administrator responsibilities and audit/action-log guidance.
- Admin-managed FAQ sections are stored on `SiteContentSettings.faq_sections` and include `roles`, `items`, optional `image_url`, and optional `image_alt`.
- FAQ media uploads use `POST /api/site-content/faq-media` and store images under `/media/site/faq/`.
- Builder Learn More links must target FAQ anchors such as `#guide-pronunciation`, `#guide-variants`, `#guide-inflected-forms`, `#guide-usage-notes`, `#guide-etymology`, and `#guide-sources`.
- `/manual` remains only as a compatibility redirect to `/faqs`.

Screen: `Applications / Invitations`

- Applications tab should not show a separate “Loaded” count card.
- Status filter should be compact and one-row.
- Application cards paginate at 5 per page.
- Recent invitations paginate at 8 per page.
- The Pending filter is viewer-specific: exclude any quorum-pending application already decided by the signed-in screener.
- The Approved filter includes final approvals plus quorum-pending applications approved by the signed-in screener.
- A quorum-pending approval must be labeled `Awaiting final approval`, show remaining quorum progress, and hide decision controls from that screener.
- Other eligible screeners who have not decided continue to see the same application under Pending.
- Approve and reject actions show compact auto-dismiss popup notifications.
- Approval notification distinguishes recorded approval awaiting quorum from final approval with active access.
- Do not also render a duplicate inline success message for the same decision.
- Email invitation creation collects email, role, and endorsement notes only.
- The invitation acceptance screen collects and saves first name, last name, municipality, username, and password.
- Invitation email delivery must contain a plain-text body and branded `text/html` alternative.
- HTML must identify the inviter and role and include both an accept button and visible fallback URL.

Screen: `Admin People Activity Log`

- Admin-only People tab should let admins inspect a selected person's recent major actions.
- Data source: `GET /api/admin/users/<username>/activity`
- The People list source `GET /api/admin/users` includes only users with active Admin, Consultant, Reviewer, or Contributor access, including role-assigned test accounts.
- Exclude registered-only applicants who do not yet have an active role, even when they have a pending application.
- Do not exclude an existing contributor merely because that person has a separate pending reviewer application.
- Approved application users who have not created credentials appear in People with `pending_activation_applications` and should be labeled `Approved, not joined`.
- Admins can resend the approved applicant setup link through `POST /api/admin/users/<username>/approval-reminder`.
- `GET /api/admin/users` includes `email_log` rows for setup reminders and password reset messages sent to the selected person.
- The People modal should hide email history until the admin clicks `View email log`.
- Render the managed consultant profile panel after the people directory as the final People-section tool.
- Include actions such as:
  - contribution credits
  - dictionary revisions
  - folklore revisions
  - dictionary reviews
  - folklore reviews
  - role application decisions
  - role invitations sent
  - account email actions such as password reset and approved applicant setup reminders
- UI/API should show the latest 500 rows per person.
- Do not auto-delete older audit records simply because the list exceeds 500; cap retrieval/display while preserving audit history.

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
- Frontend design handoff reference: `docs/SPEC-03_FRONTEND_FIGMA_HANDOFF.md`

Minimum acceptance gate:

1. `python3 manage.py migrate`
2. `python3 manage.py test users reviews dictionary folklore`
3. run `docs/SPEC-03_MANUAL_QA_CHECKLIST.md`
4. verify reviewer/admin paths can approve/reject/flag/override from API
5. verify masking and retention behavior from public endpoints
6. verify notification list/read behavior and event creation
7. verify rejected contribution cards expose reviewer notes
8. verify invitation email alternatives and one-time onboarding persistence

---

## 15. Equivalence Definition

A new developer implementation is equivalent only if:

- field-level data model and conditional validation rules match this document
- state transitions are exactly constrained to allowed table
- mother/variant promotion and fallback are deterministic as specified
- review quorum/re-review/admin override behavior is identical
- retention, contribution counting, and visibility rules are identical
- API contracts and key names expected by frontend remain compatible

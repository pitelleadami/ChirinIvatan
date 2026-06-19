# SPEC-03 Complete Rebuild Specification

Status: canonical rebuild source of truth
Last updated: 2026-06-13
Audience: future developers, auditors, thesis defense, deployment maintainers
Purpose: if the source code is lost, this document plus the companion specs must be enough to recreate the Chirin Ivatan system.

---

## 1. Product Summary

Chirin Ivatan is a community-governed digital preservation system for Ivatan language and folklore.

It has five product pillars:

1. Public archive:
   - landing page
   - dictionary viewer
   - folklore viewer
   - public profiles
   - Hall of Stewards leaderboards
   - FAQs and public project pages
2. Contribution workflow:
   - dictionary draft/revision builder
   - folklore draft/revision builder
   - own contribution list
3. Governance workflow:
   - reviewer/admin queues
   - approval quorum
   - rejection notes
   - re-review flagging
   - admin overrides
4. Community onboarding:
   - contributor applications
   - reviewer applications with written reason
   - reviewer/admin screening
   - email invitations
   - consultant/admin managed profiles
5. Recognition and operations:
   - contribution ledger
   - badges and levels
   - municipality rankings
   - in-app notifications
   - admin-managed public copy
   - admin-managed maintenance mode

Backend is Django. Frontend is Vite/React. Django is the source of truth. React displays and submits data but must not be trusted for validation, permissions, approval, or recognition logic.

---

## 2. Roles and Permissions

### 2.1 Role Storage

Use Django `User` plus Django groups.

Groups:

- `Contributor`
- `Reviewer`
- `Consultant`
- `Admin`

Superusers count as admins.

### 2.2 Role Meaning

Visitor:

- unauthenticated
- can browse public approved content
- can apply to join
- cannot submit contributions
- cannot review

Contributor:

- can create dictionary and folklore drafts
- can submit drafts for review
- can revise approved entries
- can see own contribution records
- can apply as reviewer

Reviewer:

- inherits contributor access
- can review dictionary and folklore submissions
- can approve, reject, and flag for re-review
- cannot review own submissions
- can screen contributor applications
- can participate in reviewer application quorum

Consultant:

- reviewer-level queue access
- appears as consultant in public/community contexts
- can be created or invited by admins

Admin:

- full reviewer access
- can manage people
- can hide/show users from leaderboard
- can edit public site content
- can upload FAQ media
- can enable maintenance mode
- can create consultant profiles
- can send consultant/admin invitations
- can perform admin overrides on entries under re-review

### 2.3 Lockout Prevention

Maintenance mode must never lock admins out. Login, auth status, Django admin, and site-content endpoints remain reachable during maintenance.

---

## 3. Data Strategy

### 3.1 Core Principles

1. Live data and proposed data are separate.
2. Public entries are not directly edited by ordinary users.
3. User submissions become revision snapshots.
4. Reviews act on revisions.
5. Approved revisions publish into live entries.
6. Review and onboarding decisions are audit records.
7. Contribution credit is awarded only from backend approval events.
8. Leaderboard/profile stats are cached but derived from authoritative records.
9. Uploaded media belongs in media storage, not Git.
10. Deployment configuration is environment-driven.

### 3.2 Database

Local:

- SQLite is acceptable for development.
- `backend/db.sqlite3` is local/generated and must not be committed.

Production:

- PostgreSQL.
- Database credentials come from environment variables.
- Required backup strategy: database dumps plus media directory/object-storage backup.
- Production must run an automated application data backup that captures PostgreSQL and media together.
- The newest backup must be smoke-tested by restoring the database dump into a temporary database and extracting the media archive into a temporary directory, without overwriting production.

### 3.3 Media

User uploaded media:

- dictionary photos: `dictionary/photos/`
- dictionary audio: `dictionary/audio/`
- folklore photos: `folklore/photos/`
- folklore audio: `folklore/audio/`
- profile photos: `users/profile_photos/`
- FAQ images: `site/faq/`

Media files must be served from `/media/` in production and backed up separately from Git.

---

## 4. Data Models

### 4.1 UserProfile

Purpose: profile metadata for public identity, filters, and visibility.

Fields:

- `user`: one-to-one Django user
- `municipality`: text
- `post_nominals`: text
- `affiliation`: text summary
- `occupation`: text summary
- `cultural_affiliations`: JSON list
- `other_affiliations`: JSON list
- `bio`: text
- `include_in_leaderboard`: boolean, admin controlled
- `show_on_yaru_chart`: boolean, admin controlled
- `show_live_contributions`: boolean, admin controlled
- `onboarding_prompt_pending`: boolean
- `onboarding_prompt_dismissed`: boolean
- `profile_photo`: optional image

Rules:

- Profile completion requires first name, last name, profile row, and municipality.
- Leaderboard hiding does not remove public contribution credits from profile pages.
- Only admins can toggle leaderboard participation.
- Accepting an email role invitation sets `onboarding_prompt_pending = true` and clears the dismissed flag.
- Dismissing or completing the one-time welcome flow clears the pending flag and sets the dismissed flag.

### 4.2 SiteContentSettings

Purpose: one-row admin-editable public content and operational mode.

Singleton key:

- `default`

Fields:

- `about_heading`
- `about_intro_paragraphs`: JSON list
- `about_body_paragraphs`: JSON list
- `about_rationale_paragraphs`: JSON list
- `about_future_paragraphs`: JSON list
- `about_final_quote`
- `yaru_heading`
- `yaru_intro_paragraphs`: JSON list
- `support_statements`: JSON list
- `partner_details`: JSON list
- `faq_sections`: JSON list
- `maintenance_enabled`: boolean
- `maintenance_message`: text
- `updated_by`
- `updated_at`

Rules:

- Empty support/partner rows are hidden publicly.
- FAQ sections can be role-scoped to visitor/contributor/reviewer/admin.
- Admins can upload FAQ images.
- Maintenance mode shows the message to visitors/non-admins and blocks non-admin public API calls with `503`.

### 4.3 Dictionary VariantGroup

Purpose: group term variants under one semantic unit.

Fields:

- `id`: UUID
- `mother_entry`: one-to-one nullable `Entry`
- `created_at`

Rules:

- Exactly one active mother term should exist when possible.
- If mother is archived/deleted, fallback mother is selected deterministically.
- General/General Ivatan entries can be promoted to mother.

### 4.4 Dictionary Entry

Purpose: current live/public dictionary state.

Identity and grouping:

- `id`: UUID
- `variant_group`
- `is_mother`

Semantic core fields:

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
- `inflected_forms`

Variant-specific fields:

- `term`
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

Current dictionary variant type labels:

- `Ivatan (Common Usage)`
- `Isamurungen`
- `Ivasayen`
- `Itbayaten`
- `Old / Historical Form`
- `Borrowed Form`
- `Newly Coined Term / Expression`

Attribution/governance:

- `audio_contributor`
- `photo_contributor`
- `status`
- `initial_contributor`
- `last_revised_by`
- `last_approved_by`
- `last_approved_at`
- `created_at`
- `archived_at`

Statuses:

- `draft`
- `pending`
- `approved`
- `approved_under_review`
- `rejected`
- `archived`
- `deleted`

Public visibility:

- visible if `approved` or `approved_under_review`

### 4.5 Dictionary EntryRevision

Purpose: dictionary submission or revision snapshot.

Fields:

- `id`: UUID
- `entry`: nullable FK to `Entry`
- `contributor`
- `proposed_data`: JSON snapshot
- `status`: `draft`, `pending`, `approved`, `rejected`
- `reviewer_notes`
- `is_base_snapshot`
- `created_at`
- `approved_at`

Snapshot fields:

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
- `variants` optional list for additional variants

Rules:

- New terms have `entry = null` until approved.
- First approved revision becomes permanent base snapshot.
- Approved non-base revision retention max is 20 per entry.
- Public sees base + last 5 approved revisions.
- Reviewer/admin sees base + last 15 approved/rejected recent revisions.
- Media licensing: `photo_license` and `audio_license` default to `CC BY-NC 4.0` on submission. A license is normalized to the platform default when the corresponding media (photo / self-recorded audio) is present, and cleared to empty when it is not. License changes follow the revision lifecycle.

### 4.6 FolkloreEntry

Purpose: current live/public folklore state.

Fields:

- `id`: UUID
- `title`
- `content`
- `category`
- `subcategory`
- `municipality_source`
- `source`
- `self_knowledge`
- `media_url`
- `photo_upload`
- `audio_upload`
- `media_source`
- `self_produced_media`
- `copyright_usage`
- `contributor`
- `status`
- `archived_at`
- `created_at`
- `updated_at`

Categories:

- `oral_narratives`
- `wisdom_expressions`
- `songs_poetry`
- `beliefs_ritual_life`
- `traditional_knowledge`

Subcategory map:

- `oral_narratives`: `myths`, `legends`, `folktales`, `oral_histories`
- `wisdom_expressions`: `proverbs`, `idioms`, `riddles`
- `songs_poetry`: `laji`, `songs`, `childrens_rhymes`, `poems`
- `beliefs_ritual_life`: `beliefs`, `rituals`, `prayers`
- `traditional_knowledge`: `fishing_knowledge`, `agriculture`, `boatbuilding`, `architecture`, `folk_medicine`, `weather_knowledge`, `crafts`

Municipality source choices:

- `Basco`
- `Mahatao`
- `Ivana`
- `Uyugan`
- `Sabtang`
- `Itbayat`
- `Not Applicable`

Validation:

- `title`, `content`, `category`, and `subcategory` are required.
- subcategory must belong to category.
- `source` is required unless `self_knowledge = true`.
- `media_source` is required when media exists unless `self_produced_media = true`.
- media exists if `media_url`, `photo_upload`, or `audio_upload` is present.
- default license on approval is `CC BY-NC 4.0`.
- license is immutable after approval; changes require revision lifecycle.

Legacy category values:

- `myth`, `legend`, `proverb`, `idiom`, `laji`, `poem` must normalize to the new category/subcategory pairs.

### 4.7 FolkloreRevision

Purpose: folklore submission or revision snapshot.

Fields:

- `id`: UUID
- `entry`: nullable FK to `FolkloreEntry` (null when revision_type = `variant`)
- `variant_of`: nullable FK to `FolkloreEntry` (set for variant submissions; tracks lineage back to source entry)
- `contributor`
- `proposed_data`: JSON snapshot
- `photo_upload`
- `audio_upload`
- `revision_type`: `revision` | `variant` (default `revision`)
- `status`: `draft`, `pending`, `approved`, `rejected`
- `reviewer_notes`
- `is_base_snapshot`
- `created_at`
- `approved_at`

`revision_type` semantics:

- `revision`: the original contributor is editing their own published entry. `entry` is set, `variant_of` is null. On approval, overwrites the existing `FolkloreEntry`.
- `variant`: any authenticated contributor, including the original contributor, may submit an alternate version. The public entry page must show this action to every authenticated user. `entry` is null (pre-publish), `variant_of` points to the source entry. On approval, `publish_revision` creates a brand-new `FolkloreEntry`; the revision row is then updated to point `entry` at the new entry.

Snapshot fields:

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

### 4.7.1 FolkloreMediaAsset

Purpose: image asset inserted inside a folklore rich-text draft.

Fields:

- `id`: UUID
- `revision`: nullable FK to `FolkloreRevision`
- `entry`: nullable FK to `FolkloreEntry`
- `uploaded_by`: FK to user
- `image`: uploaded image file
- `caption`: optional short caption
- `alt_text`: optional accessibility description
- `order`: integer ordering hint
- `self_produced`: boolean
- `source`: required when not self-produced
- `created_at`

Rules:

- A media asset must belong to either a revision or an entry.
- Draft/rejected revision owners can upload inline images through `POST /api/folklore/revisions/<revision_id>/media`.
- The rich text editor uploads an image immediately, including when the draft has no title or text yet, and inserts it as semantic `<figure><img><figcaption>` HTML.
- Each inserted image has an optional caption field directly beneath it inside the editor; browser prompt dialogs must not be used.
- The saved figure preserves the image URL, accessible alternative text, optional caption, and `data-media-id`.
- New folklore images are added through the rich-text editor only; the folklore form must not show a separate single-photo upload control.
- Inline image URLs are served through the normal media path and render in draft preview, review, and public folklore detail output.

### 4.8 FolkloreComment

Purpose: flat public comment thread on a published folklore entry.

Fields:

- `id`: UUID
- `entry`: FK to `FolkloreEntry` (CASCADE delete)
- `author`: FK to `User` (PROTECT)
- `body`: text, max 2000 characters
- `created_at`: datetime (auto, ascending order)

Rules:

- Any authenticated user may post a comment.
- Only the comment author or an admin/superuser may delete a comment.
- Comments are flat (no threading or nesting).
- Body must be non-empty and ≤ 2000 characters (enforced via `clean()`).
- Exposed in the API under the "Community Voices" section of the folklore detail page.

### 4.9 Review

Purpose: dictionary governance decision.

Fields:

- `id`: UUID
- `revision`
- `reviewer`
- `decision`: `approve`, `reject`, `flag`
- `notes`
- `review_round`
- `created_at`

Constraint:

- one reviewer can review a revision only once per round.

### 4.10 FolkloreReview

Purpose: folklore governance decision.

Fields mirror dictionary review:

- `id`
- `folklore_revision`
- `reviewer`
- `decision`
- `notes`
- `review_round`
- `created_at`

Constraint:

- one reviewer can review a folklore revision only once per round.

### 4.11 ReviewAdminOverride

Purpose: audit high-impact admin moderation.

Fields:

- `admin`
- `target_type`: `dictionary`, `folklore`
- `dictionary_entry`
- `folklore_entry`
- `action`: `force_reject`, `restore_approved`, `archive`
- `notes`
- `status_before`
- `status_after`
- `created_at`

Rules:

- only admins
- only entries under re-review
- notes required

### 4.12 RoleApplication

Fields:

- `applicant`
- `target_role`: `contributor`, `reviewer`
- `reviewer_reason`
- `status`: `pending`, `approved`, `rejected`
- `created_at`
- `updated_at`
- `decided_at`

Rules:

- reviewer applications require `reviewer_reason`.
- pending duplicate application for same role is rejected.
- users with active role access cannot apply for that same/lower access.

### 4.13 RoleApplicationDecision

Fields:

- `application`
- `decided_by`
- `decision`: `approve`, `reject`
- `notes`
- `created_at`

Rules:

- one decision per actor per application.
- self-decision forbidden.
- rejection requires notes.
- after an actor approves an application that still needs quorum, it must leave that actor's Pending list.
- the same application appears in that actor's Approved view with an `awaiting_quorum` classification until final approval.
- other eligible screeners who have not decided still see the application in Pending.

### 4.14 RoleOnboardingRecord

Purpose: final accountability trail for role access.

Fields:

- `user`
- `role`: `contributor`, `reviewer`, `consultant`, `admin`
- `method`: `invited`, `approved_application`, `admin_created`
- `invited_by`
- `approved_by_reviewers`
- `approved_by_admins`
- `source_application`
- `accountability_notes`
- `created_at`

### 4.15 RoleInvitation

Purpose: email invitation and claim flow.

Fields:

- `token`
- `email`
- `role`
- `invited_by`
- `accepted_by`
- `status`: `pending`, `accepted`, `revoked`
- `first_name`
- `last_name`
- `municipality`
- `notes`
- `expires_at`
- `created_at`
- `accepted_at`

Rules:

- new pending invite for same email+role revokes previous pending invite.
- consultant/admin invitations require admin.
- Invitation delivery uses `EmailMultiAlternatives`: a plain-text fallback plus a branded HTML alternative.
- The HTML invitation identifies the inviter and role, explains the role, and includes an accept button plus a visible fallback URL.

### 4.16 Notification

Purpose: durable, per-user in-app updates.

Fields:

- `id`: UUID
- `user`: recipient
- `notif_type`
- `message`
- `target_url`: optional internal route
- `is_read`
- `created_at`

Notification types:

- `submission_received`
- `revision_approved`
- `revision_rejected`
- `milestone`
- `comment_received`
- `role_decided`

Rules:

- Notifications are ordered newest first.
- Users can read only their own notifications.
- Submission and flag-for-re-review actions do not create notifications.
- Final approval/rejection decisions, final re-review approval/rejection, recognition milestones, comments on owned folklore entries, and role decisions create notifications.
- Rejection notifications include reviewer feedback when available.

### 4.17 ContributionEvent

Purpose: authoritative credit ledger.

Types:

- `dictionary_term`
- `folklore_entry`
- `revision`

Fields:

- `user`
- `contribution_type`
- `dictionary_entry`
- `folklore_entry`
- `entry_revision`
- `folklore_revision`
- `awarded_at`

Rules:

- original dictionary credit awarded once per user+entry.
- original folklore credit awarded once per user+entry.
- revision credit awarded once per user+entry lifetime.
- credit is historical and is not removed if content is later archived/deleted/rejected.

### 4.18 UserContributionStats

Purpose: cached user totals.

Fields:

- all-time: `combined_total`, `dictionary_original_total`, `folklore_original_total`, `total_rejections`, `review_completed_total`
- monthly: `dictionary_month`, `folklore_month`, `combined_month`, `last_month_calculated`
- recognition: `contributor_level`, `reviewer_level`, `unlocked_badges`
- `updated_at`

### 4.19 MunicipalityStats

Purpose: cached municipality totals.

Fields:

- `municipality`
- all-time: dictionary, folklore, combined
- monthly: dictionary, folklore, combined
- `last_month_calculated`
- `updated_at`

### 4.20 RecognitionEvent

Purpose: immutable recognition feed.

Types:

- `level_up`
- `badge_unlock`
- `municipality_win`

Fields:

- `user`
- `municipality`
- `event_type`
- `reference_id`
- `payload`
- `created_at`

### 4.21 GamificationConfig

Purpose: admin-editable thresholds/titles.

Fields:

- `name`
- `contributor_levels`
- `reviewer_levels`
- `dictionary_badges`
- `folklore_badges`
- `quality_badge`
- `updated_at`

Fallback defaults:

- contributor levels: Community Learner, Language Contributor, Cultural Steward, Heritage Guardian, Ivatan Archivist, Heritage Champion
- reviewer levels: Reviewer, Cultural Validator, Heritage Moderator, Senior Cultural Consultant
- dictionary badges: Word Contributor, Lexicon Builder, Language Preserver, Dictionary Steward, Master Lexicon Keeper
- folklore badges: Story Contributor, Folklore Weaver, Tradition Keeper, Cultural Narrator, Oral Historian
- quality badge: Accuracy Champion

### 4.22 MunicipalityMonthlyWinner and GamificationRuntimeState

Purpose:

- store monthly municipality winners
- remember last runtime periods/calculations

Use these for month-boundary recognition and repeatable recomputation.

---

## 5. State Machines

### 5.1 Entry State Machine

Applies to dictionary `Entry` and folklore `FolkloreEntry`.

Allowed states:

- `draft`
- `pending`
- `approved`
- `approved_under_review`
- `rejected`
- `archived`
- `deleted`

Allowed transitions:

- `draft -> pending`
- `pending -> approved`
- `pending -> rejected`
- `approved -> approved_under_review`
- `approved -> archived`
- `approved_under_review -> approved`
- `approved_under_review -> rejected`
- `rejected -> archived`
- `archived -> approved`
- `archived -> deleted`

No other transition is allowed.

### 5.2 Revision State Machine

Allowed states:

- `draft`
- `pending`
- `approved`
- `rejected`

Allowed flow:

- create as draft
- submit to pending
- review to approved or rejected

An approved live entry can have a pending revision without changing the live entry until approval quorum is met.

---

## 6. Review Governance

### 6.1 Initial Review

Reviewable target:

- pending dictionary revision
- pending folklore revision

Allowed decisions:

- `approve`
- `reject`

Rules:

- reviewer/admin only
- self-review forbidden
- reject requires notes
- one reject immediately rejects revision
- approve waits for quorum

Approval quorum:

- any two distinct reviewers/admins

On quorum:

- revision becomes approved
- approved timestamp is set
- live entry is created or updated
- base snapshot is set if this is first approval
- contribution credit is awarded

### 6.2 Re-review

Flagging:

- only approved public entries can be flagged
- flag requires notes
- flag creates a new review round
- entry becomes `approved_under_review`
- entry remains visible publicly

Re-review decisions:

- one Reject/Archive removes the published entry from public view by archiving it
- Return for Fixing creates an assigned correction draft from the selected approved snapshot
- returned correction drafts remain editable as draft revisions internally but appear in the assignee workspace as Needs Changes
- approval quorum restores entry to `approved`

### 6.3 Admin Override

Allowed only while entry is `approved_under_review`.

Actions:

- force reject
- restore approved
- archive

All require notes and create `ReviewAdminOverride`.

---

## 7. Dictionary Rules

### 7.1 Mother/Variant Rules

- variants share semantic core from mother
- variant-specific fields remain per entry
- if no group exists at first publish, create group and mark entry as mother
- General Ivatan can promote a variant to mother
- if mother is removed/archived, fallback mother is earliest approved non-archived variant

Fallback sort:

1. first approved time
2. entry creation time
3. UUID lexical order

### 7.2 Dictionary Source and Media Masking

Public hiding:

- hide term source when `term_source_is_self_knowledge`
- hide audio source when `audio_source_is_self_recorded`
- hide photo source when `photo_source_is_contributor_owned`
- hide audio contributor when same as initial contributor

Always show governance:

- last revised by
- reviewed/approved by
- contribution accountability where available

### 7.3 Dictionary Revision Form Must Include

Identity:

- draft/revision id
- target entry id if revising
- status

Term fields:

- term
- variant type
- pronunciation text
- phonetic
- audio upload/source/self-recorded

Semantic fields:

- meaning
- part of speech
- synonyms/antonyms
- inflected forms
- photo/source/contributor-owned

Usage fields:

- example sentence
- translation
- English translation is required whenever the main entry or a variant includes an Ivatan example sentence.
- Dictionary headwords are normalized to an uppercase first letter with the remaining letters lowercase.
- Meanings are normalized to an uppercase first character.
- Dictionary example sentences and translations are normalized as sentence text: obvious all-caps input is converted to sentence case, the first character is capitalized, and terminal punctuation is added when the contributor omitted it.
- Public attribution blocks show complete profile names, including an optional name extension (`Jr.`, `Sr.`, `II`, `III`, etc.) before any post-nominals; usernames are used only as a fallback.
- Person names are display-normalized when obvious all-caps input is detected; usernames are stored/displayed lowercase and are not treated as display names.
- Login resolves username handles case-insensitively before authentication so legacy accounts with mixed-case stored usernames remain able to sign in after password reset.
- Invalid login copy includes a generic lowercase-username hint without confirming whether an account exists.
- Profile affiliation rows and generated affiliation/occupation summaries use title-style capitalization for readability; post-nominals and credentials remain as entered.
- usage notes
- etymology
- source/self-knowledge

Variant tools:

- existing connected variants
- additional variant rows for multi-variant submission

Actions:

- save draft
- submit for review
- delete draft
- return to contribution list

---

## 8. Folklore Rules

### 8.1 Required Fields

Required:

- title
- content
- category
- subcategory
- municipality source

Conditional:

- source required unless self-knowledge
- media source required when media exists unless self-produced

### 8.2 Folklore Form Must Include

Identity:

- revision id
- target entry id if revising
- status

Content:

- title
- content
- category
- subcategory
- municipality source

Provenance:

- source
- self-knowledge checkbox
- copyright/license

Media:

- media URL
- photo upload
- audio upload
- media source
- self-produced media checkbox

Actions:

- save draft
- submit for review
- delete draft
- return to contribution list

### 8.3 Folklore Public Detail Must Include

- title
- category and subcategory label
- municipality source
- content
- media player/image/link if present
- contributor
- source unless masked
- media source unless masked
- license
- revision history
- reviewer/admin flag for re-review action when eligible

---

## 9. Recognition and Leaderboard Rules

### 9.1 Counters

All counters derive from database rows:

- contribution events
- rejected revisions
- completed review decisions

Frontend must never submit its own score.

### 9.2 Contributor Levels

Based on combined contribution count.

Default thresholds:

- 0: Community Learner
- 5: Language Contributor
- 20: Cultural Steward
- 50: Heritage Guardian
- 100: Ivatan Archivist
- 200: Heritage Champion

### 9.3 Reviewer Levels

Based on completed approve/reject review count.

Default thresholds:

- 0: Reviewer
- 10: Cultural Validator
- 50: Heritage Moderator
- 100: Senior Cultural Consultant

### 9.4 Badges

Dictionary badges use approved original dictionary count.

Folklore badges use approved original folklore count.

Quality badge uses combined approved contribution count plus max rejection rule.

Profile achievements must show all in-progress next badges by category:

- dictionary
- folklore
- quality

Earned badge sharing uses a single Share action per badge. The action opens an export modal where the user chooses either a square post image or vertical story image, previews the generated badge card, and downloads the image while a culturally affirming caption is copied to the clipboard. Captions must vary by badge family: dictionary captions emphasize language preservation, folklore captions emphasize cultural memory and storytelling, reviewer captions emphasize accuracy and stewardship, and quality captions emphasize care and trust.

### 9.5 Leaderboards

User appears only if:

- active
- has profile
- `include_in_leaderboard = true`
- has valid contributor/reviewer/consultant/admin role or superuser

Recognition filter:

- combined
- dictionary
- folklore

Period filter:

- current month
- all time

Municipality filter:

- All
- Basco
- Mahatao
- Ivana
- Uyugan
- Sabtang
- Itbayat

Mobile leaderboard table hides Recognition column.

Admin can hide/restore a user from leaderboard. Profile owner cannot.

---

## 10. Maintenance Mode

Admin location:

- Steward's Desk -> Site Content -> Site Maintenance Mode

Fields:

- checkbox: pause public site access
- textarea: visitor message

Visitor behavior:

- non-admins see maintenance page with message
- unauthenticated users can still reach login
- authenticated non-admins can log out

Backend behavior:

- non-admin public API calls return `503`
- response includes `maintenance_enabled = true`
- `Retry-After: 300`

Allowed during maintenance:

- `/admin/`
- `/api/auth/csrf`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/site-content`
- `/api/site-content/faq-media`
- `/static/`
- `/media/`

Admin users bypass maintenance restrictions.

---

## 11. API Endpoint Inventory

### 11.1 Auth

- `GET /api/auth/csrf`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/profile/onboarding/dismiss`

Login returns authenticated user plus groups/profile status and the two onboarding prompt flags.

### 11.2 Site Content

- `GET /api/site-content`
- `POST/PATCH /api/site-content` admin only
- `POST /api/site-content/faq-media` admin only

### 11.3 Profiles and Users

- `GET/PATCH /api/profile/my`
- `GET /api/users/<username>`
- `GET /api/users/<username>/cultural-stewardship`
- `GET /api/users/<username>/recognition-events`
- `POST /api/users/<username>/leaderboard-visibility` admin only
- `POST /api/users/<username>/public-visibility` admin only
- `GET /api/admin/users` admin only
- `GET /api/admin/users/<username>/activity` admin only

### 11.4 Role Onboarding

- `POST /api/users/role-applications`
- `GET /api/users/role-applications/my`
- `GET /api/users/role-applications/status`
- `POST /api/users/role-applications/claim-access`
- `POST /api/users/role-applications/<application_id>/decide`
- `POST /api/users/role-invitations`
- `GET /api/users/role-invitations/<token>`
- `POST /api/users/role-invitations/<token>/accept`
- `GET /api/admin/role-applications`
- `POST /api/admin/role-invitations/email`
- `POST /api/admin/consultant-profiles`

### 11.5 Dictionary

- `GET /api/dictionary/entries`
- `GET /api/dictionary/english-terms`
- `GET /api/dictionary/entries/<entry_id>`
- `GET /api/dictionary/revisions/my`
- `POST /api/dictionary/revisions/create`
- `PATCH /api/dictionary/revisions/<revision_id>`
- `POST /api/dictionary/revisions/<revision_id>/submit`
- `POST /api/dictionary/revisions/<revision_id>/delete`
- `POST /api/dictionary/entries/<entry_id>/revisions/start`

### 11.6 Folklore

- `GET /api/folklore/entries`
- `GET /api/folklore/entries/<entry_id>`
- `GET /api/folklore/revisions/my`
- `POST /api/folklore/revisions/create`
- `PATCH /api/folklore/revisions/<revision_id>`
- `POST /api/folklore/revisions/<revision_id>/submit`
- `POST /api/folklore/revisions/<revision_id>/delete`

Compatibility aliases:

- `GET /api/folklore/entries/my`
- `POST /api/folklore/entries/create`
- `PATCH /api/folklore/entries/<revision_id>/draft`
- `POST /api/folklore/entries/<revision_id>/submit`

### 11.7 Reviews

- `GET /api/reviews/dashboard`
- `POST /api/reviews/dictionary/submit`
- `POST /api/reviews/folklore/submit`
- `POST /api/reviews/admin/override`

### 11.8 Leaderboards and Yaru

- `GET /api/leaderboard/global`
- `GET /api/leaderboard/municipality`
- `GET /api/leaderboard/municipalities`
- `GET /api/leaderboard/municipality-winners`
- `GET /api/yaru/members`

### 11.9 Notifications

- `GET /api/notifications`
  - authentication required
  - returns `unread_count` and the newest 40 notification rows
- `POST /api/notifications/mark-read`
  - authentication required
  - empty body marks all unread rows
  - JSON `{ "ids": ["<uuid>"] }` marks only selected rows
  - the notification panel always shows its read-state control; it displays `Mark all as read` when unread rows exist and disabled `All read` otherwise

---

## 12. Screen Inventory and Required Contents

### 12.1 Global App Shell

Route: all pages

Must include:

- sticky top navigation
- brand/logo link to home
- authenticated notification bell with unread badge and recent-notification panel
- visitor links:
  - About the Project
  - The Digital Yaru
  - Dictionary
  - Folklore
  - Hall of Stewards
  - FAQs
  - Log In
- authenticated workspace menu:
  - My Profile
  - Steward's Desk
  - Reviews for reviewer/admin/consultant
  - Applications for reviewer/admin
  - Add New Dictionary Entry
  - Add New Folklore Entry
  - FAQs
  - Django Admin Console for admins
  - Log Out
- responsive mobile menu
- footer except home/login/maintenance
- maintenance screen override for non-admins when maintenance mode enabled

### 12.2 Home

Route: `/`

Must include:

- immersive first viewport with project logo/brand
- value statement
- Join the Digital Yaru button for visitors only
- dictionary exploration button
- folklore exploration button
- live dictionary/folklore entry counts
- featured/latest dictionary and folklore rows
- Hall of Stewards preview
- support statements when configured
- supporting organization details when configured
- no join button for contributors/reviewers/admins

### 12.3 Login

Route: `/login`

Must include:

- username input
- password input
- login button
- back to home button
- generic public error for backend/network failures
- no localhost/Django operational details for public visitors
- redirect rules:
  - pending one-time onboarding -> Steward's Desk welcome screen
  - reviewer non-admin without pending onboarding -> review section
  - other authenticated users -> Steward's Desk

### 12.4 About Project

Route: `/about`

Must include:

- admin-configured About heading
- intro/body/rationale/future paragraphs
- final quote
- support statements if populated
- supporting organization details if populated

### 12.5 Digital Yaru

Route: `/yaru`

Must include:

- admin-configured Yaru heading and intro
- public explanation of contributor/reviewer/consultant roles
- visible Yaru member/profile chart
- profile links
- application CTA for visitors/non-members
- no unnecessary join CTA for existing contributors/reviewers/admins

### 12.6 FAQs and Manual

Routes:

- `/faqs`
- `/manual`

Both render the FAQ page.

Must include:

- hero/title
- role-aware FAQ sections
- table of contents
- accordion/details questions
- answers with paragraphs, bullet lists, and optional images
- dictionary field guides for contributors/reviewers/admins
- no repeated "FAQ Section" kicker inside every section

### 12.7 Dictionary Viewer

Route: `/dictionary-view`

Must include:

- searchable/browsable approved dictionary list
- latest entries panel
- detail view for selected entry
- semantic core
- variant section
- connected variants
- media playback/image display
- contributor and attribution area
- masked source rules
- revision history
- add/revise actions depending on role
- reviewer/admin flag-for-re-review action with required notes for eligible approved entries

### 12.8 Dictionary Draft Builder

Route: `/dictionary-draft`

Must include:

- create new draft mode
- edit draft by `revision_id`
- revise entry by `entry_id`
- term, meaning, part of speech
- source/self-knowledge fields
- pronunciation, phonetic, audio upload/source/self-recorded
- photo upload/source/contributor-owned
- examples, usage, etymology
- synonyms/antonyms
- inflected forms
- variant additions
- field guide links to FAQ anchors
- save draft
- submit for review
- delete draft
- own draft/revision list
- success/error feedback

### 12.9 Folklore Viewer

Route: `/folklore-view`

Must include:

- category/subcategory browsing
- approved folklore list
- detail view
- content
- source/media masking
- media URL/photo/audio rendering
- contributor attribution
- license
- revision history
- add/revise actions by role
- reviewer/admin flag-for-re-review action with required notes for eligible approved entries

### 12.10 Folklore Draft Builder

Route: `/folklore-draft`

Must include:

- create new draft mode
- edit draft by `revision_id`
- title/content
- category/subcategory
- municipality source
- source/self-knowledge
- media URL/photo/audio
- media source/self-produced
- copyright/license notice
- save draft
- submit for review
- delete draft
- own draft/revision list
- validation messages for conditional source/media rules

### 12.11 Reviewer Dashboard

Route: `/dashboard`

Must include:

- auth gate for reviewer/admin/consultant
- dictionary pending submissions
- dictionary re-review queue
- folklore pending submissions
- folklore re-review queue
- review action controls:
  - approve
  - reject with notes
  - flag with notes where supported
- full review preview must render submitted media and metadata needed for evaluation:
  - dictionary audio/photo URLs, source and license fields, variants with variant audio, etymology, examples, and related words
  - folklore rich text content, uploaded photo/audio, external media URL, source/media source, and license
- no self-submissions in queues
- my recent reviews
- items awaiting quorum after my approval

### 12.12 Steward's Desk

Route: `/admin-applications`

Must include tabs/sections:

- Overview/activity
- Reviews
- Applications
- Invitations
- People
- Contributions
- Site Content

Applications section:

- list role applications
- show target role/status
- show reviewer reason
- approve/reject with notes
- show quorum/progress
- Pending contains only applications on which the signed-in screener can still act.
- Approved also contains applications approved by the signed-in screener that are awaiting another required approval.
- quorum-pending approvals must be labeled `Awaiting final approval` and must not show approve/reject actions to the same screener.
- successful approve/reject actions show a compact popup notification instead of a duplicate inline success banner.
- approval notification states whether access is active or another required approver must still decide.

Invitations section:

- invite existing user into role
- send email role invitation
- show invitation status
- email invitation form collects only email, role, and endorsement notes.
- invited users provide first name, last name, municipality, username, and password when accepting.

People section:

- searchable approved/active role holders
- include admins, consultants, reviewers, contributors, and role-assigned test accounts
- exclude registered-only users whose contributor/reviewer applications are pending or rejected
- keep an existing contributor visible while a separate reviewer application is pending
- view user activity
- admin public visibility controls
- admin leaderboard visibility controls
- show the managed consultant profile panel last, after the people directory and related controls
- create managed consultant profile

Contributions section:

- own dictionary contributions
- own folklore contributions
- separate status tabs for `rejected`, `draft`, `approved`, and `pending`
- user-facing labels in this order: Needs Changes, Drafts, Approved, Submitted for Review
- status counts and clear timestamps/status descriptions
- rejected cards show reviewer feedback directly
- rejected cards link back to the same revision for correction and resubmission
- assigned correction drafts from Return for Fixing count under Needs Changes even though their stored revision status remains `draft`
- create entry buttons
- edit draft/revision buttons
- view public entry links

Site Content section:

- maintenance mode toggle/message
- About copy editor
- Yaru copy editor
- support statement rows
- partner detail rows
- FAQ section editor
- FAQ item editor
- role visibility checkboxes
- FAQ image URL/upload
- sticky save bar

### 12.13 Public Profile

Route: `/profile-view?username=<username>`

Must include:

- avatar/photo/fallback
- display name and username
- municipality, affiliation, occupation, post-nominals
- bio
- role/accountability labels
- contribution summary
- live contributions when public flag allows
- achievements:
  - earned badges
  - next in-progress dictionary badge
  - next in-progress folklore badge
  - quality badge progress
  - full badge catalog in modal
  - share export modal for earned badges with square post and vertical story formats
- recognition events
- cultural stewardship
- edit profile button only for owner
- apply as reviewer button for contributor owner only
- admin-only visibility controls
- admin-only hide from leaderboard control

Leaderboard recognition sharing uses one Share action for the profile leaderboard card and one Share action for the user's municipality card. Each opens the same export modal pattern: choose square post or vertical story format, preview the generated image, then download the image and copy a caption that frames the recognition as cultural stewardship rather than simple ranking.

### 12.14 Profile Edit

Route: `/profile-edit`

Must include:

- first name
- last name
- municipality
- post-nominals
- affiliation/cultural affiliation fields
- occupation/other affiliation fields
- bio
- profile photo upload
- save button
- no leaderboard visibility control

### 12.15 Hall of Stewards

Route: `/leaderboards`

Must include:

- archive counts
- filters label
- recognition filter
- period filter
- municipality filter
- refresh button
- individual ranking table
- municipality ranking panel
- share rank/share municipality actions for authenticated users
- profile links
- mobile compact filters
- mobile hide Recognition column

### 12.16 Role Center

Route: `/roles`

Must include:

- contributor/reviewer role cards
- application status panel
- ability to apply as contributor for visitors
- ability for contributor to apply as reviewer
- reviewer reason textarea required
- refresh my applications
- application submitted popup for authenticated users
- public status checker
- claim approved access flow
- invitation acceptance flow
- invitation acceptance activates the role and schedules the one-time welcome prompt for the first login
- login navigation
- hide general thank-you copy for existing contributors/reviewers

### 12.17 Maintenance Screen

Virtual screen controlled by site content.

Must include:

- maintenance heading
- admin-entered maintenance message
- Admin Login button for unauthenticated users
- Log Out button for authenticated non-admin users
- no public navigation into paused workflows

---

## 13. Validation and Error Rules

General:

- invalid JSON -> 400
- unauthenticated protected endpoint -> 401
- insufficient role -> 403
- missing target -> 404
- maintenance -> 503

Review:

- reject requires notes
- flag requires notes
- self-review forbidden
- duplicate decision per round forbidden

Onboarding:

- reviewer reason required for reviewer application
- rejection requires notes
- self-decision forbidden
- duplicate decision forbidden
- the welcome prompt is shown only while pending and not dismissed
- dismissing the welcome prompt persists across later logins

Notifications:

- unauthenticated notification requests return 401
- users cannot list or mark another user's notifications
- notification target URLs must be internal application routes

Public login:

- do not expose backend localhost/Django startup messages to visitors
- infrastructure errors become generic public sign-in message

---

## 14. Lifecycle Maintenance

Command:

- `python3 manage.py run_lifecycle_maintenance`

Rules:

- rejected dictionary entries with no revision activity for 1 year auto-archive
- rejected folklore entries with no activity for 1 year auto-archive
- archived dictionary/folklore entries after 1 additional year auto-delete
- stale rejected dictionary revisions after 1 year can be deleted
- dictionary media files are deleted with deleted dictionary entries/stale rejected revisions where applicable
- contribution ledger remains historical

---

## 15. Deployment and Environment

Backend env variables:

- `DJANGO_DEBUG`
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CSRF_TRUSTED_ORIGINS`
- `DJANGO_CORS_ALLOWED_ORIGINS`
- `DJANGO_CSRF_COOKIE_DOMAIN`
- `DJANGO_SESSION_COOKIE_DOMAIN`
- `FRONTEND_BASE_URL`
- email SMTP variables
- database variables
- secure cookie/HSTS variables
- `DJANGO_STATIC_ROOT`
- `DJANGO_MEDIA_ROOT`

Security defaults:

- `DJANGO_DEBUG` defaults to `False`; local development must explicitly set `DJANGO_DEBUG=True`.
- `DJANGO_SECRET_KEY` is mandatory when debug is not true.
- The backend must fail startup in staging/production if `DJANGO_SECRET_KEY` is missing rather than using a committed fallback secret.

Production frontend:

- split-origin: `VITE_API_BASE=https://api.chirinivatan.com`
- same-origin reverse proxy: `VITE_API_BASE=`

Production management-command invariant:

- Every production Django management command must load `<app-root>/backend/.env.production` and use `<app-root>/backend/.venv/bin/python`.
- Bare `python3 manage.py ...` commands are forbidden in production because they may target fallback SQLite instead of the PostgreSQL database used by Gunicorn.
- Before applying schema changes, print and verify `settings.DATABASES['default']['ENGINE']` and `settings.DATABASES['default']['NAME']`.
- After migration, verify migration state using the same environment, restart the backend, exercise the affected endpoint, and inspect service logs.

Production checklist:

- load the production environment and verify the PostgreSQL target
- migrate using the production virtual environment and environment variables
- verify migration state using the same environment
- collectstatic
- build frontend
- restart gunicorn
- reload nginx
- verify SSL
- smoke test public pages and admin/reviewer flows

---

## 16. Rebuild Order

If rebuilding from scratch:

1. Create Django project/apps: users, dictionary, folklore, reviews.
2. Implement models and migrations from this spec.
3. Implement settings/env handling.
4. Implement services:
   - role onboarding
   - dictionary publishing
   - folklore publishing
   - reviews/quorum
   - contribution awards
   - recognition recompute
   - maintenance middleware
5. Implement API endpoints exactly as listed.
6. Implement React routes/screens exactly as listed.
7. Add custom assets:
   - logo
   - badge images
   - category images
   - municipality flags
   - landing/background images
8. Run backend tests for users/reviews/dictionary/folklore.
9. Run frontend build.
10. Deploy with PostgreSQL, media/static paths, nginx, gunicorn, SSL.

---

## 17. Rebuild Acceptance Gates

Must pass:

- `python3 manage.py makemigrations --check --dry-run`
- `python3 manage.py check`
- `python3 manage.py test users reviews dictionary folklore`
- `npm run build`

Manual QA must confirm:

- visitor browsing
- login/profile completion
- contributor dictionary draft submit
- contributor folklore draft submit
- reviewer approval quorum
- rejection notes
- flag/re-review flow
- admin override
- role application/reviewer reason
- email invitation
- HTML invitation alternative and plain-text fallback
- one-time post-invitation welcome screen and persistent dismissal
- notification bell, unread count, navigation targets, and read state
- own contribution status tabs and visible reviewer feedback on rejected submissions
- consultant profile
- site content save
- FAQ role visibility
- maintenance mode
- leaderboard filters and admin-only hiding
- badge progress and modal catalog
- production smoke test after deployment

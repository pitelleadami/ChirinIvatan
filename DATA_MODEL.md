# Chirin Ivatan Data Model and Data Strategy

Status: current implementation map
Last updated: 2026-06-28
Canonical detailed companions: `docs/SYSTEM_REQUIREMENTS.md` and `docs/SPEC-03_DEVELOPER_HANDOFF_SPEC.md`

This document explains how data is stored, governed, credited, displayed, retained, and protected in Chirin Ivatan.

---

## 1. System Data Philosophy

Chirin Ivatan is revision-centric and governance-first.

Core strategy:

1. Live public records are separate from submissions.
2. Submissions are stored as revision snapshots.
3. Reviews act on revisions.
4. Approved revisions publish into live records.
5. Governance decisions are stored as audit records.
6. Contribution credit is awarded only by backend approval logic.
7. Leaderboards and badges are computed from authoritative backend data.
8. Public visibility is controlled by role, status, masking flags, and admin visibility settings.
9. Media is stored outside Git and must be backed up separately.
10. Operations such as maintenance mode are admin-managed and backend-enforced.

---

## 2. Storage Layers

### 2.1 Database

Local development:

- SQLite via `backend/db.sqlite3`
- ignored by Git

Production:

- PostgreSQL
- configured through environment variables
- must be backed up independently

### 2.2 Media Storage

User-uploaded files are stored under Django `MEDIA_ROOT`.

Media paths:

- dictionary photos: `dictionary/photos/`
- dictionary audio: `dictionary/audio/`
- folklore photos: `folklore/photos/`
- folklore audio: `folklore/audio/`
- profile photos: `users/profile_photos/`
- FAQ media: `site/faq/`

Media must be included in deployment backup strategy.

### 2.3 Frontend Assets

Bundled assets live under `frontend/src/assets/`.

Examples:

- logo
- badges
- folklore category images
- dictionary/folklore page backgrounds
- municipality flags
- landing hero image

These are Git-tracked source assets, unlike user-uploaded media.

---

## 3. App Ownership

`users` owns:

- profiles
- roles
- applications
- invitations
- onboarding records
- contribution ledger
- recognition stats
- leaderboard visibility
- site content
- maintenance mode

`resources` owns:

- steward learning documents
- private PDF/presentation file storage
- role-aware resource visibility

`dictionary` owns:

- dictionary live entries
- dictionary revisions
- variant groups
- dictionary publication rules

`folklore` owns:

- folklore live entries
- folklore revisions
- folklore taxonomy
- folklore publication rules

`reviews` owns:

- dictionary review decisions
- folklore review decisions
- admin overrides
- review quorum logic

---

## 4. User and Role Data

Authentication uses Django `User`.

Role access uses Django groups:

- `Contributor`
- `Reviewer`
- `Consultant`
- `Admin`

`UserProfile` extends identity with:

- municipality
- post-nominals
- affiliation/occupation summaries
- cultural affiliations JSON
- other affiliations JSON
- bio
- profile photo
- leaderboard visibility
- public Yaru chart visibility
- live contribution visibility

Data handling rules:

- profile completion requires first name, last name, municipality, and profile row.
- public profile data is visible through profile APIs.
- admin can hide a user from leaderboard without removing credits.
- profile owners cannot hide themselves from leaderboard.

---

## 5. Site Content and Maintenance Data

`SiteContentSettings` is a singleton row keyed by `default`.

It stores:

- About page copy
- Digital Yaru copy
- support statements
- partner details
- FAQ sections
- FAQ role visibility
- maintenance enabled flag
- maintenance message
- updater and timestamp

Maintenance mode:

- visitors/non-admins see the maintenance page
- non-admin public API calls receive `503`
- admins can still log in and disable maintenance

### 5.1 Learning Resource Documents

`ResourceDocument` stores steward-facing PDF and presentation files. It is
separate from public site copy and from user-submitted dictionary/folklore media.

It contains:

- title
- slug
- description
- category
- uploaded file
- visibility
- published/hidden status
- uploader
- timestamps

Accepted file types:

- PDF
- PPT/PPTX
- PPS/PPSX

Visibility rules:

- anonymous visitors cannot list or open resource documents.
- `public` means all signed-in stewards, not anonymous public visitors.
- `members` means logged-in accounts.
- `admin` means admins, reviewers, consultants, and superusers.
- admins manage resources from Steward's Desk -> Resources.

---

## 6. Dictionary Data

### 6.1 Live Entry

`Entry` stores current public dictionary state.

It contains:

- term
- meaning
- part of speech
- pronunciation text
- phonetic spelling
- variant type
- source and self-knowledge flag
- usage notes
- etymology
- example sentence and translation
- synonyms and antonyms
- inflected forms JSON
- audio and audio source
- photo and photo source
- contributor/approver attribution
- status and timestamps

Public statuses:

- `approved`
- `approved_under_review`

### 6.2 Revision

`EntryRevision` stores proposed dictionary snapshots.

It contains:

- target entry, nullable for new terms
- contributor
- proposed JSON data
- status
- reviewer notes
- base snapshot flag
- created and approved timestamps

Rules:

- new term revisions have no entry until approved.
- approved revision publishes into `Entry`.
- first approved revision becomes permanent base snapshot.
- approved non-base revision retention max is 20.

### 6.3 Variant Groups

`VariantGroup` groups variants under one semantic unit.

Rules:

- one active mother entry when possible.
- variants inherit semantic core from mother.
- variant-specific pronunciation/source/example fields remain per variant.
- if mother is removed/archived, fallback mother is deterministic.

---

## 7. Folklore Data

### 7.1 Live Folklore Entry

`FolkloreEntry` stores current public folklore state.

It contains:

- title
- content
- category
- subcategory
- municipality source
- source/self-knowledge
- media URL
- photo upload
- audio upload
- media source/self-produced media
- copyright/license
- contributor
- status and timestamps

Categories:

- oral narratives
- wisdom and expressions
- songs and poetry
- beliefs and ritual life
- traditional knowledge

Validation:

- title, content, category, and subcategory are required.
- source is required unless self-knowledge.
- media source is required when media exists unless self-produced.
- license defaults to `CC BY-NC 4.0` on approval.
- license is immutable after approval.

### 7.2 Folklore Revision

`FolkloreRevision` stores proposed folklore snapshots.

It contains:

- target entry, nullable for new entries
- contributor
- proposed JSON data
- photo/audio uploads
- status
- reviewer notes
- base snapshot flag
- created and approved timestamps

---

## 8. Review Data

Dictionary reviews use `Review`.

Folklore reviews use `FolkloreReview`.

Both store:

- target revision
- reviewer
- decision
- notes
- review round
- timestamp

Decisions:

- `approve`
- `reject`
- `flag`

Governance rules:

- reviewer/admin only
- self-review forbidden
- reject requires notes
- flag requires notes
- one review per reviewer per round
- approval quorum is either two reviewers or one reviewer plus one admin
- initial pending queues exclude the signed-in user's own submissions.
- pending queues are ordered newest submission first.
- after one reviewer/admin rejects an initial pending revision, that revision is
  rejected immediately and must not remain in awaiting-quorum queues.
- after a reviewer/admin approves an item that still needs quorum, that same
  actor sees it only in their awaiting-quorum list; other eligible reviewers can
  still see and decide it.
- in post-publish re-review, Return for Fixing creates an assigned correction
  draft; Reject/Archive removes the live entry from public view.

`ReviewAdminOverride` stores:

- admin actor
- target type
- target entry
- override action
- notes
- before/after status
- timestamp

---

## 9. Role Onboarding Data

`RoleApplication` stores role applications.

It includes:

- applicant
- target role
- reviewer reason
- status
- timestamps

Reviewer applications require a reason.

Role application rules:

- pending duplicate applications for the same email/role are blocked.
- if an email belongs to an approved but unclaimed application, admins can resend
  the setup link and the applicant should use the activation email.
- rejected applications do not appear in the ordinary People list unless the
  applicant also has an active role.
- existing contributors may still apply for reviewer access.

`RoleApplicationDecision` stores:

- application
- decider
- approve/reject decision
- notes
- timestamp

`RoleOnboardingRecord` stores final accountability:

- role granted
- method
- inviter
- approvers
- source application
- notes

`RoleInvitation` stores email invitation tokens and acceptance state.

---

## 10. Contribution and Recognition Data

`ContributionEvent` is the authoritative credit ledger.

Types:

- original dictionary term
- original folklore entry
- approved revision

Credit rules:

- awarded only after approval.
- original credit is once per user+entry.
- revision credit is once per user+entry lifetime.
- credit remains historical even if content is later archived or deleted.

`UserContributionStats` caches user totals, levels, and unlocked badges.

`MunicipalityStats` caches municipality totals.

`RecognitionEvent` stores immutable recognition feed rows.

`GamificationConfig` stores thresholds and badge/level rules.

---

## 11. Lifecycle and Retention

Revision retention:

- first approved/base snapshot is permanent.
- max 20 approved non-base revisions retained per entry.
- public sees base + last 5 approved revisions.
- reviewer/admin sees base + last 15 approved/rejected recent revisions.

Lifecycle maintenance:

- rejected entries inactive for 1 year can auto-archive.
- archived entries after another year can auto-delete.
- stale rejected dictionary revisions can be deleted.
- contribution credit is not deleted with content.

---

## 12. Security and Privacy Handling

Authentication:

- session-based Django auth
- CSRF required for writes

Production security:

- HTTPS
- secure cookies
- trusted CSRF origins
- CORS allowlist if split-origin
- HSTS in production

Privacy masking:

- dictionary term source hidden when self-knowledge.
- dictionary audio source hidden when self-recorded.
- dictionary photo source hidden when contributor-owned.
- folklore source hidden when self-knowledge.
- folklore media source hidden when self-produced.

Operational privacy:

- public users do not see backend localhost/Django startup errors.
- admins can view operational details through admin surfaces.

---

## 13. Rebuild References

Use this file for the data model overview.

Use `docs/SYSTEM_REQUIREMENTS.md` and `docs/SPEC-03_DEVELOPER_HANDOFF_SPEC.md` for:

- all models and fields
- all screens
- API endpoints
- permissions
- lifecycle rules
- deployment requirements
- implementation and handoff expectations

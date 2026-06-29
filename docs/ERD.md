# Chirin Ivatan — Entity Relationship Diagram

> Auto-generated from backend models. All PKs are UUID unless noted.

## How To Read This ERD

This ERD describes how the main database tables relate to one another. It is
more detailed than the system architecture ERD because it includes support
tables for role applications, admin actions, recognition, site content, and
runtime settings.

Use this guide while reading the diagram:

- **User** is the account table. Most actions connect back to a user.
- **Profile and stats** extend a user with public profile details and cached
  contribution totals.
- **Entry** is a dictionary term. Related dialect or spelling forms are grouped
  through **VariantGroup**.
- **EntryRevision** is the submitted dictionary snapshot that reviewers evaluate.
- **FolkloreEntry** is a published or in-progress folklore record.
- **FolkloreRevision** is the submitted folklore snapshot that reviewers evaluate.
- **Review** and **FolkloreReview** record reviewer/admin decisions.
- **ContributionEvent** is the official credit ledger for levels, badges, and
  leaderboards.
- **RoleApplication**, **RoleInvitation**, and **RoleOnboardingRecord** document
  how people receive contributor/reviewer/admin access.

Cardinality shorthand:

| Symbol   | Meaning      | Example                           |
| -------- | ------------ | --------------------------------- | -------------------------------------------- | ------------------------ |
| `        |              | `                                 | exactly one                                  | one user has one profile |
| `o       | `            | zero or one                       | a variant group may point to one mother term |
| `o{`     | zero or many | one entry may have many revisions |
| `}o--o{` | many-to-many | users can belong to many groups   |

## Domain Summary

| Area              | Main entities                                                                  | Purpose                                                                |
| ----------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Accounts          | User, Group, UserProfile                                                       | Login identity, roles, public profile, visibility settings             |
| Role onboarding   | RoleApplication, RoleApplicationDecision, RoleInvitation, RoleOnboardingRecord | Tracks applications, invites, approvals, reminders, and accountability |
| Dictionary        | VariantGroup, Entry, EntryRevision                                             | Stores terms, variants, semantic fields, source/media data, revisions  |
| Folklore          | FolkloreEntry, FolkloreRevision, FolkloreComment                               | Stores folklore content, category/source/media data, variants/comments |
| Review governance | Review, FolkloreReview, ReviewAdminOverride                                    | Stores review decisions and privileged moderation actions              |
| Recognition       | ContributionEvent, UserContributionStats, RecognitionEvent, MunicipalityStats  | Tracks contribution credit, badges, levels, and leaderboard aggregates |
| Site operations   | SiteContentSettings, GamificationConfig, GamificationRuntimeState              | Stores editable site content and runtime configuration                 |

## Core Data Flow

The most important pattern is the **revision-first workflow**:

1. A contributor saves or submits a draft.
2. The system stores the submitted content as a revision snapshot.
3. Reviewers/admins evaluate the revision.
4. If approved, the revision is published into the live entry table.
5. A contribution event is recorded for recognition and leaderboard accounting.

That pattern is used for both dictionary and folklore content.

```mermaid
erDiagram

    %% ─────────────────────────────────────────
    %%  AUTH  (Django built-in)
    %% ─────────────────────────────────────────

    User {
        int      id PK
        string   username
        string   email
        string   first_name
        string   last_name
        bool     is_active
        bool     is_staff
        bool     is_superuser
        datetime date_joined
        datetime last_login
    }

    Group {
        int    id PK
        string name
    }

    User }o--o{ Group : "belongs to"

    %% ─────────────────────────────────────────
    %%  USERS APP
    %% ─────────────────────────────────────────

    UserProfile {
        uuid    id PK
        string  municipality
        string  post_nominals
        string  affiliation
        string  occupation
        json    cultural_affiliations
        json    other_affiliations
        text    bio
        bool    include_in_leaderboard
        bool    show_on_yaru_chart
        bool    show_live_contributions
        image   profile_photo
    }

    UserContributionStats {
        uuid     id PK
        int      combined_total
        int      dictionary_original_total
        int      folklore_original_total
        int      total_rejections
        int      review_completed_total
        int      dictionary_month
        int      folklore_month
        int      combined_month
        string   last_month_calculated
        int      contributor_level
        int      reviewer_level
        json     unlocked_badges
        datetime updated_at
    }

    ContributionEvent {
        uuid     id PK
        string   contribution_type
        datetime awarded_at
    }

    UserSessionEvent {
        uuid     id PK
        string   event_type
        string   ip_address
        string   user_agent
        datetime created_at
    }

    AdminAccountAction {
        uuid     id PK
        string   action
        string   role
        text     notes
        string   status_before
        string   status_after
        string   flag_status
        datetime resolved_at
        text     resolution_notes
        datetime created_at
    }

    RoleApplication {
        uuid     id PK
        string   target_role
        text     reviewer_reason
        string   status
        datetime created_at
        datetime updated_at
        datetime decided_at
    }

    RoleApplicationDecision {
        uuid     id PK
        string   decision
        text     notes
        datetime created_at
    }

    RoleOnboardingRecord {
        uuid     id PK
        string   role
        string   method
        text     accountability_notes
        datetime created_at
    }

    RoleInvitation {
        uuid     id PK
        uuid     token
        string   email
        string   role
        string   status
        string   first_name
        string   last_name
        string   municipality
        text     notes
        datetime expires_at
        datetime created_at
        datetime accepted_at
    }

    RecognitionEvent {
        uuid     id PK
        string   municipality
        string   event_type
        string   reference_id
        json     payload
        datetime created_at
    }

    GamificationConfig {
        string   name PK
        json     contributor_levels
        json     reviewer_levels
        json     dictionary_badges
        json     folklore_badges
        json     quality_badge
        datetime updated_at
    }

    GamificationRuntimeState {
        string   key PK
        string   last_winner_processed_month
        datetime updated_at
    }

    MunicipalityStats {
        string   municipality PK
        int      dictionary_all_time
        int      folklore_all_time
        int      combined_all_time
        int      dictionary_month
        int      folklore_month
        int      combined_month
        string   last_month_calculated
        datetime updated_at
    }

    MunicipalityMonthlyWinner {
        uuid     id PK
        string   month_key
        string   metric
        string   municipality
        int      score
        datetime created_at
    }

    SiteContentSettings {
        string   key PK
        string   brand_name
        string   brand_logo_url
        text     landing_intro_text
        text     landing_body_text
        json     about_intro_paragraphs
        json     about_body_paragraphs
        json     support_statements
        json     partner_details
        json     faq_sections
        json     privacy_notice_paragraphs
        json     contributor_agreement_paragraphs
        bool     maintenance_enabled
        text     maintenance_message
        datetime updated_at
    }

    %% ─────────────────────────────────────────
    %%  DICTIONARY APP
    %% ─────────────────────────────────────────

    VariantGroup {
        uuid     id PK
        datetime created_at
    }

    Entry {
        uuid     id PK
        bool     is_mother
        string   term
        string   part_of_speech
        string   pronunciation_text
        string   phonetic
        text     meaning
        text     usage_notes
        text     etymology
        text     example_sentence
        text     example_translation
        text     source_text
        bool     term_source_is_self_knowledge
        string   english_synonym
        string   ivatan_synonym
        string   english_antonym
        string   ivatan_antonym
        image    photo
        text     photo_source
        bool     photo_source_is_contributor_owned
        file     audio_pronunciation
        text     audio_source
        bool     audio_source_is_self_recorded
        string   variant_type
        json     inflected_forms
        string   status
        datetime last_approved_at
        datetime created_at
        datetime archived_at
    }

    EntryRevision {
        uuid     id PK
        json     proposed_data
        string   status
        text     reviewer_notes
        bool     is_base_snapshot
        datetime created_at
        datetime approved_at
    }

    %% ─────────────────────────────────────────
    %%  FOLKLORE APP
    %% ─────────────────────────────────────────

    FolkloreEntry {
        uuid     id PK
        string   title
        text     content
        string   category
        string   subcategory
        string   municipality_source
        text     source
        bool     self_knowledge
        string   media_url
        image    photo_upload
        file     audio_upload
        text     media_source
        bool     self_produced_media
        string   copyright_usage
        string   status
        datetime created_at
        datetime updated_at
        datetime archived_at
    }

    FolkloreRevision {
        uuid     id PK
        json     proposed_data
        image    photo_upload
        file     audio_upload
        string   status
        string   revision_type
        text     reviewer_notes
        bool     is_base_snapshot
        datetime created_at
        datetime approved_at
    }

    FolkloreComment {
        uuid     id PK
        text     body
        datetime created_at
    }

    %% ─────────────────────────────────────────
    %%  REVIEWS APP
    %% ─────────────────────────────────────────

    Review {
        uuid     id PK
        string   decision
        text     notes
        int      review_round
        datetime created_at
    }

    FolkloreReview {
        uuid     id PK
        string   decision
        text     notes
        int      review_round
        datetime created_at
    }

    ReviewAdminOverride {
        uuid     id PK
        string   target_type
        string   action
        text     notes
        string   status_before
        string   status_after
        datetime created_at
    }

    %% ═══════════════════════════════════════════
    %%  RELATIONSHIPS
    %% ═══════════════════════════════════════════

    %% — User ↔ profile & stats (1:1) —
    User ||--|| UserProfile                : "has profile"
    User ||--|| UserContributionStats      : "has stats"

    %% — User → activity logs —
    User ||--o{ ContributionEvent          : "earns"
    User ||--o{ UserSessionEvent           : "logs session"
    User ||--o{ RecognitionEvent           : "receives"

    %% — User → admin actions —
    User ||--o{ AdminAccountAction         : "is target of"
    User ||--o{ AdminAccountAction         : "performs (admin)"
    User ||--o{ AdminAccountAction         : "resolves flag"

    %% — User → role lifecycle —
    User ||--o{ RoleApplication            : "applies for"
    User ||--o{ RoleApplicationDecision    : "decides on"
    User ||--o{ RoleOnboardingRecord       : "is onboarded via"
    User }o--o{ RoleOnboardingRecord       : "approved by (reviewers M2M)"
    User }o--o{ RoleOnboardingRecord       : "approved by (admins M2M)"
    User ||--o{ RoleInvitation             : "sends"
    User ||--o{ RoleInvitation             : "accepts"

    %% — Role lifecycle internals —
    RoleApplication ||--o{ RoleApplicationDecision : "receives"
    RoleApplication |o--o{ RoleOnboardingRecord    : "sources"

    %% — Site config —
    User ||--o{ SiteContentSettings        : "last updated by"

    %% — User → dictionary contributions —
    User ||--o{ Entry                      : "initial contributor"
    User ||--o{ Entry                      : "last revised by"
    User }o--o{ Entry                      : "approved by (M2M)"
    User ||--o{ Entry                      : "audio contributor"
    User ||--o{ Entry                      : "photo contributor"
    User ||--o{ EntryRevision              : "submits"

    %% — User → folklore contributions —
    User ||--o{ FolkloreEntry              : "contributes"
    User ||--o{ FolkloreRevision           : "submits"

    %% — User → reviews —
    User ||--o{ Review                     : "reviews (dict)"
    User ||--o{ FolkloreReview             : "reviews (folklore)"
    User ||--o{ ReviewAdminOverride        : "overrides"

    %% — Dictionary structure —
    VariantGroup |o--|| Entry              : "mother entry"
    VariantGroup ||--o{ Entry              : "groups variants"
    Entry        ||--o{ EntryRevision      : "has revisions"

    %% — Folklore structure —
    FolkloreEntry ||--o{ FolkloreRevision  : "has revisions"
    FolkloreEntry |o--o{ FolkloreRevision  : "variant_of (source entry)"
    FolkloreEntry ||--o{ FolkloreComment   : "has comments"
    User ||--o{ FolkloreComment            : "authors"

    %% — Review workflows —
    EntryRevision   ||--o{ Review               : "reviewed via"
    FolkloreRevision ||--o{ FolkloreReview      : "reviewed via"

    %% — Admin overrides —
    ReviewAdminOverride |o--o| Entry            : "targets (dict)"
    ReviewAdminOverride |o--o| FolkloreEntry    : "targets (folklore)"

    %% — Contribution event cross-references —
    ContributionEvent |o--o| Entry              : "credits (dict term)"
    ContributionEvent |o--o| EntryRevision      : "credits (dict revision)"
    ContributionEvent |o--o| FolkloreEntry      : "credits (folklore)"
    ContributionEvent |o--o| FolkloreRevision   : "credits (folklore revision)"
```

---

## Entity Count

| App           | Entities                                                                                                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth (Django) | User, Group                                                                                                                                                                                                                                                                                                    |
| users         | UserProfile, UserContributionStats, ContributionEvent, UserSessionEvent, AdminAccountAction, RoleApplication, RoleApplicationDecision, RoleOnboardingRecord, RoleInvitation, RecognitionEvent, GamificationConfig, GamificationRuntimeState, MunicipalityStats, MunicipalityMonthlyWinner, SiteContentSettings |
| dictionary    | VariantGroup, Entry, EntryRevision                                                                                                                                                                                                                                                                             |
| folklore      | FolkloreEntry, FolkloreRevision, FolkloreComment                                                                                                                                                                                                                                                               |
| reviews       | Review, FolkloreReview, ReviewAdminOverride                                                                                                                                                                                                                                                                    |
| **Total**     | **25 entities**                                                                                                                                                                                                                                                                                                |

---

## Key Design Notes

| Pattern                 | Detail                                                                                                                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All PKs                 | UUID (`uuid.uuid4`) except `User` (int), `MunicipalityStats` (string), `GamificationConfig` (string), `GamificationRuntimeState` (string)                                                                                                                                                                             |
| Status lifecycle        | `draft → pending → approved / rejected`; published entries can enter `approved_under_review` or `archived`                                                                                                                                                                                                            |
| Revision model          | Both Dictionary and Folklore use a snapshot revision pattern — each `EntryRevision` / `FolkloreRevision` carries the full proposed state as JSON in `proposed_data`                                                                                                                                                   |
| Folklore revision types | `FolkloreRevision.revision_type` is `revision` (owner editing their own entry) or `variant` (alternate version by a different contributor). Variants have `entry=None` and `variant_of` pointing to the source `FolkloreEntry`; on approval `publish_revision` creates a new `FolkloreEntry` rather than overwriting. |
| Folklore ownership      | Only the original contributor (or admin/superuser) may revise a published `FolkloreEntry`. Any authenticated user may submit a variant. Reviewers may not revise entries they do not own.                                                                                                                             |
| Variant groups          | Dictionary entries can be grouped into `VariantGroup`s; one entry is the `mother` (canonical form), others are dialectal/orthographic variants                                                                                                                                                                        |
| Gamification            | Levels and badge thresholds live in `GamificationConfig` (JSON); unlocked badges are denormalised into `UserContributionStats.unlocked_badges` for fast reads                                                                                                                                                         |
| Leaderboard             | `MunicipalityStats` and `UserContributionStats` are pre-computed aggregates refreshed by background tasks; `MunicipalityMonthlyWinner` records the per-metric monthly champion                                                                                                                                        |
| Multi-approver          | `Entry.last_approved_by` is M2M — tracks every reviewer who approved the current revision                                                                                                                                                                                                                             |
| Role pipeline           | `RoleInvitation → RoleOnboardingRecord` (invite path) or `RoleApplication → RoleApplicationDecision → RoleOnboardingRecord` (application path)                                                                                                                                                                        |
| Audit trail             | `AdminAccountAction` logs privileged account operations, including activation/deactivation, role revocation, suspicious-account handling, password reset sends, and approved-applicant setup reminders.                                                                                                               |
| Contribution credit     | `ContributionEvent` is the canonical credit ledger; four nullable FKs (to Entry, EntryRevision, FolkloreEntry, FolkloreRevision) with unique constraints prevent double-counting                                                                                                                                      |

## Design Rationale Notes

These notes explain why the main tables are separated this way.

### Why Use Revisions?

Dictionary and folklore content is not written directly into the public record.
Instead, a submitted version is stored first as `EntryRevision` or
`FolkloreRevision`. Reviewers then approve or reject that snapshot.

This protects the public archive because:

- contributors can draft and revise without immediately changing public content;
- reviewers can see exactly what was submitted;
- approved and rejected versions remain auditable;
- published entries can be re-reviewed without losing the previous record.

### Why Use Variant Groups?

Ivatan terms may have common, municipal, dialect, pronunciation, or spelling
variants. `VariantGroup` keeps those related entries together. One entry acts as
the mother term and stores the shared meaning. Other entries can keep
variant-specific pronunciation, examples, audio, or usage notes.

This avoids duplicating the same meaning across several related terms while
still preserving local differences.

### Why Use Contribution Events?

The system does not calculate badges and recognition only from the current
visible page. It records credit in `ContributionEvent`. This creates a stable
ledger for:

- approved dictionary entries;
- approved dictionary revisions;
- approved folklore entries;
- approved folklore revisions;
- review activity and recognition updates.

Using a ledger helps prevent double-counting and makes leaderboard totals easier
to explain.

### Why Keep Role Applications Separate From Users?

A user account and a role approval are different things. `RoleApplication`,
`RoleApplicationDecision`, `RoleInvitation`, and `RoleOnboardingRecord` keep that
history separate so admins can answer:

- who applied;
- what role they requested;
- who approved or rejected the request;
- when the activation/reminder email was sent;
- whether the user completed onboarding.

This is important because the system handles cultural content and reviewer
authority, not just ordinary login access.

### Why Keep Admin Actions?

`AdminAccountAction` records sensitive actions such as account activation,
deactivation, role changes, flags, and password/setup reminders. This gives the
project an operational audit trail and helps future maintainers understand what
happened to an account without relying on memory.

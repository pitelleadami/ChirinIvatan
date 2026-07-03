# Chirin Ivatan System Requirements

This document summarizes the functional, non-functional, governance, security,
and testing requirements for Chirin Ivatan. It is intended for adviser review,
project turnover, and quick orientation before reading the deeper architecture
and implementation documents.

Related documents:

- `README.md` for project overview and setup.
- `docs/SPEC-03_SYSTEM_ARCHITECTURE_PACK.md` for diagrams and workflows.
- `docs/ERD.md` and `DATA_MODEL.md` for data model details.
- `docs/SPEC-03_CONTRIBUTOR_MANUAL.md` for contributor-facing guidance.
- `docs/SPEC-03_MANUAL_QA_CHECKLIST.md` for manual test coverage.
- `docs/SPEC-03_DEVELOPER_HANDOFF_SPEC.md` for implementation details.

## How To Read This Document

This is the concise requirements reference. It answers:

- what the system is expected to do;
- who the system is for;
- what quality, security, and preservation expectations must be met;
- how the system is accepted before demo, deployment, or turnover.

For detailed diagrams, read the architecture pack. For table-level details, read
the ERD and data model. For exact implementation contracts, read the developer
handoff.

## Requirements Traceability Summary

| Requirement Area      | Primary Evidence Document                                                       |
| --------------------- | ------------------------------------------------------------------------------- |
| Functional behavior   | `docs/SYSTEM_REQUIREMENTS.md`, `docs/SPEC-03_DEVELOPER_HANDOFF_SPEC.md`         |
| Architecture/design   | `docs/SPEC-03_SYSTEM_ARCHITECTURE_PACK.md`                                      |
| Database/data model   | `docs/ERD.md`, `DATA_MODEL.md`                                                  |
| User guidance         | `docs/SPEC-03_CONTRIBUTOR_MANUAL.md`                                            |
| Testing/acceptance    | `docs/SPEC-03_MANUAL_QA_CHECKLIST.md`, `docs/SPEC-03_RELEASE_GATE_CHECKLIST.md` |
| Deployment/operations | public deployment templates plus private operator notes                         |

## Acceptance Matrix

| Area                 | Acceptance Evidence                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Public browsing      | dictionary, folklore, resources, FAQ, and profile pages load                             |
| Contributor workflow | draft, save, submit, and status tracking work for dictionary/folklore                    |
| Review workflow      | reviewer/admin approval, rejection, quorum, notes, and re-review work                    |
| Admin workflow       | people, applications, resources, site content, logs, and maintenance controls work       |
| Data governance      | source masking, attribution, revision history, and archive preservation behave correctly |
| Security             | unauthenticated and unauthorized requests return controlled errors                       |
| Testing              | backend tests, frontend lint/build, e2e tests where available, and manual QA pass        |
| Turnover             | public docs and private operator notes are complete and separated                        |

## 1. Project Objectives

Chirin Ivatan must provide a web-based platform for documenting, reviewing, and
publishing Ivatan language and folklore materials. The system supports community
participation while keeping public content culturally respectful, source-aware,
and reviewed before publication.

The system must:

- preserve Ivatan dictionary terms, variants, pronunciation, examples, and
  source information;
- preserve folklore entries with categories, municipality context, source notes,
  and media where appropriate;
- allow contributors to submit content without directly publishing it;
- allow reviewers, consultants, and admins to evaluate submissions before they
  become public;
- provide public browsing, search, and learning access for visitors;
- record attribution, review decisions, and contribution history for
  accountability.

## 2. User Roles

The system supports these roles:

- Visitor: browses public dictionary, folklore, pages, resources, and profiles.
- Contributor: creates dictionary and folklore submissions and manages their own
  drafts/submissions.
- Reviewer: evaluates pending submissions and records approve, reject, or return
  decisions.
- Consultant: appears in public people/consultant contexts and may provide
  cultural or domain support depending on assigned permissions.
- Admin: manages users, role applications, site content, resources, moderation,
  archive actions, and operational workflows.

Role access must be explicit. Users must not receive contributor, reviewer,
consultant, or admin capabilities unless approved or invited through the role
workflow.

## 3. Functional Requirements

### Public Dictionary

The system must:

- show approved dictionary entries publicly;
- support searching and browsing dictionary terms;
- distinguish mother terms from variants;
- group variants under a shared mother term where appropriate;
- show variant-specific pronunciation, audio, examples, usage notes, and
  etymology;
- show shared semantic information such as meaning, part of speech, related
  words, inflected forms, photo, and source information from the mother term;
- display related synonyms/antonyms as clickable links when they match approved
  dictionary entries and as plain text otherwise.

### Dictionary Contribution Workflow

The system must:

- let contributors create dictionary drafts;
- let contributors save drafts before submission;
- validate required dictionary fields before submission;
- support media ownership/source fields for audio and photo attachments;
- support variant submissions under a mother term;
- allow multiple variants when justified by source, place, spelling, or
  pronunciation differences;
- warn and require a usage/source note when duplicate variant types are added;
- prevent exact duplicate variant headwords within the same submitted set;
- send submitted dictionary revisions to review instead of publishing directly.

### Folklore Archive

The system must:

- show approved folklore entries publicly;
- support categories and subcategories for folklore content;
- store source, municipality, copyright/usage, and media details;
- allow contributors to submit folklore drafts for review;
- preserve revision and review history for folklore entries.

### Review And Moderation

The system must:

- provide reviewer/admin queues for pending dictionary and folklore submissions;
- show reviewers the submitted content, source details, contributor context, and
  revision details before action;
- require explicit review decisions;
- support approve, reject, return/request changes, flag for re-review, and
  archive/restore workflows where applicable;
- preserve review notes and reviewer identity for accountability;
- avoid silently deleting cultural records.

### Role Applications And Onboarding

The system must:

- allow users to apply for contributor/reviewer roles where enabled;
- prevent duplicate active applications for the same role;
- allow admins to approve or reject applications;
- send approved users an activation/completion link;
- let admins resend reminder links for approved users who have not completed
  activation;
- keep admin-visible logs of application decisions and sent onboarding emails.

### Profiles, People, And Recognition

The system must:

- show public profiles for approved visible users;
- support contributor/reviewer recognition, levels, badges, and leaderboards;
- respect profile visibility settings;
- show public people/group sections according to assigned roles and visibility
  rules.

### Admin Site Management

The system must:

- allow admins to manage public site content sections;
- allow admins to manage Terms & Conditions, Privacy Policy, Contributor &
  Stewardship Policy, Media Upload Policy, and Information Security Policy text;
- allow admins to manage downloadable learning/resource files;
- allow admins to inspect users, role status, applications, messages, and action
  logs;
- allow maintenance-mode messaging when needed;
- provide export/backup-oriented operational support through private operator
  runbooks.

### Policy and Consent

The system must:

- show a public `/policies` page with the current admin-managed policy text;
- require Terms & Conditions and Privacy Policy acceptance when creating an
  account through approved application claiming or invitation claiming;
- require Contributor & Stewardship Policy acceptance before role applications
  or accepted stewardship invitations;
- require Media Upload Policy acceptance only when a dictionary or folklore
  draft includes uploaded media;
- present the Information Security Policy as public informational guidance
  without requiring checkbox acceptance.

## 4. Non-Functional Requirements

### Usability

The system should be understandable for users with different levels of technical
experience. Public pages should be easy to browse on mobile and desktop. Forms
should give clear validation messages and avoid forcing users to understand
internal database or review concepts.

### Accessibility And Responsiveness

The system should support mobile and desktop layouts. Controls should be labeled
clearly, text should remain readable, and common workflows should work on small
screens.

### Reliability

The system should preserve drafts, submissions, reviews, and published content
through stable database-backed workflows. Production errors should be monitored,
and deployment should use repeatable build, restart, and smoke-check steps.

### Maintainability

The system should keep source code, public documentation, and private operator
notes separated. Code changes should pass automated checks before merging.
Documentation should remain in Markdown as the editable source of truth and may
be exported to PDF for formal submission or turnover.

### Performance

Public browsing and admin workflows should remain responsive for the expected
capstone/community scale. Heavy media files should be stored outside the code
repository and served as uploaded media.

### Data Preservation

The system should preserve cultural submissions, media metadata, attribution,
and review history. Destructive actions should be avoided or guarded. Backups
and restore testing must be documented privately for operators.

## 5. Security And Privacy Requirements

The system must:

- keep secrets, credentials, API keys, email passwords, Sentry DSNs, and database
  passwords out of the public repository;
- use environment variables for deployment configuration;
- use Django password hashing and authenticated sessions;
- use CSRF protection for authenticated requests;
- use bot protection on public forms where configured;
- run production over HTTPS;
- restrict admin/reviewer operations to authorized users;
- hide private source information when a contribution is marked as personal
  knowledge;
- keep live database exports, uploaded media, backup paths, and operator notes
  outside the public repository.

## 6. Database And Data Requirements

The system must store:

- users, profiles, roles, and visibility preferences;
- role applications, decisions, invitations, onboarding records, and message
  logs;
- dictionary entries, variant groups, entry revisions, reviews, media metadata,
  and attribution;
- folklore entries, folklore revisions, reviews, media metadata, and
  attribution;
- contribution events, recognition events, user contribution statistics, and
  gamification settings;
- admin account actions and relevant audit records, including role changes,
  suspicious-account handling, scheduled account deletion, appeal/cancel state,
  and final anonymization state.

The current ERD and detailed data model are documented in `docs/ERD.md` and
`DATA_MODEL.md`.

## 7. Testing And Acceptance Requirements

Before release or adviser demonstration, the system should pass:

- backend Django tests;
- frontend lint and production build;
- Playwright end-to-end tests where available;
- manual QA checklist for public browsing, contributor submissions, review
  workflows, admin workflows, role applications, media/source handling, and
  mobile behavior;
- smoke checks after deployment for homepage, key frontend routes, backend API
  responses, authentication/session behavior, and uploaded media access.

Testing references:

- `docs/SPEC-03_MANUAL_QA_CHECKLIST.md`
- `docs/SPEC-03_RELEASE_GATE_CHECKLIST.md`
- private beta-testing packet and bug log template, when formal tester coordination is needed

## 8. Turnover Requirements

For turnover, the project should provide:

- editable Markdown documentation in the repository;
- PDF exports of selected documents for advisers, panelists, or non-technical
  admins;
- private operator notes for deployment, backups, credentials, and access;
- a clear distinction between public repository files and private production
  data/operator materials;
- instructions for running, testing, deploying, and maintaining the system.

Recommended turnover packet:

- project overview;
- system requirements;
- architecture and diagrams;
- ERD/data model;
- contributor/user manual;
- admin/reviewer workflow notes;
- QA and testing checklist;
- deployment, backup, and access notes for trusted operators only.

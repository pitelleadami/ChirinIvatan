# Capstone Work Log

This work log summarizes the development of Chirin Ivatan for presentation, defense, and project continuity. It is reconstructed from Git history, project documentation, and recent deployment notes. It is intentionally written as a product and research implementation history, not as a low-level commit log.

## Purpose

Chirin Ivatan is a governance-first digital platform for Ivatan language and folklore preservation. The project combines public browsing, contributor submissions, reviewer validation, revision history, role-based stewardship, and recognition mechanisms.

## Phase 1: Research Baseline And Project Framing

Approximate evidence: early manuscript commits, IS295A frozen archive, project overview docs.

Work completed:

- Established the capstone topic around Ivatan language and folklore preservation.
- Documented the problem context: intergenerational transmission, modernization, migration, reduced formal mother-tongue instruction, and limited accessible preservation resources.
- Started the system as both a cultural preservation platform and an MIS governance project.
- Preserved IS295A baseline documents for traceability.

Defense value:

- Shows that the system was not built as a generic dictionary. It was framed around sustainability, community participation, and accountable digital stewardship.

## Phase 2: Architecture And Data Model

Approximate evidence: `docs/ERD.md`, `docs/SPEC-03_REBUILD_SPEC.md`, early backend commits.

Work completed:

- Defined core app boundaries: users, dictionary, folklore, reviews, notifications, and site content.
- Implemented Django project structure and database migrations.
- Created lexicographic data models for dictionary entries.
- Added folklore models and role-based user structures.
- Added ERD and architecture documentation.

Defense value:

- Demonstrates clear technical decomposition and normalized data modeling.

## Phase 3: Governance-First Contribution Lifecycle

Approximate evidence: governance lifecycle commits, review services, defense architecture pack.

Work completed:

- Implemented revision-first submission workflows.
- Added draft, pending, approved, rejected/needs changes, and re-review states.
- Added reviewer validation workflows with approval quorum.
- Added flagging/re-review support for already published entries.
- Added revision retention and original approved snapshot behavior.
- Preserved historical contribution credit even when entries are later archived, revised, or re-reviewed.

Defense value:

- This is the core MIS contribution: content is not simply posted; it moves through an auditable governance workflow.

## Phase 4: Dictionary System

Approximate evidence: dictionary models, services, tests, and public viewer.

Work completed:

- Built dictionary submission, review, and public browsing.
- Added dictionary search, English lookup, latest approved terms, and term details.
- Implemented mother terms and variant groups.
- Separated semantic core fields from variant-specific fields.
- Added related variants to public term pages.
- Added variant labels for common usage, municipality forms, historical forms, borrowed forms, and newly coined terms/expressions.
- Adjusted latest approved terms to show mother terms, while variants remain connected on term detail pages.

Defense value:

- Shows sensitivity to linguistic complexity: variants are preserved without duplicating meanings unnecessarily.

## Phase 5: Folklore System

Approximate evidence: folklore models, taxonomy, viewer, draft builder, and review routes.

Work completed:

- Built folklore submission, review, and public browsing.
- Added category and subcategory taxonomy.
- Added support for alternate versions.
- Added media support for public folklore entries.
- Added comments/community voices separate from the formal revision workflow.
- Improved mobile folklore cards, previews, and detail pages.

Defense value:

- Shows that folklore is treated differently from dictionary terms: narrative content needs category, context, media, and alternate-version support.

## Phase 6: Roles, Onboarding, And Stewardship

Approximate evidence: role application models, admin applications page, onboarding records.

Work completed:

- Added contributor, reviewer, consultant, and admin roles.
- Added Digital Yaru joining/application flows.
- Added role invitations and activation.
- Added onboarding prompt for new users to complete or skip profile setup.
- Added people/account management features for administrators.
- Added role demotion/revocation support.

Defense value:

- Demonstrates that participation is governed by role and accountability, not anonymous editing.

## Phase 7: Recognition, Profiles, And Public Accountability

Approximate evidence: public profile page, badges, leaderboard, gamification docs.

Work completed:

- Added public profiles.
- Added contribution summaries, approved mother terms, folklore entries, and revision counts.
- Added badges and reviewer progress.
- Added leaderboard controls and profile visibility options.
- Added notification and activity log features.

Defense value:

- Supports motivation and transparency while still allowing governance controls.

## Phase 8: Public Site, UX, And Mobile Polish

Approximate evidence: Vite frontend, public pages, CSS updates, mobile refinements.

Work completed:

- Built public pages for home, About, Digital Yaru, dictionary, folklore, FAQs, profiles, and leaderboards.
- Built steward workspace for reviews, applications, people, archive, site content, and contributions.
- Added responsive layouts for mobile and desktop.
- Improved cards, buttons, pagination, back-navigation, long-word wrapping, and compact mobile views.
- Renamed "partners" to "supporting organizations" to better match the project tone.

Defense value:

- Shows that the capstone moved beyond backend feasibility into a usable public-facing system.

## Phase 9: Public Launch And Operations

Approximate evidence: deployment checklist, runbook, live deploy backups, analytics support.

Work completed:

- Prepared production deployment runbooks and release gates.
- Added maintenance and beta/public access controls.
- Removed beta lock for public contributor/reviewer onboarding.
- Added Google Analytics support.
- Added deployment backup habit before live frontend syncs.
- Investigated live health during launch traffic and review-flow incidents.
- Fixed live review blank-page cases caused by unexpected preview data shapes.
- Added GitHub Actions continuous integration to run backend checks/tests, frontend lint/build, and Playwright end-to-end tests before changes reach users.

Defense value:

- Demonstrates operational readiness, monitoring awareness, and live-issue response.
- Demonstrates repeatable quality assurance beyond manual local testing.

## Current Documentation Practice

Going forward:

- `CHANGELOG.md` records visible changes by date or release.
- `docs/adr/` records meaningful decisions and rationale.
- `docs/CAPSTONE_WORK_LOG.md` records a presentation-friendly project timeline.
- Specs remain the source of detailed system behavior.

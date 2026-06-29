# SPEC-03 Documentation Index (Canonical)

This is the single entry point for project documentation.

## Canonical Documents (Use These)

1. `CHANGELOG.md`

- Plain-language record of visible product changes and public release notes.

2. `docs/SYSTEM_REQUIREMENTS.md`

- Adviser/turnover-ready summary of functional requirements, non-functional requirements, roles, security/privacy expectations, testing expectations, and turnover expectations.

3. `DATA_MODEL.md`

- Current data model and data-handling strategy overview.

4. `docs/SPEC-03_DEVELOPER_HANDOFF_SPEC.md`

- Backend + integration behavior and implementation handoff details.

5. `docs/SPEC-03_MANUAL_QA_CHECKLIST.md`

- End-to-end manual QA procedure.

6. `docs/SPEC-03_PLAIN_ENGLISH_PAGE_MAP.md`

- Role-by-role and screen-by-screen map for visitor, contributor, reviewer, consultant, and admin experiences.

7. `docs/SPEC-03_SYSTEM_ARCHITECTURE_PACK.md`

- Presentation-ready diagrams: ERD, state machines, and sequence flows.

8. `docs/PUBLIC_DEPLOYMENT_TEMPLATE.md`

- Public-safe deployment overview with placeholder domains, placeholder server
  paths, and environment-variable guidance.

9. `deploy/README.md`

- Server deployment templates (systemd + Nginx) and how to apply them.

## Continuous Integration

- `.github/workflows/ci.yml` runs backend checks/tests, frontend lint/build, and Playwright end-to-end tests on GitHub pushes and pull requests.
- Backend CI installs dependencies from the root `requirements.txt`.
- Playwright e2e is local-only and uses seeded SQLite test data.

## Branch And Pull Request Workflow

- `CONTRIBUTING.md` defines the feature branch -> pull request -> CI -> review -> merge workflow.
- `.github/pull_request_template.md` gives every PR a lightweight review checklist.
- Branch protection setup notes are kept privately with other operator/governance notes.

## Backups And Restore Testing

- Production backup scripts, restore commands, schedules, and storage locations are
  intentionally kept in private operator notes rather than this public repository.
- Full rebuild notes and filled beta-testing packets are intentionally kept in
  private project notes to avoid publishing internal-only operational material.
- Editable QA worksheets, capstone work logs, and historical archived specs are
  kept in private project notes so the public documentation stays focused.
- Frontend build scripts, Figma handoff notes, gamification planning drafts, and
  post-beta planning notes are kept in private project notes.
- Architecture decision records and branch-protection setup notes are kept in
  private project notes.

## Canonical Project Paths

- Backend (Django): `backend/`
- Frontend (Vite app): `frontend/`

## Practical Rule

If two docs conflict, treat these as precedence:

1. `SYSTEM_REQUIREMENTS.md`
2. `DATA_MODEL.md`
3. `SPEC-03_DEVELOPER_HANDOFF_SPEC.md`
4. `SPEC-03_MANUAL_QA_CHECKLIST.md`
5. `SPEC-03_PLAIN_ENGLISH_PAGE_MAP.md`

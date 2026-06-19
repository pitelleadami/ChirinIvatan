# SPEC-03 Documentation Index (Canonical)

This is the single entry point for project documentation.

## Canonical Documents (Use These)

1. `CHANGELOG.md`

- Plain-language record of visible product changes and public release notes.

2. `docs/CAPSTONE_WORK_LOG.md`

- Presentation-friendly reconstruction of the work completed across the capstone project.

3. `docs/adr/README.md`

- Architecture Decision Records: short rationale notes explaining why meaningful governance, product, and architecture decisions were made.

4. `docs/SPEC-03_REBUILD_SPEC.md`

- Complete rebuild specification: product pillars, data models, workflows, API inventory, screen inventory, permissions, lifecycle, deployment, and acceptance gates.

5. `DATA_MODEL.md`

- Current data model and data-handling strategy overview.

6. `docs/SPEC-03_DEVELOPER_HANDOFF_SPEC.md`

- Backend + integration behavior. If this conflicts with the rebuild spec, use the rebuild spec.

7. `docs/SPEC-03_GAMIFICATION_FEATURE_SPEC_DRAFT.md`

- Gamification v2.2 rules and editable policy draft.

8. `docs/SPEC-03_MANUAL_QA_CHECKLIST.md`

- End-to-end manual QA procedure.

9. `docs/SPEC-03_QA_WORKSHEET_EDITABLE.md`

- Beginner-friendly QA checklist with editable pass/fail notes.

10. `docs/SPEC-03_BETA_TESTER_PACKET.md`

- Full beta tester instructions, role-based task lists, questionnaire, bug report form, consent template, coordinator checklist, and summary form.

11. `docs/SPEC-03_FRONTEND_FIGMA_HANDOFF.md`

- Detailed beginner Figma build instructions for final UI.

12. `docs/SPEC-03_PLAIN_ENGLISH_PAGE_MAP.md`

- Role-by-role and screen-by-screen map for visitor, contributor, reviewer, consultant, and admin experiences.

13. `docs/SPEC-03_GAMIFICATION_IMPLEMENTATION_NOTES.md`

- What is already implemented in backend gamification.

14. `docs/SPEC-03_DEFENSE_ARCHITECTURE_PACK.md`

- Defense-ready diagrams: ERD, state machines, and sequence flows.

15. `docs/PUBLIC_DEPLOYMENT_TEMPLATE.md`

- Exact local/staging/production deployment settings and release gate.

16. `docs/PUBLIC_DEPLOYMENT_TEMPLATE.md`

- Beginner guide for buying domain, hosting, SSL, and secure deployment order.

17. `deploy/README.md`

- Server deployment templates (systemd + Nginx) and how to apply them.

18. `docs/PUBLIC_DEPLOYMENT_TEMPLATE.md`

- How to use the Ubuntu bootstrap deployment script safely.

19. `private operator backup notes`

- How production database and media backups are created, scheduled, checked, and smoke-restored.

## Continuous Integration

- `.github/workflows/ci.yml` runs backend checks/tests, frontend lint/build, and Playwright end-to-end tests on GitHub pushes and pull requests.
- Backend CI installs dependencies from `backend/requirements.txt`.
- Playwright e2e is local-only and uses seeded SQLite test data.

## Branch And Pull Request Workflow

- `CONTRIBUTING.md` defines the feature branch -> pull request -> CI -> review -> merge workflow.
- `.github/pull_request_template.md` gives every PR a lightweight review checklist.
- `docs/BRANCH_PROTECTION_SETUP.md` records the required GitHub branch protection settings for `main`.

## Backups And Restore Testing

- `private backup script` creates PostgreSQL and media backups.
- `private restore smoke-test script` proves a backup can be restored into a temporary database and extracted media folder.
- `private backup service` and `private backup timer` schedule daily production backups.
- `private operator backup notes` is the operator checklist.

## Legacy / Historical Docs

Moved to `docs/archive/` to reduce confusion.
These are historical references, not the current source of truth.

## Canonical Project Paths

- Backend (Django): `backend/`
- Frontend (Vite app): `frontend/`

## Practical Rule

If two docs conflict, treat these as precedence:

1. `SPEC-03_REBUILD_SPEC.md`
2. `DATA_MODEL.md`
3. `SPEC-03_DEVELOPER_HANDOFF_SPEC.md`
4. `SPEC-03_GAMIFICATION_FEATURE_SPEC_DRAFT.md`
5. `SPEC-03_MANUAL_QA_CHECKLIST.md`

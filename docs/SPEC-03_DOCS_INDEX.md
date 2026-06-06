# SPEC-03 Documentation Index (Canonical)

This is the single entry point for project documentation.

## Canonical Documents (Use These)

1. `docs/SPEC-03_REBUILD_SPEC.md`
- Complete rebuild specification: product pillars, data models, workflows, API inventory, screen inventory, permissions, lifecycle, deployment, and acceptance gates.

2. `DATA_MODEL.md`
- Current data model and data-handling strategy overview.

3. `docs/SPEC-03_DEVELOPER_HANDOFF_SPEC.md`
- Backend + integration behavior. If this conflicts with the rebuild spec, use the rebuild spec.

4. `docs/SPEC-03_GAMIFICATION_FEATURE_SPEC_DRAFT.md`
- Gamification v2.2 rules and editable policy draft.

5. `docs/SPEC-03_MANUAL_QA_CHECKLIST.md`
- End-to-end manual QA procedure.

6. `docs/SPEC-03_QA_WORKSHEET_EDITABLE.md`
- Beginner-friendly QA checklist with editable pass/fail notes.

7. `docs/SPEC-03_BETA_TESTER_PACKET.md`
- Full beta tester instructions, role-based task lists, questionnaire, bug report form, consent template, coordinator checklist, and summary form.

8. `docs/SPEC-03_FRONTEND_FIGMA_HANDOFF.md`
- Detailed beginner Figma build instructions for final UI.

9. `docs/SPEC-03_PLAIN_ENGLISH_PAGE_MAP.md`
- Role-by-role and screen-by-screen map for visitor, contributor, reviewer, consultant, and admin experiences.

10. `docs/SPEC-03_GAMIFICATION_IMPLEMENTATION_NOTES.md`
- What is already implemented in backend gamification.

11. `docs/SPEC-03_DEFENSE_ARCHITECTURE_PACK.md`
- Defense-ready diagrams: ERD, state machines, and sequence flows.

12. `docs/SPEC-03_DEPLOYMENT_CHECKLIST.md`
- Exact local/staging/production deployment settings and release gate.

13. `docs/SPEC-03_DOMAIN_HOSTING_SECURITY_GUIDE.md`
- Beginner guide for buying domain, hosting, SSL, and secure deployment order.

14. `deploy/README.md`
- Server deployment templates (systemd + Nginx) and how to apply them.

15. `docs/SPEC-03_SERVER_BOOTSTRAP_SCRIPT_GUIDE.md`
- How to use the Ubuntu bootstrap deployment script safely.

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

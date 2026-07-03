# SPEC-03 Code Maintenance Guide (Beginner-Friendly)

## Why this document exists

This project now has section comments inside core files. This guide tells you where to look first when something breaks.

## Start here (backend)

- `backend/reviews/services.py`: review decisions, quorum, reject/flag behavior.
- `backend/dictionary/services.py`: publishing approved revisions into live dictionary entries.
- `backend/dictionary/variant_services.py`: mother/variant promotion rules.
- `backend/users/role_onboarding.py`: contributor/reviewer application + invitation rules.
- `backend/users/recognition.py`: levels, badges, municipality stats, recognition events.
- `backend/users/models.py`: core tables for contributions, role onboarding, gamification.

## Start here (frontend)

- `frontend/src/lib/api.js`: all API calls and CSRF behavior.
- `frontend/src/lib/router.js`: app routes and client-side navigation.
- `frontend/src/pages/RoleCenterPage.jsx`: application/decision/invitation UI flow.

## Troubleshooting checklist

1. If review status does not update:
   - Check `backend/reviews/services.py` quorum and state checks.
2. If contributor/reviewer role does not activate:
   - Check `backend/users/role_onboarding.py` quorum + group assignment.
3. If scheduled account deletion does not complete after the appeal window:
   - Check `backend/users/management/commands/process_scheduled_account_deletions.py`.
   - In production, confirm `chirin-account-deletions.timer` is active.
4. If leaderboard/levels look wrong:
   - Check `ContributionEvent` rows, then run `python3 manage.py recompute_gamification`.
5. If frontend POST fails with 403:
   - Check CSRF in `frontend/src/lib/api.js` and trusted origins in Django settings.

## How to adapt for another indigenous language

1. Keep workflow logic the same (review/revision/governance).
2. Replace labels/titles/threshold defaults in `backend/users/recognition.py` and `GamificationConfig`.
3. Add language-specific fields to dictionary/folklore models via migrations.
4. Keep `ContributionEvent` as the single source of contribution credit.
5. Keep role/accountability flows unchanged unless governance policy changes.
6. Keep policy acceptance checkpoints aligned with `docs/SYSTEM_REQUIREMENTS.md`: account creation accepts Terms/Privacy/Stewardship, role applications accept Stewardship, media uploads accept Media Upload Policy only when media is present, and Information Security remains informational.

## Safe change strategy

1. Change one rule area only (review, onboarding, or recognition).
2. Update tests near that area.
3. Update the relevant public docs whenever a change makes or changes a product, governance, data, workflow, or display-normalization decision. Use `docs/SYSTEM_REQUIREMENTS.md`, `DATA_MODEL.md`, and `docs/SPEC-03_DEVELOPER_HANDOFF_SPEC.md` as the public source set.
4. Run:
   - `cd backend && python3 manage.py test users reviews dictionary folklore`
   - `cd frontend && npm run build`

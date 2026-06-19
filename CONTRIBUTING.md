# Contributing Workflow

Chirin Ivatan uses a pull-request workflow to protect the live project and keep reviewable history.

## Standard Loop

1. Start from the latest `main`.
2. Create a feature branch.
3. Make the change.
4. Run the relevant checks locally.
5. Open a pull request into `main`.
6. Wait for CI to pass.
7. Review the diff, even for self-review.
8. Merge only after the PR is ready.

## Branch Naming

Use short, descriptive names:

- `feature/<short-feature-name>`
- `fix/<short-bug-name>`
- `docs/<short-doc-name>`
- `chore/<short-maintenance-name>`

Examples:

- `fix/review-preview-blank-page`
- `feature/dictionary-variant-labels`
- `docs/adr-log`
- `chore/ci-workflow`

## Local Checks

Run the checks that match the change.

Backend:

```bash
cd backend
DJANGO_DEBUG=False DJANGO_SECRET_KEY=local-check-key python3 manage.py check
DJANGO_DEBUG=False DJANGO_SECRET_KEY=local-test-key python3 manage.py test users reviews dictionary folklore
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

End-to-end:

```bash
cd frontend
npm run e2e
```

## Main Branch Rule

Do not commit directly to `main`.

`main` should only change through pull requests after CI passes. Emergency fixes should still use a branch and PR unless the project owner explicitly documents an exception.

## Before Deploying Live

- Confirm the PR has passed CI.
- Confirm migrations, if any, are understood.
- Confirm deployment notes are updated when the change affects operations.
- Update `CHANGELOG.md` for visible user-facing or governance changes.
- Add or update ADRs for meaningful decisions.

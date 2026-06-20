# ADR-0011: Add Continuous Integration

Date: 2026-06-19  
Status: Accepted

## Context

The project has backend unit tests, frontend lint/build scripts, and Playwright end-to-end tests, but these checks were not being run automatically on GitHub pushes or pull requests.

Without CI, regressions can reach the live site before anyone notices.

## Decision

Add a GitHub Actions workflow at `.github/workflows/ci.yml` that runs:

- Django system check
- backend tests for `users`, `reviews`, `dictionary`, and `folklore`
- frontend lint
- frontend production build
- Playwright end-to-end tests against local Django and Vite servers

## Alternatives Considered

- Keep manual local testing only.
- Run only backend tests to save time.
- Run CI only before formal releases.

## Rationale

CI is the highest-leverage reliability practice for a public contributor/reviewer platform. It catches broken workflows before deployment and creates evidence that the project has a repeatable quality gate.

## Consequences

- Pushes and pull requests will take longer because tests run automatically.
- The e2e suite must stay deterministic and safe for local SQLite data only.
- CI failures should be treated as blockers before deployment unless explicitly documented.

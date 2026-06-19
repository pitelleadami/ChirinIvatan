# ADR-0012: Protect Main With Pull Requests

Date: 2026-06-19  
Status: Accepted

## Context

During early solo development, most work was committed directly to `main`. That was acceptable for fast prototyping, but Chirin Ivatan is now public and has contributors, reviewers, live workflows, and production users.

Direct commits to `main` can introduce broken code before CI or review has a chance to catch it.

## Decision

Use a professional branch and pull-request workflow:

- create a feature/fix/docs branch
- open a pull request into `main`
- run CI automatically
- review the diff, even if self-reviewing
- merge only after checks pass
- protect `main` in GitHub so direct pushes are blocked

## Alternatives Considered

- Continue direct commits to `main`.
- Use branches only for large features.
- Rely on manual testing before pushing.

## Rationale

The project now needs a reliable quality gate. Pull requests make changes reviewable, CI makes checks repeatable, and branch protection prevents accidental breakage of the live line.

## Consequences

- Small changes take slightly longer.
- The project gains a defensible engineering process for capstone presentation.
- Emergency changes require either a documented exception or a fast PR.

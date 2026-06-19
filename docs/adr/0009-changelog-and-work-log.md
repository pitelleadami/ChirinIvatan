# ADR-0009: Track Public Changes With Changelog And Work Log

Date: 2026-06-19  
Status: Accepted

## Context

The project is public and now involves contributors, reviewers, administrators, and a capstone defense audience. Git history captures code changes but is not readable enough for non-developers. Existing specs explain what the system does, but not always why decisions were made.

## Decision

Maintain:

- `CHANGELOG.md` for plain-language public-facing changes
- `docs/adr/` for decision records and rationale
- `docs/CAPSTONE_WORK_LOG.md` for presentation-friendly development history

## Alternatives Considered

- Use Git commits only.
- Put all history into the rebuild spec.
- Keep informal notes in chat only.

## Rationale

The changelog helps users and reviewers understand what changed. ADRs prevent major decisions from being re-litigated without context. The capstone work log supports defense and presentation needs.

## Consequences

- Meaningful future changes should update one or more documentation files.
- The changelog should stay plain-language and not become a technical diff dump.

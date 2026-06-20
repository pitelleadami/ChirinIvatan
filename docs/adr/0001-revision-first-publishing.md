# ADR-0001: Use Revision-First Publishing

Date: 2026-06-19  
Status: Accepted

## Context

Chirin Ivatan publishes cultural and language content that may be corrected, expanded, or challenged over time. Directly editing live entries would make it difficult to know who changed what, when reviewers approved it, and which version was originally published.

## Decision

Dictionary and folklore submissions use a revision-first workflow:

- contributors create drafts
- submitted revisions wait for review
- approved revisions publish into live entries
- rejected or returned revisions go back for contributor changes
- approved entries can be flagged for re-review
- original approved snapshots and recent approved/rejected revisions are retained

## Alternatives Considered

- Directly editing live entries.
- Keeping only the latest approved version.
- Using informal admin notes without structured revision records.

## Rationale

Revision-first publishing supports accountability, reviewer validation, contributor credit, and defense-ready auditability. It also fits the governance nature of the project: cultural records should not silently change.

## Consequences

- The system is more complex than a simple CRUD dictionary.
- Review queues and revision history need clear UX.
- Data storage grows over time, so retention rules are needed.

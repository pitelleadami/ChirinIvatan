# ADR-0005: Require Full Preview Before Review Decisions

Date: 2026-06-19  
Status: Accepted

## Context

Reviewers should not approve or reject submissions from a compressed queue card without seeing the full proposed entry and its context.

## Decision

Review queue cards are clickable previews. Approve/reject actions belong in the full preview view, where the reviewer can inspect entry details, media, sources, and revision history.

## Alternatives Considered

- Keep approve/reject buttons directly on every queue card.
- Use a table with compact row actions.
- Require only backend/admin review.

## Rationale

Full-preview review lowers the chance of accidental decisions and better matches the cultural stewardship role of reviewers.

## Consequences

- The review preview must be reliable and able to handle unusual submitted data.
- Reviewers perform one extra click before making decisions.

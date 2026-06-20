# ADR-0004: Use Needs Changes For Returned Or Rejected Submissions

Date: 2026-06-19  
Status: Accepted

## Context

Contributors need a clear place to find work that reviewers returned for fixing. Reviewers also need a way to return an approved-but-flagged entry to a contributor without making it disappear into ordinary drafts.

## Decision

Returned or rejected contributor submissions appear under Needs Changes in the contributor workspace.

Contribution tabs auto-open by priority:

1. Needs Changes
2. Drafts
3. Approved
4. Submitted for Review

If all sections are empty, Drafts opens by default.

## Alternatives Considered

- Put returned items back into Drafts.
- Keep rejected items hidden in review history only.
- Open the most recently touched tab regardless of urgency.

## Rationale

Needs Changes is action-oriented and helps contributors understand what requires attention first.

## Consequences

- The contributor dashboard must distinguish ordinary drafts from reviewer-returned work.
- Returned entries need enough reviewer notes for contributors to act.

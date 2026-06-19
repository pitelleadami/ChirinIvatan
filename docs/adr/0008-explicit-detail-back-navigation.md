# ADR-0008: Keep Public Detail Pages With Explicit Back Navigation

Date: 2026-06-19  
Status: Accepted

## Context

Users opening dictionary or folklore detail pages sometimes used browser Back and unexpectedly returned to Digital Yaru or another previous page, depending on how they reached the detail URL.

## Decision

Dictionary and folklore detail pages provide explicit back-to-collection controls. Detail opening also maintains a clean collection step in app history where practical.

## Alternatives Considered

- Rely entirely on browser history.
- Always send Back to the site home page.
- Make detail pages full separate pages without collection context.

## Rationale

Public browsing should feel predictable. Users opening a term or story should have a visible way to return to the dictionary or folklore collection.

## Consequences

- Query-string detail routes need careful history handling.
- In-page return controls should use deterministic routes instead of guessing the previous page.

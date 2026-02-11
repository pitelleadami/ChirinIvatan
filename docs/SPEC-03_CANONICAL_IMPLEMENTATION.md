# SPEC-03 Canonical Implementation Notes

This document normalizes the locked SPEC-03 text into a single implementation-ready reference.

## 1. Precedence Rule

If two statements conflict, apply this order:

1. `Governance Clarifications & State Corrections (Lock Version)`
2. `Formal State Transition Specification (LOCKED)`
3. Earlier sections

## 2. Canonical Status Enums

Use one shared entry-level enum for dictionary and folklore entries:

- `DRAFT`
- `PENDING`
- `APPROVED`
- `APPROVED_UNDER_REVIEW`
- `REJECTED`
- `ARCHIVED`
- `DELETED` (terminal; hard-delete event recorded for audit)

Revision-level enum:

- `DRAFT`
- `PENDING`
- `APPROVED`
- `REJECTED`

## 3. Canonical Entry State Transitions

Allowed transitions:

- `DRAFT -> PENDING`
- `PENDING -> APPROVED`
- `PENDING -> REJECTED` (single rejection, notes required)
- `APPROVED -> APPROVED_UNDER_REVIEW` (flag by reviewer/admin)
- `APPROVED_UNDER_REVIEW -> APPROVED` (2 approvals)
- `APPROVED_UNDER_REVIEW -> REJECTED` (1 rejection, notes required)
- `REJECTED -> ARCHIVED` (after 1 year no revision)
- `APPROVED -> ARCHIVED` (manual by contributor/admin)
- `ARCHIVED -> APPROVED` (manual restore)
- `ARCHIVED -> DELETED` (after +1 year; hard delete content)

No other transition is valid.

## 4. Dictionary Model Rules

- Dictionary terms belong to `VariantGroup`.
- Exactly one active mother entry per group, but group may temporarily have no mother.
- Semantic-core fields are authoritative on mother only:
  - `meaning`, `part_of_speech`, `photo`, `photo_source`
  - `english_synonym`, `ivatan_synonym`
  - `english_antonym`, `ivatan_antonym`
  - `inflected_forms`
- Variants inherit semantic core implicitly (read-only in UI).
- Variant-specific editable fields:
  - `term`, `pronunciation_text`, `audio_pronunciation`, `audio_source`
  - `source_text`, `usage_notes`, `etymology`
  - `example_sentence`, `example_translation`, `variant_type`

## 5. Mother Promotion Rules

- Approving a `General Ivatan` term in a group promotes it to mother.
- Previous mother is demoted to variant.
- If mother is archived/removed, new mother is earliest approved non-archived variant by submission timestamp.
- If no approved non-archived variants exist, group remains motherless until next approved variant.

## 6. Media Rules

Dictionary per entry:

- Max 1 active audio pronunciation
- Max 1 active photo
- Replacement requires revision
- Previous approved media remains in revision history, not active display

Folklore:

- No variants
- Media is bundled in submission/revision; no separate media review lifecycle

## 7. Folklore License Rule

On approval snapshot:

- Persist explicit license
- If empty, auto-set `CC BY-NC 4.0`
- Stored license is immutable for that approved revision snapshot

Applies to folklore media attachments/references only.

## 8. Review Rules

- Self-review forbidden
- Rejection requires notes
- Single rejection immediately rejects pending revision
- Approval quorum: `2 reviewers` OR `1 reviewer + 1 admin`
- Re-review uses entry state `APPROVED_UNDER_REVIEW` and can revert to `REJECTED`
- Admin override precedence is highest

## 9. Revision History, Retention, and Visibility

- Keep immutable base snapshot: first approved revision (never deleted)
- Retain up to 20 approved revisions excluding base snapshot
- Delete oldest approved revision first when over limit
- Rejected revisions retained for internal audit (not counted in 20 approved limit)

Role visibility:

- Public: base snapshot + last 5 approved revisions
- Reviewer/Admin: base snapshot + last 15 approved revisions

## 10. Contribution and Leaderboard Counting

- Count on approval events only
- Revisions counted once per contributor per entry lifetime
- Counts are historical and never decremented
- Counts remain after archive, delete, or later re-review rejection
- Leaderboard total:
  - `total = dictionary_terms + folklore_entries + revisions`

## 11. Archive and Delete Effects

- `ARCHIVED`: hidden from public; retrievable by policy
- `DELETED`: remove entry content + associated revisions + associated media permanently
- Historical contribution counts remain intact
- Governance metadata needed for accountability remains stored on surviving records

## 12. Clarified Contradictions Resolved

- Use `APPROVED_UNDER_REVIEW` as the single canonical state name (not `PUBLISHED_UNDER_REVIEW`).
- For leaderboard behavior, use historical-count rule (archived/deleted still counted) from locked clarification.
- Auto-archive applies to `REJECTED` inactivity flow as defined in locked state transitions.


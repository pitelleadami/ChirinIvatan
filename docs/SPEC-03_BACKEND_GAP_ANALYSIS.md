# SPEC-03 Backend Gap Analysis

Reference: `docs/SPEC-03_CANONICAL_IMPLEMENTATION.md`

## High-Priority Gaps

1. Folklore entry state machine is incomplete.
- Current `FolkloreEntry.Status` has no `APPROVED_UNDER_REVIEW` or `DELETED`.
- File: `backend/folklore/models.py`

2. Re-review flag flow is not fully implemented.
- `Review.Decision.FLAG` exists but `submit_review()` does not process flag actions to set `APPROVED_UNDER_REVIEW`.
- File: `backend/reviews/services.py`

3. Dictionary revision publish path updates only `term`.
- `publish_revision()` does not apply the full approved snapshot fields (semantic + variant + media fields).
- File: `backend/dictionary/services.py`

4. `create_revision_from_entry()` is inconsistent with current `EntryRevision` schema.
- Function writes fields (`term`, `meaning`, `part_of_speech`) that are not model fields.
- File: `backend/dictionary/services.py`

5. `DELETED` is not represented in model enum.
- Spec requires terminal delete state/event semantics.
- File: `backend/dictionary/models.py`

## Medium-Priority Gaps

1. Folklore model does not match locked folklore governance fields.
- Missing `municipality_source`
- Missing explicit immutable per-approved-revision license snapshot behavior
- Uses `variant`, but spec says folklore has no variants.
- File: `backend/folklore/models.py`

2. Revision retention policy not implemented.
- No enforcement for:
  - base snapshot never deleted
  - max 20 approved revisions excluding base
  - role-based visibility thresholds (5/15)
- Files: `backend/dictionary/models.py`, query/view layers

3. Mother promotion and fallback selection logic is partial.
- Promotion helper exists, but deterministic fallback on archived/removed mother is not implemented.
- File: `backend/dictionary/variant_services.py`

4. Leaderboard historical counting rules are not implemented.
- No evidence of one-per-entry-per-contributor revision counting and no-decrement historical totals.
- Files: users/stats/leaderboard layer (not yet present)

## Low-Priority / Documentation Gaps

1. `DATA_MODEL.md` and `ARCHITECTURE.md` describe pre-lock behavior (for example, separate audio lifecycle and deferred data model).
- Files: `DATA_MODEL.md`, `ARCHITECTURE.md`

## Recommended Implementation Order

1. Normalize enums and state transitions.
2. Fix review flow (`FLAG`, re-review state changes, admin override path).
3. Fix revision publish/apply logic and revision creation flow.
4. Add retention/base snapshot enforcement.
5. Add mother fallback promotion logic.
6. Implement contribution/leaderboard counting tables and immutable counters.
7. Align folklore schema with no-variant + license snapshot rules.

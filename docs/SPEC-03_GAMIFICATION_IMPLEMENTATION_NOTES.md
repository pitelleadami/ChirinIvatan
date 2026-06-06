# SPEC-03 Gamification v2 Implementation Notes

This file summarizes what is implemented in backend for the v2 cultural stewardship gamification model.

## Implemented Core

1. Deterministic backend computation
- Contributor level track is backend computed from approved contribution totals.
- Reviewer level track is backend computed from completed reviews.
- Dictionary, folklore, and quality badges are backend computed.
- No client authority.

2. Aggregate stats table
Model: `UserContributionStats`

Tracks:
- `combined_total`
- `dictionary_original_total`
- `folklore_original_total`
- `total_rejections`
- `review_completed_total`
- `dictionary_month`
- `folklore_month`
- `combined_month`
- `last_month_calculated`
- `contributor_level`
- `reviewer_level`
- `unlocked_badges`

3. Municipality aggregate table
Model: `MunicipalityStats`

Tracks:
- all-time totals (dictionary/folklore/combined)
- monthly totals (dictionary/folklore/combined)
- month marker for lazy monthly handling

4. Recognition event log (immutable)
Model: `RecognitionEvent`

Types:
- `level_up`
- `badge_unlock`
- `municipality_win`

5. Event-driven recalculation
Signals recalculate stats/levels/badges on:
- `ContributionEvent` creation
- `Review` creation
- `FolkloreReview` creation
- `EntryRevision` save
- `FolkloreRevision` save

## Implemented Advanced (requested)

1. Admin-editable thresholds
Model: `GamificationConfig`

Admin can edit:
- contributor levels
- reviewer levels
- dictionary badge thresholds
- folklore badge thresholds
- quality badge rule

Default/fallback rules apply if config is missing or invalid.

2. Automatic monthly municipality winner events
Models:
- `GamificationRuntimeState`
- `MunicipalityMonthlyWinner`

Behavior:
- On first recompute in a new month, system computes previous month winners.
- Winners are generated for:
  - dictionary monthly
  - folklore monthly
  - combined monthly
- Winner rows are persisted in `MunicipalityMonthlyWinner`.
- `municipality_win` recognition events are automatically created.
- Duplicate winner creation is prevented by unique constraint (`month_key`, `metric`).

## API Surface

1. Public profile
- `GET /api/users/<username>`
- Includes `gamification` block:
  - contributor_level
  - reviewer_level
  - dictionary_badges
  - folklore_badges
  - quality_badges
  - counts
  - framing/language

2. Stewardship/gamification payload
- `GET /api/users/<username>/cultural-stewardship`

3. Recognition events feed
- `GET /api/users/<username>/recognition-events`

4. Global leaderboard with dimensions
- `GET /leaderboard/global?metric=dictionary|folklore|combined&period=all_time|monthly`

5. Municipality leaderboard with dimensions
- `GET /leaderboard/municipality?municipality=<name>&metric=dictionary|folklore|combined&period=all_time|monthly`

6. Municipality aggregate list
- `GET /leaderboard/municipalities`

7. Municipality monthly winners
- `GET /leaderboard/municipality-winners?month=YYYY-MM` (month filter optional)

## Management Commands

1. Full recompute/backfill
- `python3 manage.py recompute_gamification`

Use this after migration to initialize all user stats and recognition states.

## Migration Files Added

- `users/migrations/0004_roleapplication_roleapplicationdecision_and_more.py`
- `users/migrations/0005_municipalitystats_recognitionevent_and_more.py`
- `users/migrations/0006_gamificationconfig_gamificationruntimestate_and_more.py`

## Test Status

Ran:
- `python3 manage.py test users`
- `python3 manage.py test users reviews dictionary folklore`

Result:
- all passing

## Remaining Optional Enhancements

1. Admin UI helper for validating JSON threshold schema.
2. Scheduled nightly integrity audit command comparing aggregates vs raw events.
3. Richer frontend milestone charts and share-card visuals.
4. Additional recognition-event timeline visualizations.

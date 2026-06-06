# SPEC-03 Gamification Feature Spec (Draft v2.2)

Status: Draft for revision (backend implementation exists)
Last updated: 2026-06-06

---

## 1) Purpose

Chirin Ivatan gamification is recognition-based cultural stewardship, not point gaming.

Core goals:
- Sustain contribution and review participation
- Preserve dignity and cultural framing
- Prevent count inflation and abuse
- Support municipality-level civic recognition
- Keep all logic backend-authoritative

---

## 2) Backend Status Snapshot

Implemented now:
- deterministic level and badge computation
- backend-only authority for recognition
- cached aggregate user stats
- municipality aggregate stats (all-time + monthly)
- recognition event log (level up, badge unlock, municipality win)
- event-driven recomputation hooks
- admin-editable gamification thresholds via config table
- lazy month rollover with monthly municipality winners

Validated now:
- migrations clean
- `manage.py check` clean
- full test suite pass (`users reviews dictionary folklore`)

---

## 3) Contributor Level Track (Combined Approved Contributions)

Combined includes:
- approved dictionary originals
- approved folklore originals
- approved revisions (unique rules remain enforced by existing contribution logic)

| Level | Title | Threshold |
|---|---|---|
| 0 | Community Learner | 0 |
| 1 | Language Contributor | 5 |
| 2 | Cultural Steward | 20 |
| 3 | Heritage Guardian | 50 |
| 4 | Ivatan Archivist | 100 |
| 5 | Heritage Champion | 200 |

---

## 4) Reviewer Level Track (Completed Reviews)

Completed reviews include approve/reject decisions.

| Level | Title | Threshold |
|---|---|---|
| 0 | Reviewer | 0 |
| 1 | Cultural Validator | 10 |
| 2 | Heritage Moderator | 50 |
| 3 | Senior Cultural Consultant | 100 |

---

## 5) Badge Rules

### 5.1 Dictionary badges (original dictionary approvals only)
- Word Contributor (5)
- Lexicon Builder (20)
- Language Preserver (50)
- Dictionary Steward (100)
- Master Lexicon Keeper (200)

### 5.2 Folklore badges (original folklore approvals only)
- Story Contributor (1)
- Folklore Weaver (3)
- Tradition Keeper (5)
- Cultural Narrator (10)
- Oral Historian (50)

### 5.3 Quality badge
- Accuracy Champion
- Threshold: combined approved contributions >= 20
- Constraint: historical rejection count <= configured max (default 0)

---

## 6) Counting and Integrity Rules

1. Draft and rejected submissions do not count toward approved contribution totals.
2. Historical persistence remains aligned with project governance (approved contributions stay credited historically).
3. All computations are backend-derived from authoritative records.
4. No client-side badge/level writes.
5. Recognition events are append-only records.

---

## 7) Data Models (Current)

Implemented models:
- `UserContributionStats`
- `MunicipalityStats`
- `RecognitionEvent`
- `GamificationConfig`
- `GamificationRuntimeState`
- `MunicipalityMonthlyWinner`

Existing models used as sources:
- `ContributionEvent`
- review models
- revision models

---

## 8) Municipality System

Supports:
- all-time municipality totals
- monthly municipality totals
- monthly winner materialization (dictionary, folklore, combined)

Month handling:
- lazy rollover using runtime state and month keys
- winner event auto-generated once per month/metric

---

## 9) API Surface (Current)

1. Profile payload includes gamification block:
- `GET /api/users/<username>`

2. Stewardship/gamification detail:
- `GET /api/users/<username>/cultural-stewardship`

3. User recognition feed:
- `GET /api/users/<username>/recognition-events`

4. Global leaderboard dimensions:
- `GET /leaderboard/global?metric=dictionary|folklore|combined&period=all_time|monthly`

5. Municipality leaderboard dimensions:
- `GET /leaderboard/municipality?municipality=<name>&metric=dictionary|folklore|combined&period=all_time|monthly`

6. Municipality totals list:
- `GET /leaderboard/municipalities`

7. Monthly municipality winners:
- `GET /leaderboard/municipality-winners?month=YYYY-MM`

---

## 10) Admin Controls

Admin-editable via `GamificationConfig`:
- contributor level thresholds/titles
- reviewer level thresholds/titles
- dictionary badge thresholds
- folklore badge thresholds
- quality badge threshold/max rejection rule

Fallback behavior:
- if config missing or malformed, safe defaults are used.

---

## 11) Operational Command

Backfill/recompute for all users:
- `python3 manage.py recompute_gamification`

Recommended after migration or threshold changes.

---

## 12) Frontend Implementation Contract

Implemented/current requirements:

1. Public profile shows contribution summaries, earned badges, next badge progress, and full badge catalog in a popup/modal.
2. Next badge progress must include dictionary, folklore, and quality categories when in progress.
3. Hall of Stewards provides recognition, period, and municipality filters.
4. Hall of Stewards includes a refresh button and compact mobile filters.
5. Mobile individual rankings hide the Recognition column.
6. Yaru page/profile surfaces show community role/accountability information where available.

Optional future enhancements:

1. richer milestone charts
2. share-card image generation
3. additional event timeline visualizations

---

## 13) Revision Checklist

- [ ] confirm final contributor level titles
- [ ] confirm final reviewer level titles
- [ ] confirm quality badge threshold/rejection policy
- [ ] approve municipality winner visibility rules
- [ ] finalize share card wording for level/badge/winner events

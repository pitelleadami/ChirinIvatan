# SPEC-03 Cultural Stewardship (Backend Implemented)

This backend implementation is now available for frontend use.

## 1) Framing Shift Implemented

Instead of only score-like wording, the API now returns preservation language:
- `You preserved X Ivatan words.`

This is available in the `cultural_stewardship` payload.

## 2) Contributor Levels Implemented

Current level engine uses approved contributions only.

Levels:
1. Word Gatherer: 5 approved entries
2. Story Keeper: 20 approved entries
3. Language Guardian: 50 approved entries + 3 folklore entries
4. Ivatan Archivist: 100 approved entries

API returns:
- current level
- next level target
- approved entry totals used for level checks

## 3) Badges Implemented (Behavior-Based)

Implemented badges:
- Voice of the Islands
  - earned at 10 active pronunciation audio contributions
- Folklore Weaver
  - earned at 5 approved folklore entries
- Accuracy Champion
  - earned at 20 completed submissions with 0 rejected
- Revivalist
  - earned when contributor has approved terms tagged as rare/endangered/archaic/obsolete
- Cultural Defender
  - earned at 25 unique reviewed entries/revisions

## 4) Where The Data Appears

### Public profile payload
Endpoint:
- `GET /api/users/<username>`

Now includes:
- `cultural_stewardship`
  - `language`
  - `preservation_counts`
  - `level`
  - `badges`

### Dedicated stewardship endpoint
Endpoint:
- `GET /api/users/<username>/cultural-stewardship`

Returns stewardship-only payload (same shape as above block).

### Leaderboard rows
Global and municipality leaderboard rows now include:
- `preserved_words`
- `preserved_folklore_entries`
- `current_level_title`

## 5) Test Status

Backend tests for users app pass after this change.

Command run:
- `python3 manage.py test users`

Result:
- OK

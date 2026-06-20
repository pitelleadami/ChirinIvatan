# SPEC-03 Frontend Page-by-Page Coding Scripts (Beginner, No Guesswork)

Use this after:

- `docs/SPEC-03_REBUILD_SPEC.md`
- `docs/SPEC-03_PLAIN_ENGLISH_PAGE_MAP.md`
- `docs/SPEC-03_FRONTEND_FIGMA_HANDOFF.md`
- `docs/SPEC-03_FRONTEND_FIRST_PAGE_CODING_SCRIPT.md`

This document gives practical coding steps. For current screen contents, permissions, and route behavior, the rebuild spec and screen map are authoritative.

---

## Global Setup (do once)

### Terminal A (backend)

```bash
cd /path/to/ChirinIvatan/backend
source ../venv/bin/activate
python3 manage.py migrate
python3 manage.py runserver
```

### Terminal B (frontend)

```bash
cd /path/to/ChirinIvatan/frontend
npm install
npm run dev
```

---

## Page Order (finish in this sequence)

1. Reviewer Dashboard (already documented in first-page script)
2. Folklore Viewer
3. Dictionary Viewer
4. Folklore Draft Builder
5. Public Profile
6. Leaderboards
7. Role Center
8. Dictionary Draft Builder

---

## Script A: Folklore Viewer

### API endpoints

- `GET /api/folklore/entries`
- `GET /api/folklore/entries/<entry_uuid>`

### File to edit

- `frontend/src/pages/FolkloreViewerPage.jsx`

### Build steps

1. Add states:
   - `listRows`, `detail`, `loadingList`, `loadingDetail`, `error`, `entryId`
2. Add `loadPublicList()` for list endpoint.
3. Add `loadDetail()` for detail endpoint.
4. Support query string preload:
   - `?entry_id=<uuid>` auto-load detail.
5. Render 3 blocks:
   - controls
   - public list
   - detail view
6. In detail block, visibly show masking behavior:
   - source can be hidden
   - media_source can be hidden

### Manual check

- list loads
- clicking “Load Detail” works
- invalid UUID shows readable error
- query param auto-load works

---

## Script B: Dictionary Viewer

### API endpoint

- `GET /api/dictionary/entries/<entry_uuid>`

### File to edit

- `frontend/src/pages/DictionaryViewerPage.jsx`

### Build steps

1. Add states:
   - `entryId`, `result`, `loading`, `error`
2. Add `loadEntry()` using `apiRequest`.
3. Support query preload:
   - `?entry_id=<uuid>`
4. Render section blocks matching Figma:
   - header
   - semantic core
   - variant section
   - connected variants
   - contributors/attribution
   - revision history
5. Do not dump raw JSON as final UI.

### Manual check

- valid UUID shows all sections
- invalid UUID gives controlled error
- variant entry shows semantic core from mother source entry

---

## Script C: Folklore Draft Builder

### API endpoints

- `POST /api/folklore/revisions/create`
- `PATCH /api/folklore/revisions/<revision_uuid>`
- `POST /api/folklore/revisions/<revision_uuid>` (browser-safe multipart update fallback)
- `POST /api/folklore/revisions/<revision_uuid>/submit`
- `GET /api/folklore/revisions/my`

### File to edit

- `frontend/src/pages/FolkloreDraftBuilderPage.jsx`

### Build steps

1. Add form state with fields:
   - title, content, category, municipality_source, source
   - self_knowledge, media_url, media_source, self_produced_media
   - copyright_usage
2. Add file states:
   - `photoFile`, `audioFile`
3. Build `FormData` in helper function.
4. Implement actions:
   - `createDraft()`
   - `updateDraft()` (requires revision ID; use `POST` fallback when sending `FormData`)
   - `submitDraft()` (requires revision ID)
   - `loadMyRevisions()`
5. Show backend feedback (`message`/`error`).
6. Add quick-use button from revisions list:
   - set selected revision ID into input.

### Manual check

- create returns revision ID
- update works after setting revision ID
- submit changes status to pending
- file uploads included (photo/audio)
- conditional field errors from backend display in UI

---

## Script D: Public Profile

### API endpoints

- `GET /api/users/<username>`
- optional: `GET /api/users/<username>/cultural-stewardship`
- optional: `GET /api/users/<username>/recognition-events`

### File to edit

- `frontend/src/pages/PublicProfilePage.jsx`

### Build steps

1. Add states:
   - `username`, `profile`, `loading`, `error`
2. Implement `loadProfile()`.
3. Render blocks:
   - profile header
   - contribution summary cards
   - onboarding accountability lines
   - gamification levels/badges
   - approved lists
4. Keep labels human-readable (not raw keys).

### Manual check

- profile loads by username
- accountability line appears when available
- gamification block displays without crash

---

## Script E: Leaderboards

### API endpoints

- `GET /leaderboard/global?metric=...&period=...`
- `GET /leaderboard/municipality?municipality=...&metric=...&period=...`
- `GET /leaderboard/municipalities`
- `GET /leaderboard/municipality-winners?month=YYYY-MM`

### File to edit

- `frontend/src/pages/LeaderboardPage.jsx`

### Build steps

1. Add control states:
   - `metric`, `period`, `municipality`, `month`
2. Add data states:
   - `globalRows`, `municipalityRows`, `municipalityTotals`, `winnerRows`
3. Implement 4 loaders (one per endpoint group).
4. Render 4 output sections:
   - global rank table/cards
   - municipality rank table/cards
   - municipality totals
   - monthly winners
5. Add friendly empty states.

### Manual check

- global loads
- municipality requires value and then loads
- month filter works for winners

---

## Script F: Role Center

### API endpoints

- `POST /api/users/role-applications`
- `GET /api/users/role-applications/my`
- `POST /api/users/role-applications/<application_uuid>/decide`
- `POST /api/users/role-invitations`

### File to edit

- `frontend/src/pages/RoleCenterPage.jsx`

### Build steps

1. Section A: apply
   - choose role
   - submit application
2. Section B: my applications
   - load list
   - copy/use application ID
3. Section C: reviewer/admin decide
   - application ID + decision + notes
4. Section D: reviewer/admin invite
   - username + role + notes
5. Display single shared error/success banners.

### Manual check

- apply works as logged-in user
- my list loads
- decision works for reviewer/admin accounts
- invite works for reviewer/admin

---

## Script G: Dictionary Draft Builder

### API endpoints

- `POST /api/dictionary/revisions/create`
- `POST /api/dictionary/entries/<entry_uuid>/revisions/start`
- `PATCH /api/dictionary/revisions/<revision_uuid>`
- `POST /api/dictionary/revisions/<revision_uuid>` (frontend JSON fallback is fine)
- `POST /api/dictionary/revisions/<revision_uuid>/submit`
- `GET /api/dictionary/revisions/my`

### File to edit

- `frontend/src/pages/DictionaryDraftBuilderPage.jsx`

### Build steps

1. Add form state for dictionary content:
   - term, meaning, part_of_speech, pronunciation_text, variant_type
   - synonyms/antonyms
   - usage_notes, etymology
   - example_sentence, example_translation
   - source_text, audio_source, photo_source
   - self-knowledge / self-recorded / contributor-owned flags
   - inflected_forms JSON
2. Add draft state:
   - `revisionId`, `entryId`, `myRevisions`, `busy`, `error`, `message`
3. Implement actions:
   - `createDraft()`
   - `startRevisionFromEntry()`
   - `updateDraft()`
   - `submitDraft()`
   - `loadMyRevisions()`
4. Render:
   - entry/revision control row
   - dictionary metadata fields
   - examples/usage/source sections
   - revision list with quick-load button
5. Keep `inflected_forms` input as JSON text for now.

### Manual check

- create draft returns revision ID
- start-from-entry preloads approved entry fields into draft form
- update draft keeps latest text values
- submit changes status to pending
- invalid `inflected_forms` JSON returns controlled error

---

## Shared Implementation Rules (all pages)

1. Use `apiRequest()` from:

- `frontend/src/lib/api.js`

2. For write actions:

- always catch errors and show `error` message in UI

3. For file uploads:

- use `FormData`
- do not set JSON content-type manually

4. Always implement these states:

- loading
- success
- error
- empty

5. Keep UI labels in plain language.

---

## Final Full-Frontend QA Flow

After all pages are integrated:

1. Run frontend build:

```bash
cd /path/to/ChirinIvatan/frontend
npm run build
```

2. Run backend check:

```bash
cd /path/to/ChirinIvatan/backend
python3 manage.py check
```

3. Run backend tests:

```bash
python3 manage.py test users reviews dictionary folklore
```

4. Manual click-through test all pages at:

- `http://localhost:5173`

---

## Commit Plan (recommended)

Use one commit per page:

1. `feat(frontend): integrate folklore viewer endpoints`
2. `feat(frontend): integrate dictionary viewer endpoint`
3. `feat(frontend): integrate folklore draft workflow`
4. `feat(frontend): integrate public profile page`
5. `feat(frontend): integrate leaderboard pages`
6. `feat(frontend): integrate role center onboarding flows`

This makes rollbacks and debugging much easier.

---

## If you get stuck

Use this debug order:

1. check Network tab (request URL/method/status)
2. check backend server logs
3. check response `detail` text
4. check page state updates after response
5. check route is wired in `App.jsx`

Never fix blindly. Follow actual error message first.

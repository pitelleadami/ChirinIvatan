# SPEC-03 Frontend Figma Handoff (Beginner Step-by-Step)

Status: current
Audience: beginner designer/developer
Goal: produce complete, implementation-ready UI frames for this project.

Important:
- Active frontend app is `frontend/` at project root.
- There is one canonical frontend path only: `frontend/`.

---

## Before You Start

1. Use Figma **Design File** (not FigJam, not Slides, not Figma Sites).
2. Keep this order: Foundations -> Shell -> Pages -> Mobile -> States -> QA.
3. Do not skip foundations; most design mistakes come from skipping tokens.

---

## Phase 1: Create Correct Figma File

### Step 1: Create file
1. Open `figma.com`.
2. Click `New design file`.
3. Rename file to: `Chirin Ivatan - Frontend UI`.
4. Confirm top tabs show: `Design | Prototype | Dev`.

If you do not see these tabs, you are in the wrong Figma product.

---

## Phase 2: Create Page Structure (Left Sidebar)

Create these pages exactly:
1. `00 Foundations`
2. `01 Global Shell`
3. `02 Reviewer Dashboard`
4. `03 Dictionary Viewer`
5. `04 Folklore Viewer`
6. `05 Folklore Draft Builder`
7. `06 Public Profile`
8. `07 Leaderboards`
9. `08 Role Center`
10. `09 States`
11. `10 QA`

Do not design yet. Only create page names.

---

## Phase 3: Foundations (Required)

Go to page: `00 Foundations`

### Step 3.1: Create color styles
How:
1. Press `R` to draw a rectangle.
2. In right panel, set Fill color.
3. Click Fill style icon (four dots) -> `Create style`.
4. Use exact style names below.

Create these color styles:
- `bg/app` = `#ECF0E6`
- `bg/topbar` = `#DBE7BF`
- `bg/panel` = `#FFFFFF`
- `bg/panel-soft` = `#F8F9F6`
- `text/primary` = `#122312`
- `text/muted` = `#5F685B`
- `border/default` = `#D4DBC9`
- `action/primary` = `#1F5F28`
- `action/primary-hover` = `#184B20`
- `action/secondary` = `#2F3F34`
- `action/danger` = `#9A2D2D`
- `status/success-bg` = `#E8F5EB`
- `status/success-text` = `#14522A`
- `status/error-bg` = `#FBECEB`
- `status/error-text` = `#812121`

### Step 3.2: Create text styles
Create text styles with exact names:
- `type/h1` -> 52, Bold, line height 60
- `type/h2` -> 34, Bold, line height 42
- `type/h3` -> 24, Semibold, line height 32
- `type/body` -> 16, Regular, line height 26
- `type/meta` -> 13, Regular, line height 20
- `type/button` -> 14, Medium, line height 20

Font guidance:
- Headings: serif style (example `Fraunces`)
- Body/UI: sans style (example `Manrope`)

### Step 3.3: Spacing and radius system
Use this spacing scale only:
- `8, 10, 12, 14, 16, 20, 24, 32, 40`

Use this radius scale only:
- `8, 10, 12, 999`

---

## Phase 4: Build Global Shell

Go to page: `01 Global Shell`

### Step 4.1: Desktop frame
1. Press `F`.
2. Set frame: `1280 x 900`.
3. Name: `Shell - Desktop`.
4. Fill: `bg/app`.

### Step 4.2: Top bar
Inside frame:
1. Add a frame at top, height `92`, width full.
2. Fill: `bg/topbar`.
3. Add Auto Layout horizontal (`Shift + A`).
4. Set left/right padding `20`, vertical align center, space between.

Add left text:
- `Chirin Ivatan` (type/h2)
- `Digital language and folklore archive console` (type/meta)

Add right button:
- text: `Admin Login`
- pill radius `999`
- fill `action/primary`
- text white
- height ~`40`

### Step 4.3: Tab row
Below top bar:
1. Add horizontal Auto Layout row.
2. Gap `8`, wrap enabled.
3. Create tab component style:
- height `36`
- horizontal padding `14`
- radius `999`
- border 1 `action/primary`
- default fill white
- active fill `action/primary`, text white

Tabs:
- Home
- Reviewer Dashboard
- Dictionary Viewer
- Folklore Viewer
- Folklore Draft Builder
- Public Profile
- Leaderboards
- Role Center

---

## Phase 5: Reviewer Dashboard

Go to page: `02 Reviewer Dashboard`

### Step 5.1: Desktop frame
- Create frame `1280 x 1800`
- Name: `Reviewer Dashboard - Desktop`
- Reuse shell structure (top bar + tabs)

### Step 5.2: Queue panels
Create 6 panels:
1. Dictionary Pending Submissions
2. Dictionary Re-review Queue
3. Dictionary Published Entries (Flag Eligible)
4. Folklore Pending Submissions
5. Folklore Re-review Queue
6. Folklore Published Entries (Flag Eligible)

Panel style:
- Fill `bg/panel`
- Border `border/default`
- Radius `12`
- Padding `14`

### Step 5.3: Queue card
Inside each panel:
- top row: title + status badge
- metadata rows
- notes textarea
- action buttons: Approve, Reject, Flag for re-review
- inline success/error text

Card style:
- fill `bg/panel-soft`
- border `border/default`
- radius `10`
- padding `12`

---

## Phase 6: Dictionary Viewer

Go to page: `03 Dictionary Viewer`

Create sections:
1. Load by Entry UUID panel
2. Header panel
3. Semantic Core panel
4. Variant Section panel
5. Connected Variants panel
6. Contributors/Attribution panel

Use readable key-value rows, not giant JSON dumps in final design.

---

## Phase 7: Folklore Viewer

Go to page: `04 Folklore Viewer`

Create sections:
1. Input controls: Entry UUID + buttons
2. Public list panel
3. Entry detail panel

Show masking cases clearly:
- Source hidden when self-knowledge
- Media Source hidden when self-produced media

---

## Phase 8: Folklore Draft Builder

Go to page: `05 Folklore Draft Builder`

Form groups:
1. title, category, municipality, media URL
2. content textarea
3. source textarea
4. media_source textarea
5. copyright field
6. checkboxes (self_knowledge, self_produced_media)
7. photo upload, audio upload, revision ID
8. actions: create/update/submit/refresh
9. my revisions list

---

## Phase 9: Public Profile

Go to page: `06 Public Profile`

Sections:
1. username loader
2. profile header
3. contribution summary cards
4. gamification block
- contributor level
- reviewer level
- badge groups
5. approved contribution lists

---

## Phase 10: Leaderboards

Go to page: `07 Leaderboards`

Sections:
1. controls (metric, period, municipality, month)
2. global ranking table
3. municipality ranking table
4. municipality totals cards
5. municipality winners list

---

## Phase 11: Role Center

Go to page: `08 Role Center`

Sections:
1. apply for role
2. my applications list
3. reviewer/admin decision form
4. reviewer/admin invitation form
5. section-level success/error feedback

Include helper line:
- reviewer quorum = `1 reviewer + 1 admin OR 2 reviewers`

---

## Phase 12: Mobile Versions

Create mobile versions for pages 02-08.

Frame baseline:
- width `375`
- height start `1200`

Rules:
- 1-column layout
- no horizontal scroll
- button rows stack if needed
- table sections become card lists

---

## Phase 13: States Page

Go to page: `09 States`

Create reusable state blocks:
- loading
- empty
- success message
- error message
- validation error under field
- disabled button state

---

## Phase 14: QA Frames

Go to page: `10 QA`

Create one frame per scenario:
1. reject without notes error
2. approve quorum pending state
3. flag for re-review from published queue
4. role application pending -> approved
5. invite action success
6. profile with unlocked badges
7. leaderboard monthly winner loaded

---

## Phase 15: Export/Handoff Rules

For each final frame:
- add annotation text block with
  - tokens used
  - spacing/radius values used
  - component names used
  - state shown

Do before implementation handoff:
1. Verify desktop + mobile for all pages.
2. Verify states page exists.
3. Verify QA page exists.
4. Verify component names are consistent.

---

## Beginner Tips (Important)

1. Use Auto Layout for almost everything (`Shift + A`).
2. Use components for repeat UI (tabs, cards, buttons, badges).
3. Never manually style every copy of same element.
4. Keep naming clean: `Component / Variant / State`.
5. Design one section at a time. Do not jump pages randomly.

---

## Final Reminder

You are designing for implementation.
If a frame is pretty but ambiguous for developers, it is not done.

Companion coding script for your first integrated page:
- `docs/SPEC-03_FRONTEND_FIRST_PAGE_CODING_SCRIPT.md`
- `docs/SPEC-03_FRONTEND_PAGE_BY_PAGE_CODING_SCRIPTS.md` (all remaining pages)

---

## Phase 16: Integrate Figma UI to Backend (Full Beginner Instructions)

This section answers: "I finished Figma, what exactly do I do now?"

You will move from design to working pages by following this order:
1. Start backend and frontend correctly
2. Build reusable UI components from your Figma frames
3. Connect each page to backend API endpoints
4. Handle auth, CSRF, loading, and error states
5. Run manual checks page by page

Do not skip order.

---

### Step 16.1: Confirm your folder structure first
From project root:
- backend code is in: `backend/`
- frontend app is in: `frontend/`

There should be one active frontend app at root: `frontend/`.

---

### Step 16.2: Run backend server
Open terminal A:

```bash
cd /Users/admin/Documents/GitHub/ChirinIvatan/backend
source ../venv/bin/activate
python3 manage.py migrate
python3 manage.py runserver
```

Expected backend URL:
- `http://127.0.0.1:8000`

---

### Step 16.3: Run frontend server
Open terminal B:

```bash
cd /Users/admin/Documents/GitHub/ChirinIvatan/frontend
npm install
npm run dev
```

Expected frontend URL:
- `http://localhost:5173`

Important for this project:
- `frontend/vite.config.js` already proxies `/api`, `/admin`, and `/media` to backend.
- `backend/backend/settings.py` already has trusted CSRF origins for local Vite ports 5173 and 5174.

---

### Step 16.4: Understand where code goes
Use these files as your implementation map:

- App shell + tab nav:
  - `frontend/src/App.jsx`
- Shared API helper (with CSRF token):
  - `frontend/src/lib/api.js`
- Routes helper:
  - `frontend/src/lib/router.js`
- Shared review queue component:
  - `frontend/src/components/QueueSection.jsx`
- Page implementations:
  - `frontend/src/pages/*.jsx`

Rule:
- Put visual structure in page/components files.
- Put all HTTP calls through `apiRequest` in `frontend/src/lib/api.js`.

---

### Step 16.5: Convert Figma tokens into CSS variables
Take your `00 Foundations` styles and apply them to:
- `frontend/src/index.css`
- `frontend/src/App.css`

Workflow:
1. Define color and spacing variables in `:root`
2. Map component classes to those variables
3. Avoid hardcoding random hex values in page JSX

This keeps design and code consistent.

---

### Step 16.6: Implement one page at a time (recommended order)
Use this order:
1. Reviewer Dashboard
2. Folklore Viewer
3. Dictionary Viewer
4. Folklore Draft Builder
5. Public Profile
6. Leaderboards
7. Role Center
8. Dictionary Draft Builder

Reason:
- Reviewer Dashboard validates your toughest backend integration first.
- Dictionary Draft Builder can be added after the original checklist because it depends on contributor revision APIs that were added later.

---

### Step 16.7: Endpoint map per page

#### Reviewer Dashboard (`02 Reviewer Dashboard`)
Load queue data:
- `GET /api/reviews/dashboard`

Submit decisions:
- `POST /api/reviews/dictionary/submit`
- `POST /api/reviews/folklore/submit`

Payload pattern:
```json
{
  "revision_id": "<uuid>",
  "decision": "approve|reject|flag",
  "notes": "required for reject/flag"
}
```

---

#### Dictionary Viewer (`03 Dictionary Viewer`)
Load detail:
- `GET /api/dictionary/entries/<entry_uuid>`

---

#### Dictionary Draft Builder (`Contributor Dictionary Submission/Revision`)
Create draft:
- `POST /api/dictionary/revisions/create`

Start revision from approved entry:
- `POST /api/dictionary/entries/<entry_uuid>/revisions/start`

Update draft:
- `PATCH /api/dictionary/revisions/<revision_uuid>`
- Browser-safe JSON fallback used in frontend: `POST /api/dictionary/revisions/<revision_uuid>`

Submit draft:
- `POST /api/dictionary/revisions/<revision_uuid>/submit`

Load my revisions:
- `GET /api/dictionary/revisions/my`

Notes:
- Current contributor flow supports text/metadata revision fields.
- Dictionary contributor media upload can be added in a later pass because dictionary revisions do not yet have dedicated upload fields like folklore revisions do.

---

#### Folklore Viewer (`04 Folklore Viewer`)
Public list:
- `GET /api/folklore/entries`

Detail:
- `GET /api/folklore/entries/<entry_uuid>`

---

#### Folklore Draft Builder (`05 Folklore Draft Builder`)
Create draft:
- `POST /api/folklore/revisions/create`

Update draft:
- `PATCH /api/folklore/revisions/<revision_uuid>`
- Browser-safe multipart fallback: `POST /api/folklore/revisions/<revision_uuid>`

Submit draft:
- `POST /api/folklore/revisions/<revision_uuid>/submit`

Load my revisions:
- `GET /api/folklore/revisions/my`

For photo/audio upload, use `FormData` (multipart). In the frontend, prefer the `POST` fallback for update when sending `FormData`.

---

#### Public Profile (`06 Public Profile`)
Load profile:
- `GET /api/users/<username>`

Optional additional blocks:
- `GET /api/users/<username>/cultural-stewardship`
- `GET /api/users/<username>/recognition-events`

---

#### Leaderboards (`07 Leaderboards`)
Global:
- `GET /leaderboard/global?metric=...&period=...`

Municipality:
- `GET /leaderboard/municipality?municipality=...&metric=...&period=...`

Municipality totals:
- `GET /leaderboard/municipalities`

Monthly winners:
- `GET /leaderboard/municipality-winners?month=YYYY-MM`

---

#### Role Center (`08 Role Center`)
Apply:
- `POST /api/users/role-applications`

My applications:
- `GET /api/users/role-applications/my`

Decide (reviewer/admin):
- `POST /api/users/role-applications/<application_uuid>/decide`

Invite (reviewer/admin):
- `POST /api/users/role-invitations`

---

### Step 16.8: Build each page with this exact coding pattern
For each page:
1. Create state:
   - data state
   - loading state
   - error state
2. Create load function using `apiRequest`
3. Render loading/empty/error/success UI
4. Add form validation before POST/PATCH
5. Show backend response message

Never send POST requests directly with raw `fetch` in page files unless you must.
Use `apiRequest` for consistency.

---

### Step 16.9: CSRF and authentication (important)
If you see `403 CSRF failed`:
1. Confirm backend is running on `127.0.0.1:8000`
2. Confirm frontend is running on `localhost:5173` or `localhost:5174`
3. Confirm `CSRF_TRUSTED_ORIGINS` contains both localhost and 127.0.0.1 for the current Vite port in `backend/backend/settings.py`
4. Log in first (session cookie required)
5. Retry action from frontend page

If you see `401 Authentication required`:
- log in through `/admin/` first (or your login flow)
- refresh frontend page

---

### Step 16.10: Integrate Figma components into real JSX
For each Figma component, map to code:

- Figma `Queue Card` -> JSX block inside `QueueSection.jsx`
- Figma `Status Badge` -> class-based badge style in `App.css`
- Figma `Panel` -> `.panel` class in `App.css`
- Figma `Form Rows` -> `.field` and `.field-grid` patterns

Keep component naming aligned with Figma page/component names.

---

### Step 16.11: Keep backend contract visible while coding
Do this while implementing:
1. Open browser DevTools -> Network tab
2. Trigger action in UI
3. Check request URL, method, status code
4. Check request payload matches backend expectation
5. Check response JSON is displayed in UI clearly

If unsure, test endpoint directly in browser for GET routes first.

---

### Step 16.12: Manual integration QA checklist (minimum)
After each page integration, verify:

#### Reviewer Dashboard
- dashboard loads queues
- approve works
- reject without notes shows error
- flag requires notes
- queue refresh reflects updated status

#### Dictionary Viewer
- valid UUID loads detail
- invalid UUID shows controlled error

#### Folklore Viewer
- public list loads
- detail loads
- source/media masking displays correctly

#### Folklore Draft Builder
- create draft works
- update draft works
- submit draft works
- file upload accepted

#### Public Profile
- shows contribution summary
- shows accountability labels
- shows gamification blocks

#### Leaderboards
- global loads
- municipality filter works
- monthly winners load

#### Role Center
- application submit works
- my applications list works
- reviewer/admin decision works
- invitation works

---

### Step 16.13: Common integration mistakes and fixes

1. Mistake: hardcoding API base URL everywhere
- Fix: use `apiRequest` from `frontend/src/lib/api.js`

2. Mistake: not showing backend error text
- Fix: always catch errors and render message block

3. Mistake: using JSON for file uploads
- Fix: use `FormData` for upload endpoints

4. Mistake: building all pages before testing
- Fix: complete one page + test + commit, then next page

5. Mistake: changing backend contract from frontend assumptions
- Fix: read endpoint shape first, then adapt UI

---

### Step 16.14: Commit strategy (safe for beginners)
After each page is done:
1. run frontend build:
   - `npm run build`
2. run backend check:
   - `python3 manage.py check`
3. commit page-level change

Recommended commit examples:
- `feat(frontend): implement reviewer dashboard api integration`
- `feat(frontend): implement folklore draft builder upload workflow`

---

### Step 16.15: What to do if you feel stuck
If blocked:
1. Pick one page only.
2. Implement only the load action first.
3. Confirm you can render backend JSON.
4. Style it after behavior works.
5. Add submit actions last.

Behavior first, polish second.

---

### Step 16.16: Done criteria (integration complete)
You are done when:
- every page from `02` to `08` has desktop + mobile frame in Figma
- corresponding React page exists and calls correct backend endpoints
- loading/error/empty/success states are implemented
- POST/PATCH actions return visible feedback
- manual QA checklist passes on local setup
- project builds successfully

That is full design-to-backend integration.

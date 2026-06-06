# SPEC-03 Frontend First Page Coding Script (Reviewer Dashboard)

Audience: beginner
Goal: integrate one real page end-to-end (UI + backend API) with minimal guesswork.

This script is intentionally literal.
Follow it in order.

---

## 0) What you are building
You are connecting this page:
- `Reviewer Dashboard`

To these backend endpoints:
- `GET /api/reviews/dashboard`
- `POST /api/reviews/dictionary/submit`
- `POST /api/reviews/folklore/submit`

---

## 1) Open project and run servers

### 1.1 Terminal A (backend)
```bash
cd /Users/admin/Documents/GitHub/ChirinIvatan/backend
source ../venv/bin/activate
python3 manage.py migrate
python3 manage.py runserver
```

Expected:
- backend runs on `http://127.0.0.1:8000`

### 1.2 Terminal B (frontend)
```bash
cd /Users/admin/Documents/GitHub/ChirinIvatan/frontend
npm install
npm run dev
```

Expected:
- frontend runs on `http://localhost:5173`

---

## 2) Confirm required files exist
In your editor, confirm these files are present:
- `frontend/src/lib/api.js`
- `frontend/src/components/QueueSection.jsx`
- `frontend/src/pages/ReviewerDashboardPage.jsx`
- `frontend/src/App.jsx`

If missing, stop and create/fix these first.

---

## 3) Step-by-step code workflow

## Step 3.1: API wrapper check (`api.js`)
Open:
- `frontend/src/lib/api.js`

Confirm it has:
- CSRF token logic
- `credentials: 'include'`
- error throw when response is not ok

Why this matters:
- all POST requests for approve/reject/flag need CSRF + session cookie.

---

## Step 3.2: Reusable queue card (`QueueSection.jsx`)
Open:
- `frontend/src/components/QueueSection.jsx`

Confirm the component supports:
- row title + status
- notes textarea
- Approve button
- Reject button
- row-level error message
- row-level success/result message

Why this matters:
- dashboard has pending/re-review queues and this avoids repeating large JSX blocks.

---

## Step 3.3: Dashboard page logic (`ReviewerDashboardPage.jsx`)
Open:
- `frontend/src/pages/ReviewerDashboardPage.jsx`

Make sure page has these states:
- `dashboard`
- `loading`
- `error`
- `notesByRevisionId`
- `actionBusyId`
- `rowResultByRevisionId`
- `rowErrorByRevisionId`

Make sure page has these functions:
- `loadDashboard()` -> GET dashboard endpoint
- `submitDecision({ kind, revisionId, decision })` -> POST dictionary/folklore decision
- local note validation: reject/flag requires notes

---

## Step 3.4: Route visibility in app shell
Open:
- `frontend/src/App.jsx`

Confirm:
- there is a tab/button labeled `Reviewer Dashboard`
- route is wired to render `<ReviewerDashboardPage />`

If route is not wired, add it before testing.

---

## 4) First manual test (load only)

1. Open `http://localhost:5173`
2. Click `Reviewer Dashboard`
3. Click `Load Dashboard`

Expected:
- no crash
- queues render (or empty-state messages)
- if not logged in: clear auth error message

If error is `Authentication required`:
1. open `http://127.0.0.1:8000/admin/`
2. log in as reviewer/admin user
3. return to dashboard page and reload

---

## 5) Decision action test (approve/reject/flag)

### 5.1 Approve test
1. choose one pending row
2. click `Approve`
3. expect success row message and queue refresh

### 5.2 Reject test (with required notes)
1. choose one pending row
2. click `Reject` **without notes**
3. expect UI error: reject requires notes
4. add notes
5. click `Reject` again
6. expect success + refreshed queue

### 5.3 Flag test (live entry detail)
1. open a live Dictionary or Folklore entry as a reviewer/admin
2. confirm a flaggable entry shows `Flag for re-review`
3. click it and submit without notes -> expect UI error
4. add notes/justification
5. submit flag -> expect success and entry status moves to `approved_under_review`
6. confirm the entry remains visible in the public Dictionary/Folklore viewer while under re-review

---

## 6) Exact payload the page must send
For dictionary:

```json
{
  "revision_id": "<uuid>",
  "decision": "approve|reject|flag",
  "notes": "required for reject/flag"
}
```

Path:
- `/api/reviews/dictionary/submit`

For folklore:
- same payload format
- path: `/api/reviews/folklore/submit`

---

## 7) DevTools verification (required)
Open browser DevTools -> Network tab.

For each action confirm:
1. method is `POST`
2. endpoint is correct
3. request body has revision_id/decision/notes
4. response status is 200 (or clear 4xx with message)
5. UI displays returned result

If request fails:
- copy exact response `detail`
- fix based on detail (do not guess)

---

## 8) Common errors and direct fixes

## Error: `403 CSRF verification failed`
Fix:
1. backend running on `127.0.0.1:8000`
2. frontend on `localhost:5173`
3. check `backend/backend/settings.py` has trusted origins for 5173
4. ensure `api.js` sends CSRF header for non-GET
5. log in again and refresh page

## Error: `401 Authentication required`
Fix:
- login first as reviewer/admin, then retry

## Error: `Invalid revision_id UUID`
Fix:
- ensure selected row has real UUID
- do not use placeholder text

## Error: row state does not refresh
Fix:
- ensure `submitDecision` calls `await loadDashboard()` after success

---

## 9) Style pass (connect Figma look)
After behavior works, style to match Figma:

Files:
- `frontend/src/App.css`
- `frontend/src/index.css`

Checklist:
- panel background and border match Figma
- button colors match status (approve/reject in queues; flag on live detail pages)
- note textarea spacing and readability
- mobile layout stacks buttons/fields

Important:
- behavior first, style second

---

## 10) Done checklist for Page 1
Mark done only if all are true:
- [ ] Dashboard loads from backend endpoint
- [ ] Approve works
- [ ] Reject requires notes and works
- [ ] Flag requires notes and works
- [ ] Row messages show success/error
- [ ] Queue refresh updates status
- [ ] Layout resembles Figma frame
- [ ] No console errors

---

## 11) Commit this page
Run:
```bash
cd /Users/admin/Documents/GitHub/ChirinIvatan/frontend
npm run build
```

Then backend sanity check:
```bash
cd /Users/admin/Documents/GitHub/ChirinIvatan/backend
python3 manage.py check
```

Commit message suggestion:
- `feat(frontend): integrate reviewer dashboard with review endpoints`

---

## 12) What to do next
After this first page is stable, move in this order:
1. Folklore Viewer
2. Dictionary Viewer
3. Folklore Draft Builder
4. Public Profile
5. Leaderboards
6. Role Center

Do the same pattern per page:
- load -> render -> submit -> handle errors -> style -> test -> commit

# SPEC-03 Release Gate Checklist (Code Perfection Pass)

Use this before demo, defense, or merge-to-main.

Mark each item `PASS` or `FAIL`.

---

## A) Environment Health
- [ ] `python3 manage.py check` passes
- [ ] `python3 manage.py migrate` shows no pending migration errors
- [ ] `npm run build` passes in `frontend/`

Commands:
```bash
cd /Users/admin/Documents/GitHub/ChirinIvatan/backend
python3 manage.py check
python3 manage.py migrate

cd /Users/admin/Documents/GitHub/ChirinIvatan/frontend
npm run build
```

---

## B) Backend Test Gate
- [ ] `python3 manage.py test users reviews dictionary folklore` passes
- [ ] no unexpected failures/skips in core governance tests

Command:
```bash
cd /Users/admin/Documents/GitHub/ChirinIvatan/backend
python3 manage.py test users reviews dictionary folklore
```

---

## C) API Contract Gate

### Reviews
- [ ] `GET /api/reviews/dashboard` works for reviewer/admin
- [ ] dictionary decision endpoint returns clear JSON for invalid UUID
- [ ] folklore decision endpoint returns clear JSON for invalid UUID

### Dictionary
- [ ] `GET /api/dictionary/entries/<uuid>` returns expected sections
- [ ] variant semantic core inheritance visible
- [ ] `POST /api/dictionary/revisions/create` works
- [ ] `POST /api/dictionary/entries/<uuid>/revisions/start` preloads approved entry snapshot
- [ ] dictionary draft update works on revision endpoint
- [ ] dictionary draft submit transitions to `pending`

### Folklore
- [ ] `GET /api/folklore/entries` returns public-visible records only
- [ ] `POST /api/folklore/revisions/create` works
- [ ] draft update works (`PATCH` and fallback `POST`) on revision endpoint
- [ ] submit draft transitions to `pending`

### Users
- [ ] role application create/my/decide works
- [ ] invitation endpoint works for reviewer/admin
- [ ] public profile includes accountability labels + gamification block

---

## D) Governance Rules Gate
- [ ] self-review blocked
- [ ] reviewer/admin Reviews tab hides own submissions
- [ ] reject requires notes
- [ ] flag requires notes and is initiated from live Dictionary/Folklore detail pages
- [ ] approval quorum behaves correctly
- [ ] re-review state transitions behave correctly
- [ ] `approved_under_review` Dictionary/Folklore entries remain publicly browsable
- [ ] contribution counting remains historical (not decremented by archive/delete)

---

## E) Frontend Integration Gate
- [ ] Reviewer Dashboard can load and submit approve/reject for pending/re-review queues
- [ ] Reviewer Dashboard does not show published-entry flag queues
- [ ] Folklore Viewer loads list/detail and shows masking behavior
- [ ] Folklore Viewer supports reviewer/admin flag-for-re-review with required notes
- [ ] Dictionary Viewer loads by UUID and supports reviewer/admin flag-for-re-review with required notes
- [ ] Dictionary Draft Builder supports create/start-edit/update/submit
- [ ] Folklore Draft Builder supports upload + create/update/submit
- [ ] upload image minimum is `200px x 200px`
- [ ] Application cards paginate 5 per page; recent invitations paginate 8 per page
- [ ] Public Profile and Leaderboards load correctly
- [ ] Steward's Desk menu hides Edit Profile and Role Center, keeps Help as FAQs, and no longer exposes a standalone User Manual
- [ ] FAQs include former manual guidance with role-aware sections for visitor/contributor/reviewer/admin users
- [ ] Admin Site Content can edit role-aware FAQ sections and upload FAQ screenshots/graphs under `/media/site/faq/`
- [ ] Admin People tab shows per-person action logs capped at 500 displayed rows without deleting audit records

---

## F) Security/Session Gate
- [ ] CSRF works from frontend (`localhost:5173` or `localhost:5174`)
- [ ] unauthenticated requests return controlled 401 JSON where expected
- [ ] permission-gated actions return controlled 403 JSON where expected

---

## G) Code Quality Gate
- [ ] no placeholder messages in production-critical endpoints
- [ ] no dead helper functions left in active modules
- [ ] beginner comments remain present in core workflow files
- [ ] docs point to canonical frontend path (`frontend/`)

---

## H) Final Go/No-Go
- [ ] All sections A-G are PASS
- [ ] Known limitations listed and accepted
- [ ] Demo path rehearsed end-to-end

Decision:
- [ ] GO
- [ ] NO-GO

Owner:
- Name:
- Date:
- Notes:

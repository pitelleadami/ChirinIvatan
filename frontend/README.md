# Chirin Ivatan Frontend (React + Vite)

This frontend is a workflow console for SPEC-03 backend APIs.

Canonical path note:

- Use this folder: `frontend/`
- This is the only frontend source path in the repo.

## 1) Prerequisites

- Node.js 18+
- npm
- Backend running on `http://127.0.0.1:8000`

## 2) First-Time Setup

From project root:

```bash
cd frontend
npm install
```

## 3) Run Frontend

```bash
npm run dev
```

Open:

- `http://localhost:5173`

## 4) Build Check

```bash
npm run build
```

## 5) Backend Requirements Before Testing UI

In another terminal:

```bash
cd backend
python3 manage.py migrate
python3 manage.py runserver
```

Optional (recommended after gamification changes):

```bash
python3 manage.py recompute_gamification
```

## 6) Main Frontend Pages

- `/` Home
- `/dashboard` Reviewer Dashboard
- `/dictionary-view` Dictionary Viewer
- `/folklore-view` Folklore Viewer
- `/folklore-draft` Folklore Draft Builder
- `/profile-view` Public Profile Viewer
- `/leaderboards` Leaderboards + Municipality Winners
- `/roles` Role Center (applications, decisions, invitations)

## 7) Authentication Notes

- Frontend requests use browser cookies (`credentials: include`).
- Log in first through Django admin if a page requires reviewer/admin role:
  - `http://127.0.0.1:8000/admin/`
- CSRF token is read from browser cookies for POST/PATCH requests.

## 8) Typical Test Flow (Beginner-Friendly)

1. Start backend server.
2. Start frontend dev server.
3. Log in at Django admin in same browser.
4. Open frontend and test in this order:

- Folklore Draft Builder
- Reviewer Dashboard
- Public Profile Viewer
- Leaderboards
- Role Center

## 9) Troubleshooting

1. `Authentication required`

- You are not logged in (or session expired).
- Log in again via `/admin/`.

2. CSRF failure

- Ensure frontend host is trusted in backend settings.
- Use same browser/session for login and API actions.

3. Empty leaderboard/profile data

- You may not have approved contributions yet.
- Create/approve test content first.

4. API errors on role decisions/invites

- Ensure user is reviewer/admin for gated actions.

## 10) Current Scope

Backend is feature-rich and test-backed.
Frontend still focuses on workflow clarity and QA support, with room for final visual polish and brand graphics integration.

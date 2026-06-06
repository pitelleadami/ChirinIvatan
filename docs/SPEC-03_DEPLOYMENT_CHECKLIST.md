# SPEC-03 Deployment Checklist (Local -> Staging -> Production)

Goal: deploy safely with exact settings and repeatable checks.

Scope:
- Django backend in `backend/`
- Vite/React frontend in `frontend/`

---

## 1) Pre-Deployment Rule

Do not deploy if any of these fail:
- `python3 manage.py check`
- `python3 manage.py test users reviews dictionary folklore`
- `npm run build`

Commands:
```bash
cd /Users/admin/Documents/GitHub/ChirinIvatan/backend
python3 manage.py check
python3 manage.py test users reviews dictionary folklore

cd /Users/admin/Documents/GitHub/ChirinIvatan/frontend
npm run build
```

---

## 2) Required Settings Model (all environments)

Current project has dev defaults in `backend/backend/settings.py`.
For staging/production, use environment variables.

Use these exact variable names:
- `DJANGO_DEBUG`
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CSRF_TRUSTED_ORIGINS`
- `DJANGO_DB_ENGINE`
- `DJANGO_DB_NAME`
- `DJANGO_DB_USER`
- `DJANGO_DB_PASSWORD`
- `DJANGO_DB_HOST`
- `DJANGO_DB_PORT`
- `DJANGO_SECURE_SSL_REDIRECT`
- `DJANGO_SESSION_COOKIE_SECURE`
- `DJANGO_CSRF_COOKIE_SECURE`
- `DJANGO_SECURE_HSTS_SECONDS`
- `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS`
- `DJANGO_SECURE_HSTS_PRELOAD`
- `DJANGO_STATIC_ROOT`
- `DJANGO_MEDIA_ROOT`

Recommended implementation note:
- Move hardcoded settings in `backend/backend/settings.py` to `os.environ` lookups.

---

## 3) Exact Values by Environment

## 3.1 Local (developer machine)

Django:
- `DJANGO_DEBUG=True`
- `DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost`
- `DJANGO_CSRF_TRUSTED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174`
- `DJANGO_DB_ENGINE=django.db.backends.sqlite3`
- `DJANGO_DB_NAME=backend/db.sqlite3`
- `DJANGO_SECURE_SSL_REDIRECT=False`
- `DJANGO_SESSION_COOKIE_SECURE=False`
- `DJANGO_CSRF_COOKIE_SECURE=False`
- `DJANGO_SECURE_HSTS_SECONDS=0`

Frontend (`frontend/.env.local`):
- `VITE_API_BASE=`

Why blank API base works locally:
- Vite proxy in `frontend/vite.config.js` forwards `/api`, `/admin`, `/media` to `http://127.0.0.1:8000`.

---

## 3.2 Staging

Django:
- `DJANGO_DEBUG=False`
- `DJANGO_ALLOWED_HOSTS=staging-api.yourdomain.com`
- `DJANGO_CSRF_TRUSTED_ORIGINS=https://staging.yourdomain.com,https://staging-api.yourdomain.com`
- `DJANGO_DB_ENGINE=django.db.backends.postgresql`
- `DJANGO_DB_NAME=chirin_staging`
- `DJANGO_DB_USER=chirin_staging_user`
- `DJANGO_DB_PASSWORD=<strong-random-password>`
- `DJANGO_DB_HOST=<staging-db-host>`
- `DJANGO_DB_PORT=5432`
- `DJANGO_SECURE_SSL_REDIRECT=True`
- `DJANGO_SESSION_COOKIE_SECURE=True`
- `DJANGO_CSRF_COOKIE_SECURE=True`
- `DJANGO_SECURE_HSTS_SECONDS=31536000`
- `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=True`
- `DJANGO_SECURE_HSTS_PRELOAD=False`

Frontend (`frontend/.env.staging`):
- If frontend and API are same origin via reverse proxy:
  - `VITE_API_BASE=`
- If frontend calls separate API domain:
  - `VITE_API_BASE=https://staging-api.yourdomain.com`

---

## 3.3 Production

Django:
- `DJANGO_DEBUG=False`
- `DJANGO_ALLOWED_HOSTS=chirinivatan.com,www.chirinivatan.com,api.chirinivatan.com`
- `DJANGO_CSRF_TRUSTED_ORIGINS=https://chirinivatan.com,https://api.chirinivatan.com`
- `DJANGO_DB_ENGINE=django.db.backends.postgresql`
- `DJANGO_DB_NAME=chirin_prod`
- `DJANGO_DB_USER=chirin_prod_user`
- `DJANGO_DB_PASSWORD=<strong-random-password>`
- `DJANGO_DB_HOST=<prod-db-host>`
- `DJANGO_DB_PORT=5432`
- `DJANGO_SECURE_SSL_REDIRECT=True`
- `DJANGO_SESSION_COOKIE_SECURE=True`
- `DJANGO_CSRF_COOKIE_SECURE=True`
- `DJANGO_SECURE_HSTS_SECONDS=31536000`
- `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=True`
- `DJANGO_SECURE_HSTS_PRELOAD=True`

Frontend (`frontend/.env.production`):
- same-origin deployment:
  - `VITE_API_BASE=`
- separate API domain deployment:
  - `VITE_API_BASE=https://api.chirinivatan.com`

---

## 4) Static/Media Settings (Django)

For staging/prod set:
- `STATIC_URL=/static/`
- `MEDIA_URL=/media/`
- `DJANGO_STATIC_ROOT=/var/www/chirin/static`
- `DJANGO_MEDIA_ROOT=/var/www/chirin/media`

Deployment commands after pull:
```bash
cd /srv/chirin/backend
python3 manage.py migrate
python3 manage.py collectstatic --noinput
python3 manage.py check
```

---

## 5) Reverse Proxy (Nginx) Checklist

For production/staging:
- [ ] enforce HTTPS
- [ ] proxy app to gunicorn/uvicorn backend
- [ ] if frontend uses same-origin API calls, proxy `/api/` and `/admin/` from the frontend domain to backend
- [ ] serve `/static/` from `STATIC_ROOT`
- [ ] serve `/media/` from `MEDIA_ROOT`
- [ ] forward `X-Forwarded-Proto https`

Django setting required when behind proxy:
- `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')`

---

## 6) App Server Checklist (Gunicorn)

- [ ] run backend with gunicorn (not `runserver`)
- [ ] systemd service auto-restarts
- [ ] logs are accessible (`journalctl -u chirin-backend`)

Suggested command shape:
```bash
gunicorn backend.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120
```

Template available:
- `deploy/systemd/chirin-backend.service.example`

---

## 7) Frontend Deployment Checklist

Build:
```bash
cd /srv/chirin/frontend
npm ci
npm run build
```

- [ ] deploy `frontend/dist/` to web host
- [ ] verify app loads without console errors
- [ ] verify API calls resolve correctly with `VITE_API_BASE` policy

---

## 8) Post-Deploy Smoke Test (Staging/Prod)

### Backend
- [ ] `GET /` returns backend index JSON
- [ ] `GET /api/reviews/dashboard` returns 401 when not logged in
- [ ] authenticated reviewer/admin gets 200 on dashboard

### Functional
- [ ] submit one dictionary approve/reject action from the Reviews queue
- [ ] submit one folklore approve/reject action from the Reviews queue
- [ ] flag one eligible live Dictionary or Folklore entry for re-review from its public detail page
- [ ] create + submit one folklore draft
- [ ] open one public profile and one leaderboard endpoint
- [ ] as admin, open Steward's Desk -> Site Content and save About/Digital Yaru copy
- [ ] confirm Statements of Support and Partner Details appear on the About page only when populated
- [ ] save an FAQ section/question with selected role visibility and confirm it appears only for matching roles
- [ ] upload one FAQ screenshot/graph and confirm it is served from `/media/site/faq/`
- [ ] as admin, create one managed Consultant profile from Steward's Desk -> People and confirm the public profile shows Consultant
- [ ] as admin, send one Consultant email invitation and confirm accepted consultant accounts have reviewer-level queue access
- [ ] confirm profile owners do not see the leaderboard visibility control on their public profile
- [ ] as admin, use the public-profile leaderboard visibility control and confirm that user is removed/restored in individual leaderboard rows

### Security
- [ ] cookies are secure in browser (staging/prod)
- [ ] no mixed-content warnings
- [ ] no CSRF mismatch in normal usage

---

## 9) Rollback Checklist

If deploy fails:
1. Revert to previous backend release tag/commit.
2. Revert frontend to previous `dist` bundle.
3. Restore previous environment config.
4. Re-run smoke test.

Do not roll back database migrations blindly.
If rollback includes schema changes, use a migration rollback plan.

Nginx template available:
- `deploy/nginx/chirin.conf.example`

Bootstrap script template available:
- `deploy/scripts/bootstrap_ubuntu_chirin.sh.example`
- Usage guide: `docs/SPEC-03_SERVER_BOOTSTRAP_SCRIPT_GUIDE.md`

---

## 10) Release Sign-Off Template

Release:
- Environment: Local / Staging / Production
- Backend commit:
- Frontend commit:
- Migration applied: Yes/No
- Smoke test status: PASS/FAIL
- Approved by:
- Date:
- Notes:

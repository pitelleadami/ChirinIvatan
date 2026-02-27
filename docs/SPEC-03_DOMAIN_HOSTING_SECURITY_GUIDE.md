# SPEC-03 Domain, Hosting, and Security Guide (Beginner)

This guide answers:
- Do I need to buy a domain?
- Do I need hosting?
- How do I secure it properly?

Short answer: **Yes**.
For a public deployment you need:
1. A domain name
2. A server/hosting environment
3. HTTPS/SSL
4. Secure production settings

---

## 1) What to buy (in plain language)

## 1.1 Domain name
Buy one domain, for example:
- `yourdomain.com`

You will usually use:
- frontend app: `https://yourdomain.com`
- backend API/admin: `https://api.yourdomain.com`

## 1.2 Hosting/server
You need a server for backend and a place to serve frontend static files.

Typical setup:
- one VPS/server for Django + Nginx + Gunicorn
- optional managed database (PostgreSQL)

## 1.3 SSL certificate
You need HTTPS certificate for both domains.
Common path:
- Let’s Encrypt certificate via Nginx/certbot

---

## 2) Deployment architecture (recommended)

Use this simple architecture first:
- Nginx (reverse proxy)
- Gunicorn (Django app server)
- PostgreSQL (database)
- static + media files served by Nginx

Flow:
- Browser -> Nginx -> Gunicorn (API)
- Browser -> Nginx (static/media/frontend build)

---

## 3) DNS setup (what you configure at domain registrar)

Create records:
- `A` record for root domain (`@`) -> your server IP
- `A` record for `api` -> your server IP

Then wait for DNS propagation (can take minutes to hours).

---

## 4) Server setup order (exact sequence)

1. Provision Linux server (Ubuntu LTS recommended).
2. Install:
   - Python
   - Node (for frontend build)
   - Nginx
   - PostgreSQL (or use managed DB)
3. Clone your repo.
4. Create backend virtual environment.
5. Configure backend env file from template:
   - `backend/.env.production`
6. Run backend migration + collectstatic.
7. Run Gunicorn service.
8. Configure Nginx site.
9. Add SSL certificate.
10. Deploy frontend `dist` build.
11. Run smoke tests.

---

## 5) Which env files to use

Use templates already added:
- `backend/.env.production.example`
- `backend/.env.staging.example`
- `backend/.env.local.example`
- `frontend/.env.production.example`
- `frontend/.env.staging.example`
- `frontend/.env.local.example`

Create real files by copying templates:

```bash
cp backend/.env.production.example backend/.env.production
cp frontend/.env.production.example frontend/.env.production
```

Then edit values.

---

## 6) Loading env vars on server (simple method)

Before backend commands, export envs:

```bash
cd /srv/chirin/backend
set -a
source .env.production
set +a
python3 manage.py migrate
python3 manage.py collectstatic --noinput
python3 manage.py check
```

For systemd, set env in service file (`Environment=` lines or `EnvironmentFile=`).

---

## 7) Must-have production security settings

Ensure these are true in production env:
- `DJANGO_DEBUG=False`
- `DJANGO_SECURE_SSL_REDIRECT=True`
- `DJANGO_SESSION_COOKIE_SECURE=True`
- `DJANGO_CSRF_COOKIE_SECURE=True`
- `DJANGO_SECURE_HSTS_SECONDS=31536000`

Also set:
- strong random `DJANGO_SECRET_KEY`
- strict `DJANGO_ALLOWED_HOSTS`
- correct `DJANGO_CSRF_TRUSTED_ORIGINS`

---

## 8) Frontend production setting

If API is separate domain:
- set `VITE_API_BASE=https://api.yourdomain.com`

Build frontend:

```bash
cd /srv/chirin/frontend
set -a
source .env.production
set +a
npm ci
npm run build
```

Deploy `frontend/dist` to your web root.

---

## 9) Nginx essentials checklist

- [ ] frontend route serves `index.html` for SPA routes
- [ ] `/api/` proxies to gunicorn backend
- [ ] `/admin/` proxies to backend
- [ ] `/static/` and `/media/` served correctly
- [ ] HTTPS enabled with valid cert

---

## 10) Post-deploy smoke test (minimum)

1. Open `https://yourdomain.com` -> frontend loads
2. Open `https://api.yourdomain.com/admin/` -> admin login loads
3. Login and test:
   - reviewer dashboard endpoint
   - dictionary review decision
   - folklore draft create/submit
4. Confirm no CSRF errors in normal flow
5. Confirm media URLs load under HTTPS

---

## 11) Cost planning (high-level)

You should budget for:
- domain registration (annual)
- server hosting (monthly)
- optional managed database (monthly)
- backups/storage (monthly)

Keep costs low at first:
- one server + one domain + free SSL
- scale only when usage grows

---

## 12) What to do first (your next actions)

1. Buy domain name.
2. Rent one VPS server.
3. Point DNS (`@` and `api`) to server IP.
4. Use `docs/SPEC-03_DEPLOYMENT_CHECKLIST.md` for exact deployment gate.
5. Use production env templates and deploy.

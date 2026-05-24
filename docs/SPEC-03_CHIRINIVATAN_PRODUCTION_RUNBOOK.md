# Chirin Ivatan Production Runbook

This runbook is the exact production target for the current live deployment plan.

## Production identity

- Frontend domain: `https://chirinivatan.com`
- API/admin domain: `https://api.chirinivatan.com`
- Server IP: `5.223.52.103`
- Hostname label: `chirin-ubunti-4gb-sin-1`

## DNS records at Porkbun

Create these records:

- `A` record: host `@` -> `5.223.52.103`
- `A` record: host `api` -> `5.223.52.103`
- `A` record: host `www` -> `5.223.52.103`

Optional:

- `AAAA` records only if IPv6 is configured and tested on the server.

## Backend production env

Copy [backend/.env.production.example](/Users/admin/Documents/GitHub/ChirinIvatan/backend/.env.production.example) to `backend/.env.production` on the server and use values shaped like this:

```env
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=<strong-random-secret>
DJANGO_ALLOWED_HOSTS=api.chirinivatan.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://chirinivatan.com,https://www.chirinivatan.com,https://api.chirinivatan.com

DJANGO_DB_ENGINE=django.db.backends.postgresql
DJANGO_DB_NAME=chirin_prod
DJANGO_DB_USER=chirin_prod_user
DJANGO_DB_PASSWORD=<strong-random-password>
DJANGO_DB_HOST=127.0.0.1
DJANGO_DB_PORT=5432

DJANGO_SECURE_SSL_REDIRECT=True
DJANGO_SESSION_COOKIE_SECURE=True
DJANGO_CSRF_COOKIE_SECURE=True
DJANGO_SECURE_HSTS_SECONDS=31536000
DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=True
DJANGO_SECURE_HSTS_PRELOAD=True

DJANGO_STATIC_ROOT=/var/www/chirin/static
DJANGO_MEDIA_ROOT=/var/www/chirin/media
```

## Frontend production env

Copy [frontend/.env.production.example](/Users/admin/Documents/GitHub/ChirinIvatan/frontend/.env.production.example) to `frontend/.env.production` on the server and set:

```env
VITE_API_BASE=https://api.chirinivatan.com
```

## Nginx target

Use [deploy/nginx/chirinivatan.com.conf](/Users/admin/Documents/GitHub/ChirinIvatan/deploy/nginx/chirinivatan.com.conf) as the server site file.

Install location:

```text
/etc/nginx/sites-available/chirin.conf
```

Enable it with:

```bash
ln -s /etc/nginx/sites-available/chirin.conf /etc/nginx/sites-enabled/chirin.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

## Gunicorn target

Use [deploy/systemd/chirin-backend.production.service](/Users/admin/Documents/GitHub/ChirinIvatan/deploy/systemd/chirin-backend.production.service) as the systemd unit file.

Install location:

```text
/etc/systemd/system/chirin-backend.service
```

Then:

```bash
systemctl daemon-reload
systemctl enable --now chirin-backend
systemctl restart chirin-backend
```

## SSL

After DNS resolves to the server:

```bash
certbot --nginx -d chirinivatan.com -d www.chirinivatan.com
certbot --nginx -d api.chirinivatan.com
```

## Smoke test

Frontend:

- `https://chirinivatan.com`
- `https://chirinivatan.com/dictionary-view`
- `https://chirinivatan.com/folklore-view`

API/admin:

- `https://api.chirinivatan.com/admin/`
- `https://api.chirinivatan.com/api/reviews/dashboard`

## Notes

- This project uses split origin in production.
- Frontend is served as static files by Nginx.
- Django handles API, admin, static collection, and media paths on the API domain.

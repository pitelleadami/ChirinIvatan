# Public Deployment Template

This document describes the deployment shape without exposing the live server,
private hostnames, backup paths, credentials, or operator-only procedures.

## Components

- Django backend served by Gunicorn or another WSGI server.
- Vite/React frontend built with `npm run build` and served as static files.
- Nginx or an equivalent reverse proxy for HTTPS, static files, media files, and
  `/api/` routing.
- PostgreSQL for production data.
- Environment variables stored outside version control.

## Public-Safe Environment Pattern

Use the committed `.env.example` files as templates only. Real values should live
on the server or in a private secret manager.

Required production categories:

- Django secret key
- database connection settings
- allowed hosts and CSRF trusted origins
- email delivery settings
- CAPTCHA or Turnstile keys, if enabled
- optional error-reporting DSN

## Release Shape

1. Run backend checks and tests.
2. Run frontend lint/build checks.
3. Build the frontend.
4. Copy backend code and frontend build artifacts to the server.
5. Run Django migrations and static collection.
6. Restart the backend service.
7. Verify health checks and core user workflows.

## Private Operator Notes

The following should remain private:

- actual server IP addresses
- SSH users and access patterns
- real Nginx production config
- real systemd service files
- production backup/restore commands and storage paths
- private beta password or account credentials
- exact database names, usernames, and hostnames

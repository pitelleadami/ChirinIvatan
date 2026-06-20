# ADR-0010: Fail Closed For Debug And Secret Key Settings

Date: 2026-06-19  
Status: Accepted

## Context

Django's `DEBUG=True` exposes detailed stack traces and configuration context. A committed `django-insecure-*` secret key fallback is also unsafe because a public repository makes that fallback known to anyone.

If production starts without the expected environment variables, the application should fail loudly instead of silently running with insecure defaults.

## Decision

Backend settings now:

- default `DJANGO_DEBUG` to `False`
- require `DJANGO_SECRET_KEY` whenever debug is not true
- allow a local-only fallback secret only when `DJANGO_DEBUG=True`

## Alternatives Considered

- Keep `DEBUG=True` as the default for local convenience.
- Keep a committed insecure secret as a fallback.
- Warn in documentation only, without changing runtime behavior.

## Rationale

Production security should fail closed. Local development can still opt into debug explicitly using `backend/.env.local`.

## Consequences

- Running Django without environment variables may fail locally until `DJANGO_DEBUG=True` and a local secret are loaded.
- Staging/production misconfiguration is caught at startup instead of becoming a public security exposure.

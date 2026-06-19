# ADR-0013: Automate And Test Data Backups

Date: 2026-06-19

## Status

Accepted

## Context

Chirin Ivatan stores cultural and contributor data in PostgreSQL and uploaded media on disk. Existing release snapshots protect code and built frontend assets during deployment, but they are not a reliable recovery mechanism for live submitted content.

An untested backup is a serious preservation risk because the project holds community cultural material, contributor identities, media, and review history.

## Decision

Use a daily automated backup job that captures both:

- a PostgreSQL custom-format dump
- a compressed archive of the production media directory

Each backup includes a manifest with counts, sizes, and checksums.

Use a restore smoke test that restores a backup into a temporary PostgreSQL database and extracts media into a temporary directory. The smoke test must not overwrite production.

## Alternatives Considered

- Keep deployment snapshots only. Rejected because they mostly cover code/build artifacts, not complete live data.
- Backup only the database. Rejected because uploaded photos, audio, and profile images are part of the cultural record.
- Rely only on provider-level disk snapshots. Useful as a second layer, but not sufficient as the application-level backup of record.

## Consequences

- Operators can prove that database and media backups are recoverable.
- Backup status can be checked with systemd timers and service logs.
- Storage must be monitored and old backups retained according to policy.
- A future improvement should copy encrypted backups off-server so one server failure does not remove both production and backups.

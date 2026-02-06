# Chirin Ivatan — System Architecture

## Overview
Chirin Ivatan is a community-based information system for preserving
the Ivatan language and folklore. The system follows a modular,
backend-first architecture using Django and Django REST Framework.

## Backend
- Framework: Django
- API: Django REST Framework (REST, JSON)
- Authentication: Django auth (role-based extension planned)
- Administration: Django Admin

## Planned Django Apps
- users: user accounts and roles
- dictionary: Ivatan-English dictionary entries and audio
- folklore: stories, myths, proverbs
- reviews: moderation and approval workflow
- core: shared utilities and base models

## Frontend
The frontend will consume the REST API. Initial development may use
Django templates, with the option to migrate to a JavaScript framework
later.

## Database
PostgreSQL is planned for production. SQLite may be used temporarily
during early development.

## Scope Control
Business logic, models, and database migrations are intentionally
deferred until the architecture and data model are finalized.

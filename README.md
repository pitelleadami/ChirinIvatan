# Chirin Ivatan

Chirin Ivatan is a community-based information system for preserving and promoting
the Ivatan language and folklore. It brings together a digital Ivatan-English
dictionary with audio, a folklore archive, and a community contribution workflow
into one web platform.

The project exists because the existing Ivatan language resources are scattered,
mostly in print, and hard for ordinary users to reach. The goal is a single,
accessible place where the community, educators, and younger Ivatans can document,
learn, and help validate their own language and stories.

This repository holds the source code. Live content, uploaded media, and any
production secrets are kept separate and are not part of this repository (see
[Privacy and security](#privacy-and-security)).

## Overview

The platform has three main parts:

- A dictionary of Ivatan terms with meanings, parts of speech, phonetics, example
  sentences, dialect variants, and audio pronunciation.
- A folklore archive organised into categories such as oral narratives, wisdom and
  expressions, songs and poetry, beliefs and ritual life, and traditional knowledge.
- A contribution and review system where registered users submit entries that go
  through reviewer approval before they appear publicly.

Submissions are never published directly. They are stored as revisions and only
become live after they pass review, so the public dictionary and archive stay
trustworthy.

## Tech stack

**Frontend**

- React with Vite
- TipTap rich text editor (folklore content)
- Cloudflare Turnstile (bot protection on forms)

**Backend**

- Django and Django REST Framework
- PostgreSQL in production, SQLite for local development
- Gunicorn and Nginx for deployment

**Testing and tooling**

- Django test suite (backend)
- Playwright (end-to-end tests by role)
- ESLint and Prettier
- Sentry for error monitoring

## Features

- Searchable Ivatan-English dictionary with audio pronunciation and phonetic spelling
- Dialect variants grouped under one shared meaning (Ivasayen, Isamurungen, Itbayaten,
  and common usage)
- Folklore archive with categories and subcategories
- Role-based accounts: visitor, contributor, reviewer, consultant, and admin
- Revision-based submission workflow with reviewer approval before publishing
- Reviewer approval that requires a quorum (two reviewers, or one reviewer and an admin)
- Reject and request-revision flow with feedback sent back to the contributor
- Role application and invitation process for reviewers and consultants
- Contribution recognition: levels, badges, and leaderboards
- Notifications for submission status and review activity
- Admin maintenance mode and content moderation tools
- Source privacy: a contributor's personal source is hidden when the entry is from
  their own knowledge

## Screenshots

Screenshots live in `docs/screenshots/`. Add images there and link them here.

<!--
![Dictionary page](docs/screenshots/dictionary.png)
![Folklore archive](docs/screenshots/folklore.png)
![Reviewer dashboard](docs/screenshots/reviewer-dashboard.png)
-->

## Local setup

You need Python 3.12+, Node.js, and Git.

### Backend

```bash
cd backend
python -m venv ../venv
source ../venv/bin/activate        # Windows: ..\venv\Scripts\activate
pip install -r requirements.txt

cp .env.local.example .env.local   # then edit .env.local with your own values
python manage.py migrate
python manage.py runserver
```

The backend reads configuration from environment variables. The example file lists
every variable the app expects. Do not commit your filled-in `.env.local`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at the Vite dev server URL (default `http://127.0.0.1:5173`) and talks
to the Django backend.

## Testing

### Backend

```bash
cd backend
source ../venv/bin/activate
python manage.py test
```

### Frontend

```bash
cd frontend
npm run lint        # code style
npm run e2e         # Playwright end-to-end tests
```

## Capstone context

Chirin Ivatan is the capstone project for the Master of Information Systems program
at the University of the Philippines Open University, Faculty of Information and
Communication Studies. It was proposed and built across the IS295A and IS295B course
sequence.

The accompanying manuscript covers the background, objectives, system design,
implementation, and evaluation (including System Usability Scale testing). Project
documentation lives in the `docs/` folder.

## Privacy and security

The code is open source, but the project keeps public and private cleanly separate:

- **Secrets** (database credentials, Turnstile keys, email passwords, Sentry DSN) are
  read from environment variables and are never committed. Only example files with
  placeholder values are in the repository.
- **User-uploaded media and live database content** are stored outside the repository
  and are backed up separately.
- **Submitted content is reviewed by people**, not auto-published. Contributors,
  reviewers, consultants, and admins have different permission levels.
- Forms use Cloudflare Turnstile and Django CSRF protection. Passwords are hashed by
  Django. Production runs over HTTPS with secure cookies and HSTS.
- A contributor's private source information is masked when an entry comes from their
  own knowledge.

## License

See [LICENSE](LICENSE).

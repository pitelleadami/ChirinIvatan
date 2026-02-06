# SPEC-1-Chirin Ivatan – Implementation

This document defines the **execution-level implementation plan** for Chirin Ivatan. It is fully synchronized with the approved **Main SPEC** and **Method** documents and reflects all finalized governance, cultural, and technical decisions.

---

## Implementation

The implementation prioritizes **correct governance, ethical knowledge handling, and auditability** while remaining achievable by a solo developer during IS295B.

---

## Technology Stack

- **Frontend**: React.js (responsive, mobile-first)
- **Backend**: Django (Python) with Django REST Framework
- **Database**: PostgreSQL
- **Authentication**: Django built-in authentication (custom user model)
- **Media Storage (MVP)**: Server filesystem via `MEDIA_ROOT`
- **Media Strategy**:
  - Dictionary audio: server-hosted files
  - Folklore multimedia: audio files and YouTube embeds
- **Version Control**: Git + GitHub

---

## Step 1: Project and App Setup

Create a Django project with the following apps:

- `accounts` – authentication, roles, profiles, team directory
- `dictionary` – Ivatan–English terms and pronunciation audio
- `folklore` – folklore entries and embedded media
- `reviews` – moderation logic, approval rules, audit logs

Configure PostgreSQL and environment variables for deployment.

---

## Step 2: Authentication, Roles, and Profiles

### User Model

- Extend `AbstractUser` to store:
  - `first_name`, `middle_name`, `last_name`
  - `role` (CONTRIBUTOR, REVIEWER, ADMIN)
  - `occupation`
  - `municipality` (declared as source of Ivatan language influence)
  - `bio`, `affiliation`

### Derived Identity Rules

- **Display name (entries)**: First initial + Last name
- **Team page name**: First name + Middle initial + Last name

### Profiles

- Public profile page for every user
- Displays:
  - Name
  - Role badge
  - Occupation and municipality
  - Contribution counters (approved only)
- Users may edit profile fields and visibility

---

## Step 3: Role-Based Access Control & Ethics Safeguards

- Contributors can submit content
- Reviewers can approve/reject content
- Administrators have full system control **except**:
  - They may not approve their own entries

### Approval Rule Enforcement

An entry becomes **APPROVED** only if:
- Two reviewers approve, **OR**
- One reviewer and one administrator approve

Self-approval is programmatically blocked.

---

## Step 4: Dictionary Module Implementation

### Dictionary Entries

- One entry represents an **Ivatan–English term pair**
- Search works in both directions
- Fields include:
  - Ivatan term
  - English term
  - Definition, part of speech, example
  - Optional variant tag (Isamurong, Ivasay, Itbayaten, Isabtang, General Ivatan)
  - Source text + self-knowledge flag

Variant tags are displayed **only if not General Ivatan**.

### Audio Pronunciation

- Audio applies only to Ivatan terms
- Contributors may:
  - Upload audio during entry creation, **or**
  - Add audio later to an approved entry

Audio submissions:
- Enter a **separate review workflow**
- Do **not** display audio contributor names publicly

---

## Step 5: Folklore Module Implementation

### Folklore Entries

- Required: text content
- Optional:
  - Audio file upload
  - YouTube video embed (URL validated and rendered via iframe)

Categories include:
- Myth
- Legend
- Laji
- Poem
- Proverb
- Idiom

Folklore entries also support optional Ivatan variant tagging.

---

## Step 6: Review & Moderation System

### Review Queue

- Separate queues for:
  - Dictionary text
  - Dictionary audio
  - Folklore entries

### Review Actions

- Approve
- Reject with feedback
- Request revision

All actions are logged in `ReviewLog`.

### Public Attribution

Approved entries display:
- Contributor name (derived display name)
- Reviewer attribution:
  - "Reviewed and approved by K. Adami, R. Diaz"

Reviewer names link to profiles.

---

## Step 7: Team Directory

- Dedicated Team page listing users by role:
  - Lead Developer
  - Consultants
  - Reviewers
  - Contributors
  - Sponsors (if any)

Names link to user profiles.

---

## Step 8: Contribution Metrics

Each user profile displays counts of **approved contributions only**, including:

- Dictionary terms
- Audio pronunciations
- Myths
- Laji
- Poems

Counts are calculated dynamically from approved records.

---

## Step 9: Frontend Integration

- React consumes Django REST APIs
- Core views:
  - Dictionary browse/search
  - Entry detail pages
  - Audio playback
  - Folklore archive
  - Submission forms
  - Review dashboard
  - User profiles & team page

UI emphasizes clarity, accessibility, and low-bandwidth use.

---

## Step 10: Deployment & Maintenance

- Deploy with HTTPS
- Configure static and media file serving
- Schedule regular database and media backups
- Maintain moderation logs for auditability

---

## Step 11: Replication Support

- Language-specific branding via environment variables
- Initial data loaded from JSON/YAML fixtures
- Documentation includes Fork & Deploy guide

This implementation plan is now **fully aligned** with the approved design and governance model of Chirin Ivatan.


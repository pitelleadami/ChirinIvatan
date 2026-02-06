# SPEC-1-Chirin Ivatan – Implementation

This document contains the **Implementation section only**, separated for clarity and ease of execution during IS295B. It is directly derived from the approved architecture and requirements of the Chirin Ivatan system.

---

## Implementation

This section outlines concrete, step-by-step actions to build the Chirin Ivatan MVP in a way that is **fully implementable**, **academically defensible**, and **future-proof**.

### Technology Stack

- **Frontend**: React.js (with standard HTML/CSS for initial pages)
- **Backend**: Django (Python)
- **Database**: PostgreSQL
- **Authentication**: Django built-in authentication system
- **Media Storage (MVP)**: Server filesystem via Django `MEDIA_ROOT`
- **Media Storage (Future-ready)**: Designed for migration to cloud object storage (S3-compatible)
- **Version Control**: Git + GitHub

---

### Step 1: Project Setup

1. Create a Django project and core app structure:
   - `accounts` (authentication, roles, profiles)
   - `dictionary` (Ivatan–English terms & pronunciations)
   - `folklore` (stories, proverbs, songs)
   - `reviews` (moderation & audit logs)

2. Configure PostgreSQL as the primary database using Django ORM.

---

### Step 2: Authentication, Roles, and Profiles

- Use **Django’s built-in authentication** for:
  - User registration
  - Login / logout
  - Secure password hashing

- Extend the default User model using `AbstractUser`

- Implement role-based access control:
  - CONTRIBUTOR
  - REVIEWER
  - ADMIN

- Implement user profiles:
  - Public profile page per user
  - Display name format: *First initial + Last name*
  - Role badge shown on profile and entries
  - Users can edit bio and affiliation fields

---

### Step 3: Media Storage Design (Server-first, Cloud-ready)

#### MVP Configuration

- Store audio pronunciation files on the **application server filesystem** using:
  - Django `FileField`
  - `MEDIA_ROOT` for storage
  - `MEDIA_URL` for access

- Audio files are:
  - Short (2–6 seconds)
  - Compressed (MP3/OGG)
  - Referenced in the database by path/URL only

#### Design Rules to Enable Future Cloud Migration

- Never store audio binaries in the database
- Never hardcode file paths in templates or views
- Always access audio via `audio_file.url`
- Treat all media as external resources

---

### Step 4: Dictionary Module Implementation

- Implement dictionary entry CRUD operations
- Each entry stores:
  - Ivatan term
  - English term
  - Definition
  - Part of speech
  - Example sentence
  - Source text (free-text)
  - Self-knowledge flag

- Search implementation:
  - Searching either Ivatan or English returns the same entry

- Audio pronunciation:
  - Ivatan term only
  - Separate approval workflow

- Public visibility:
  - Only APPROVED entries are visible

---

### Step 5: Folklore Module Implementation

- Implement folklore submission with required **text content**
- Categories enforced via enum (myth, legend, proverb, idiom, song)
- Source attribution mandatory at submission
- Same moderation workflow as dictionary entries

---

### Step 6: Review and Moderation Workflow

- Reviewer dashboard for reviewers and admins
- Actions supported:
  - Approve
  - Reject with comments
  - Request revision

- All actions logged in `ReviewLog`
- Public entries display:
  - Contributor name
  - Reviewer attribution (clickable names)

---

### Step 7: Frontend Integration

- React UI consumes Django REST APIs
- Core screens:
  - Dictionary browse & search
  - Folklore archive
  - Submission forms
  - Reviewer dashboard
  - User profile pages

- Mobile-first responsive design

---

### Step 8: Deployment (MVP)

- Deploy Django app on budget-friendly hosting
- Enable HTTPS
- Configure static and media file serving
- Implement database and media backups

---

### Step 9: Documentation and Replication Guide

- Developer documentation:
  - Local setup instructions
  - Environment configuration
  - Role definitions

- Replication guide:
  - How to fork the project
  - How to seed a new language dataset
  - How to rebrand for another community


# SPEC-03 Plain English Website Page Map

This document is written in plain English.

Goal: help you check what already exists, what each role can do, and what is still missing.

## How To Use This Document

1. Read by role order: Visitor, Contributor, Reviewer.
2. For each page, check 3 things:
- What the user can see
- What the user can do
- What is still missing
3. Mark missing items so they become your frontend to-do list.

## Role 1: Visitor (not logged in)

### Page: Home

What visitor can see:
- Project introduction
- Basic project purpose
- Navigation to the main pages

What visitor can do:
- Open other public pages
- Open admin login link

What is still missing:
- Final polished public landing design
- Final storytelling sections (if you want a richer public homepage)

### Page: Dictionary Viewer

What visitor can see:
- Dictionary term details
- Meaning and semantic section
- Variant section
- Connected variants list
- Contributor and attribution details (with masking rules applied)

What visitor can do:
- Enter a term entry ID and load details
- Open directly if a link already has the entry ID

What is still missing:
- Final public-friendly dictionary page design
- Easier browse/search experience (instead of technical ID loading)

### Page: Folklore Viewer

What visitor can see:
- Public folklore list
- Folklore entry details
- Source/media visibility masking behavior

What visitor can do:
- Refresh public list
- Open a specific folklore item

What is still missing:
- Final polished archive browsing UI
- Better filter and search controls

### Page: Public User Profile (data exists, full page still needed)

What visitor can see today:
- Profile information data is available from backend
- Contribution summary data is available
- Accountability label data is available

What visitor can do today:
- Can access profile data if frontend page consumes it

What is still missing:
- Dedicated frontend profile page
- Profile layout and visuals

### Page: Leaderboards (data exists, full page still needed)

What visitor can see today:
- Global leaderboard data exists
- Municipality leaderboard data exists

What visitor can do today:
- Can access leaderboard data if frontend page consumes it

What is still missing:
- Dedicated frontend leaderboard page
- Sorting/filter controls in UI

## Role 2: Contributor (logged in contributor)

### Page: Folklore Draft Builder

What contributor can see:
- Folklore form fields
- Draft status and own revisions list
- Validation and feedback messages

What contributor can do:
- Create draft
- Update draft
- Submit draft for review
- Upload audio and photo
- Add media URL (example: YouTube link)

What is still missing:
- Final polished contributor UX
- More guided helper text for beginners (optional)

### Page: Contributor Dictionary Submission/Revision (important gap)

What contributor can see today:
- No dedicated contributor-friendly dictionary editor page yet

What contributor can do today:
- Dictionary creation/revision is mostly via admin/testing flows

What is still missing:
- A real contributor page for dictionary draft/create/edit/submit
- Full beginner-friendly dictionary form experience

### Page: Role Application (contributor/reviewer application)

What contributor can see today:
- Backend supports applications and decisions

What contributor can do today:
- Apply as contributor
- Apply as reviewer
- Check own application records (when UI is connected)

What is still missing:
- Dedicated frontend application page
- Friendly status timeline for submitted applications

## Role 3: Reviewer (logged in reviewer)

### Page: Reviewer Dashboard

What reviewer can see:
- Dictionary pending submissions
- Dictionary re-review queue
- Dictionary published entries that can be flagged
- Folklore pending submissions
- Folklore re-review queue
- Folklore published entries that can be flagged

What reviewer can do:
- Approve
- Reject (with notes)
- Flag for re-review (with notes)

What is still missing:
- Final polished dashboard design
- Better visual status filtering controls

### Page: Role Screening / Invitations (backend-ready, UI still needed)

What reviewer can do in rules:
- Approve contributor applications
- Approve reviewer applications based on quorum rules
- Send direct invite as contributor or reviewer

Reviewer application quorum now:
- 1 reviewer + 1 admin
OR
- 2 reviewers

What is still missing:
- Frontend page for reviewer/admin to process applications
- Frontend page/form for sending invitations

## Accountability Visibility Rule (Plain English)

In public profile, visitors should be able to see onboarding accountability text such as:
- Invited as Contributor by [Name]
- Approved as Reviewer by [Name] and [Name]

Status:
- Backend support exists
- Frontend profile page still needed to display it clearly

## High-Priority Missing Frontend Pages (Build Next)

1. Public Profile Page
2. Leaderboard Page
3. Contributor Dictionary Submission/Revision Page
4. Role Application Page (for applicants)
5. Role Screening/Invitation Page (for reviewer/admin)

## Quick Reality Check

If you ask: “Are we close?”

Answer:
- Backend is now strong, test-backed, and migration-clean (core governance + onboarding + gamification v2).
- Database state is healthy (no pending migrations, no schema drift detected).
- Most remaining delivery work is frontend pages, UI polish, and graphics/branding integration.
- You are close to a fully usable product once frontend screens are completed.

## Backend Health Snapshot (2026-02-27)

- `python3 manage.py makemigrations --check --dry-run` -> no changes detected
- `python3 manage.py migrate --plan` -> no pending migration operations
- `python3 manage.py check` -> no system issues
- `python3 manage.py test users reviews dictionary folklore` -> passing

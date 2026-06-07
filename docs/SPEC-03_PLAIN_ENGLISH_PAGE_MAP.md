# SPEC-03 Plain English Screen Map

Status: current screen contract
Last updated: 2026-06-06
Detailed rebuild source: `docs/SPEC-03_REBUILD_SPEC.md`

This document lists every user-facing screen, who can use it, and what must be inside it.

---

## 1. Global Navigation and Shell

Appears across the app.

Must include:

- Chirin Ivatan logo/brand link to Home.
- Visitor navigation:
  - About the Project
  - The Digital Yaru
  - Dictionary
  - Folklore
  - Hall of Stewards
  - FAQs
  - Log In
- Authenticated Workspace menu:
  - My Profile
  - Steward's Desk
  - Reviews for reviewer/admin/consultant
  - Applications for reviewer/admin
  - Add New Dictionary Entry
  - Add New Folklore Entry
  - FAQs
  - Django Admin Console for admins
  - Log Out
- Mobile menu.
- Footer on normal interior pages.
- Maintenance screen override when admin pauses public site access.

---

## 2. Visitor Screens

### 2.1 Home

Route: `/`

Visitor can see:

- project brand and introduction
- public purpose/value statement
- dictionary and folklore exploration buttons
- Join the Digital Yaru button
- live dictionary/folklore counts
- latest/featured archive previews
- Hall of Stewards preview
- support statements and partner details if admin populated them

Existing contributors/reviewers/admins must not see the join button.

### 2.2 About the Project

Route: `/about`

Must show:

- admin-managed heading
- intro paragraphs
- main project description
- rationale
- future directions
- final quote
- statements of support if populated
- partner details if populated

### 2.3 The Digital Yaru

Route: `/yaru`

Must show:

- admin-managed Yaru heading and intro
- explanation of community roles
- Yaru member/profile chart
- profile links
- call to apply for visitors/non-members

### 2.4 Dictionary Viewer

Route: `/dictionary-view`

Visitor can:

- browse/search approved dictionary entries
- open a dictionary detail
- listen to approved audio if present
- inspect photos if present
- see connected variants

Must show:

- term
- meaning
- part of speech
- variant type
- pronunciation/phonetic text
- examples
- usage notes
- etymology
- synonyms/antonyms
- inflected forms
- semantic core from mother term
- variant-specific fields from selected variant
- contributor/approval attribution
- masked source fields where required
- public revision history

### 2.5 Folklore Viewer

Route: `/folklore-view`

Visitor can:

- browse approved folklore entries
- filter by category/subcategory
- open a folklore detail
- view/listen to public media

Must show:

- title
- category and subcategory
- municipality source
- content
- source unless self-knowledge
- media source unless self-produced
- photo/audio/media URL when present
- contributor
- license
- public revision history

### 2.6 Hall of Stewards

Route: `/leaderboards`

Visitor can:

- view individual rankings
- view municipality rankings
- filter by recognition, period, and municipality
- refresh list
- open public profiles from ranking rows

Must show:

- "Filters" label
- Recognition filter: Combined, Dictionary, Folklore
- Period filter: Current Month, All Time
- Municipality filter: All, Basco, Mahatao, Ivana, Uyugan, Sabtang, Itbayat
- Refresh button
- archive counts
- individual ranking table
- municipality ranking panel

Mobile:

- filters are compact
- Recognition column is hidden in ranking table

### 2.7 FAQs and Manual

Routes:

- `/faqs`
- `/manual`

Both render the FAQ page.

Must show:

- FAQ hero/title
- role-aware FAQ sections
- table of contents
- accordion question/answer rows
- optional bullets and images
- dictionary field guides for authorized users

Must not show repeated "FAQ Section" labels inside every section.

### 2.8 Role Center

Route: `/roles`

Visitor can:

- read contributor/reviewer role cards
- apply as contributor
- check public application status
- claim approved access
- accept role invitation

Must show:

- contributor card
- reviewer card
- application/status panel
- email/status checker where applicable
- account setup flow for approved applicants
- popup/feedback after application submission

### 2.9 Maintenance Screen

Virtual screen shown when admin pauses the site.

Visitor sees:

- maintenance heading
- admin-entered maintenance message
- Admin Login button

Non-admin authenticated user sees:

- same message
- Log Out button

Admins bypass this screen.

---

## 3. Contributor Screens

### 3.1 Login

Route: `/login`

Must include:

- username
- password
- Log in button
- Back to Home button
- generic public error for backend/network failures

Redirect rules:

- incomplete profile -> Profile Edit
- reviewer non-admin -> Reviewer Dashboard
- other authenticated user -> Steward's Desk

### 3.2 Profile Edit

Route: `/profile-edit`

Contributor can edit:

- first name
- last name
- municipality
- post-nominals
- cultural affiliation details
- other affiliation details
- occupation/role summaries
- bio
- profile photo

Must not include:

- leaderboard hiding control

### 3.3 Public Profile

Route: `/profile-view?username=<username>`

Owner can:

- view own public profile
- edit profile
- apply as reviewer if contributor but not reviewer/admin

Profile must show:

- avatar/photo
- display name and username
- municipality
- affiliation/occupation
- post-nominals
- bio
- role/accountability labels
- contribution summary
- live contributions if visible
- achievements
- next badge progress for dictionary, folklore, and quality
- full badge catalog in a popup/modal
- recognition events
- cultural stewardship section

Admin-only on profile:

- public visibility controls
- hide/show from leaderboard

### 3.4 Dictionary Draft Builder

Route: `/dictionary-draft`

Contributor can:

- create dictionary draft
- edit own draft
- start revision from approved entry
- submit for review
- delete draft

Must include:

- term
- meaning
- part of speech
- variant type
- pronunciation text
- phonetic text
- audio upload/source/self-recorded
- photo upload/source/contributor-owned
- source/self-knowledge
- example sentence and translation
- usage notes
- etymology
- synonyms and antonyms
- inflected forms
- additional variant rows
- field guide links
- own draft/revision list

### 3.5 Folklore Draft Builder

Route: `/folklore-draft`

Contributor can:

- create folklore draft
- edit own draft
- revise approved folklore entry
- submit for review
- delete draft

Must include:

- title
- content
- category
- subcategory
- municipality source
- source/self-knowledge
- media URL
- photo upload
- audio upload
- media source/self-produced
- copyright/license notice
- validation messages
- own draft/revision list

### 3.6 Steward's Desk - Contributions

Route: `/admin-applications?tab=contributions`

Contributor can see:

- own dictionary contribution drafts/revisions
- own folklore contribution drafts/revisions
- create buttons
- edit draft buttons
- public entry links

---

## 4. Reviewer and Consultant Screens

### 4.1 Reviewer Dashboard

Route: `/dashboard`

Reviewer/consultant/admin can see:

- dictionary pending submissions
- dictionary under re-review
- folklore pending submissions
- folklore under re-review
- recent own reviews
- items awaiting quorum after own approval

Can do:

- approve
- reject with notes
- flag eligible public items with notes

Rules:

- own submissions do not appear for self-review
- reject and flag require notes

### 4.2 Public Detail Review Actions

Routes:

- `/dictionary-view`
- `/folklore-view`

Reviewer/admin can:

- flag approved public entry for re-review

Must require:

- notes explaining why re-review is needed

---

## 5. Admin Screens

### 5.1 Steward's Desk

Route: `/admin-applications`

Admin must have access to all tabs:

- Overview/activity
- Reviews
- Applications
- Invitations
- People
- Contributions
- Site Content

### 5.2 Applications Tab

Must show:

- role applications
- applicant identity
- target role
- status
- reviewer reason
- decision history
- quorum status

Admin/reviewer can:

- approve
- reject with notes

Reviewer application quorum:

- any two distinct reviewers/admins

### 5.3 Invitations Tab

Must support:

- invite existing user into role
- send email invitation
- list invitations
- show pending/accepted/revoked state

Admin-only:

- consultant invitations
- admin invitations

### 5.4 People Tab

Must support:

- user search/list
- managed consultant profile creation
- view user activity
- edit public visibility flags
- hide/show from Yaru chart
- hide/show live contributions
- hide/show leaderboard participation

Leaderboard hiding is admin-only.

### 5.5 Site Content Tab

Must support:

- maintenance mode toggle
- maintenance message editor
- About page editor
- Yaru page editor
- support statement rows
- partner detail rows
- FAQ section editor
- FAQ role visibility
- FAQ question/answer editor
- FAQ bullets
- FAQ image URL
- FAQ image upload
- Save Site Content button

### 5.6 Django Admin Console

Route:

- `/admin/` on backend domain

Use for:

- emergency inspection
- model-level debugging
- admin-level data correction

Must not replace public/admin React workflows for normal use.

---

## 6. Operational Screens and States

### 6.1 Error and Alert Behavior

Public users:

- must not see localhost/Django operational hints.
- login infrastructure failure should say a generic "try again later" message.

Admins:

- may see technical details in admin/dev contexts.

### 6.2 Empty States

Every list/table must have a friendly empty state:

- no rankings yet
- no applications
- no contributions
- no FAQ rows
- no review queue items

### 6.3 Popup/Modal Rules

Use popups/modals for:

- full badge catalog
- authenticated application submitted confirmation
- destructive confirmation where needed

Do not expand full badge catalog into the main profile page.

---

## 7. Quick Role Matrix

Visitor:

- browse public content
- apply/join
- check status

Contributor:

- visitor access
- drafts/revisions
- own contributions
- profile editing
- reviewer application

Reviewer:

- contributor access
- review queues
- application decisions
- flag re-review

Consultant:

- reviewer-level review access
- consultant public role/accountability

Admin:

- all access
- people management
- site content
- maintenance mode
- admin overrides
- leaderboard visibility

# SPEC-03 Frontend Figma Handoff (Implementation-Aligned)

Status: active design handoff for the current frontend codebase  
Target: `frontend/` React + Vite app  
Purpose: design in Figma without drifting from backend/API behavior

---

## 1) Start Point (What Already Exists)

Current frontend routes:
- `/` Home
- `/dashboard` Reviewer Dashboard
- `/dictionary-view` Dictionary Viewer
- `/folklore-view` Folklore Viewer
- `/folklore-draft` Folklore Draft Builder

Current API integration is already wired for:
- reviewer dashboard and review actions
- dictionary detail view
- folklore public list/detail
- folklore draft create/update/submit

Design goal now:
- improve visual quality and UX clarity in Figma
- keep behaviors and validation contracts unchanged

---

## 2) Information Architecture (Figma Pages)

Create these Figma pages:
1. `00 Foundations`
2. `01 Global Shell`
3. `02 Reviewer Dashboard`
4. `03 Dictionary Viewer`
5. `04 Folklore Viewer`
6. `05 Folklore Draft Builder`
7. `06 Empty/Error/Loading States`
8. `07 QA Signoff Frames`

---

## 3) Foundations (Design Tokens to Define in Figma)

Define and name tokens clearly:

Color tokens:
- `bg/app`
- `bg/panel`
- `text/primary`
- `text/muted`
- `border/default`
- `status/success`
- `status/error`
- `action/primary`
- `action/secondary`
- `action/danger`

Spacing tokens:
- `space/4`, `space/8`, `space/12`, `space/16`, `space/24`, `space/32`

Radius tokens:
- `radius/sm`, `radius/md`, `radius/lg`, `radius/pill`

Typography tokens:
- `type/h1`
- `type/h2`
- `type/body`
- `type/meta`
- `type/button`

State tokens:
- default
- hover
- disabled
- focus

---

## 4) Global Shell Spec

Layout:
- top nav + page content container
- max width desktop container
- responsive single column under tablet width

Nav items:
- Home
- Reviewer Dashboard
- Dictionary Viewer
- Folklore Viewer
- Folklore Draft Builder
- Admin Login (external/open new tab behavior)

Required states:
- active tab
- inactive tab
- hover
- disabled (if used)

---

## 5) Screen Contracts

## 5.1 Reviewer Dashboard (`/dashboard`)

Sections:
- Dictionary Pending Submissions
- Dictionary Re-review Queue
- Dictionary Published Entries (Flag Eligible)
- Folklore Pending Submissions
- Folklore Re-review Queue
- Folklore Published Entries (Flag Eligible)
- My Recent Reviews

Card content:
- title/term
- revision id
- entry id
- status badge
- optional review round
- note field
- actions

Actions by queue:
- Pending/Re-review: Approve + Reject
- Published: Flag

Rules to surface in UI copy:
- reject/flag require notes
- approve is quorum-based (2 reviewers OR 1 reviewer + 1 admin)

Feedback states:
- per-row inline error
- per-row last action/result
- global success banner
- global error banner

## 5.2 Dictionary Viewer (`/dictionary-view`)

Input:
- entry UUID field + load button

Display blocks:
- Header
- Semantic Core
- Variant Section
- Connected Variants
- Contributors and Attribution

Special behavior:
- supports query param `?entry_id=<uuid>` auto-load

## 5.3 Folklore Viewer (`/folklore-view`)

Inputs/actions:
- entry UUID field
- load detail
- refresh public list

Display:
- Public list cards
- Detail panel with:
  - source (masked if self-knowledge)
  - media_source (masked if self-produced)
  - media url/photo/audio
  - status/category/municipality

Special behavior:
- supports query param `?entry_id=<uuid>` auto-load

## 5.4 Folklore Draft Builder (`/folklore-draft`)

Form fields:
- title
- content
- category
- municipality_source
- source
- self_knowledge
- media_url
- media_source
- self_produced_media
- copyright_usage
- photo_upload
- audio_upload
- revision_id (for update/submit)

Primary actions:
- Create Draft
- Update Draft
- Submit Draft
- Refresh My Revisions

Validation hints to show:
- source required unless self_knowledge checked
- media_source required when media exists unless self_produced_media checked
- copyright blank defaults on approval

---

## 6) Component Inventory (Design Once, Reuse)

Core components:
- App Header / Nav Tabs
- Panel Container
- Queue Card
- Status Badge
- Form Field (input/select/textarea/file)
- Checkbox Row
- Button set (primary/secondary/danger/ghost)
- Alert Banner (error/success)
- JSON block viewer
- Empty state block

Create each with variants in Figma before polishing pages.

---

## 7) Interaction and Motion Guidance

Use subtle and purposeful motion only:
- panel fade/slide on load
- button hover/press feedback
- alert enter/exit transition

Avoid heavy animation in moderation workflows.

---

## 8) Responsive Breakpoints

Design at:
- Mobile: 375 width
- Tablet: 768 width
- Desktop: 1280 width

Rules:
- queue cards stack in one column on mobile
- action buttons wrap cleanly
- textarea and file inputs remain readable/tappable

---

## 9) API Mapping (For Design Accuracy)

Reviewer dashboard:
- `GET /api/reviews/dashboard`
- `POST /api/reviews/dictionary/submit`
- `POST /api/reviews/folklore/submit`

Dictionary:
- `GET /api/dictionary/entries/<entry_id>`

Folklore public:
- `GET /api/folklore/entries`
- `GET /api/folklore/entries/<entry_id>`

Folklore contributor:
- `GET /api/folklore/revisions/my`
- `POST /api/folklore/revisions/create`
- `PATCH /api/folklore/revisions/<revision_id>`
- `POST /api/folklore/revisions/<revision_id>/submit`

---

## 10) Figma-to-Code Workflow (Efficient Path)

1. Finalize Foundations page first (tokens + components).
2. Finalize Reviewer Dashboard (highest complexity and most risk).
3. Finalize the two Viewer pages.
4. Finalize Folklore Draft Builder.
5. Export spacing/type/color decisions into a compact token table.
6. Implement screen by screen, starting from Dashboard.

---

## 11) Definition of Done (Design Phase)

Design phase is done when:
- all five screens have desktop + mobile frames
- all component variants are defined
- all error/empty/loading states have dedicated frames
- each action has visible feedback state
- notes-required behavior is reflected in UI copy
- handoff annotations include component names and spacing specs

---

## 12) First Figma Task (Do This Now)

Start with `02 Reviewer Dashboard`:
- design one complete queue card with all states
- then compose the full page using repeated card components
- include at least:
  - default state
  - reject without notes error
  - successful action result
  - no items empty state

After that, move to `04 Folklore Viewer`.

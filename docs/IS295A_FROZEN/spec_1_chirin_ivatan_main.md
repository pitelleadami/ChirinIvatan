# SPEC-1-Chirin Ivatan: Community-Based Information System for Language and Folklore Conservation

## Background

The Ivatan language and folklore are critical components of the cultural identity of the Ivatan people in Batanes, Philippines. These intangible cultural assets—oral traditions, vocabulary, proverbs, myths, and songs—are increasingly endangered due to modernization, migration, declining intergenerational transmission, and recent policy changes reducing mother-tongue instruction in early education. Existing preservation efforts, such as printed dictionaries and academic ethnographic studies, are fragmented, static, and largely inaccessible to younger generations and non-academic audiences.

Chirin Ivatan is a web-based, community-driven information system designed to preserve, document, and revitalize the Ivatan language and folklore. The platform combines a bidirectional Ivatan–English digital dictionary with Ivatan-only audio pronunciation, a curated folklore archive, and a structured contribution-and-review workflow. The system emphasizes ethical knowledge management, transparency, and cultural validation while remaining replicable for other indigenous language communities through open-source distribution.

---

## Requirements

The system requirements are prioritized using the **MoSCoW** method.

### Must Have

- **Approval and Visibility Rules**
  - Only reviewer-approved entries are publicly visible
  - Each entry must be approved by **at least two reviewers**, **or** by **one reviewer and one administrator**
  - Contributors (including administrators acting as contributors) may **never approve their own entries**

- **Bidirectional Ivatan–English Dictionary**
  - Dictionary entries may be submitted as English → Ivatan or Ivatan → English
  - A single entry represents a term pair
  - Search works in both directions
  - Audio pronunciation applies **only to the Ivatan term**

- **Dictionary Audio Contribution Rules**
  - Contributors may optionally upload audio when creating a dictionary entry
  - If an approved entry has no audio, any contributor may later add an audio pronunciation
  - Audio submissions follow a **separate review cycle** from the text entry
  - **Audio contributor names are not publicly displayed**

- **Contributor, Reviewer, and Team Attribution**
  - Entries display contributor name as *First initial + Last name*
  - Reviewer attribution is shown as: *Reviewed and approved by …*
  - Contributor and reviewer names are clickable and link to profiles

- **User Profiles and Team Directory**
  - Users provide **first name, middle name, and last name** during registration
  - The system automatically generates:
    - Display name (First initial + Last name)
    - Team page name (First name + Middle initial + Last name)
  - Profiles include:
    - Role badge (Contributor / Reviewer / Administrator)
    - Occupation
    - Associated municipality (declared at sign-up as source of Ivatan language influence)
  - A dedicated **Team Page** lists all members by role:
    - Lead Developer
    - Consultants
    - Reviewers
    - Contributors
    - Sponsors (if any)

- **Source Attribution Rules**
  - Source declaration is mandatory at submission
  - Contributors must indicate whether the entry is self-knowledge or externally sourced
  - Self-knowledge sources are stored but hidden from visitors
  - External sources are displayed publicly

- **Ivatan Variant Tagging**
  - Contributors may optionally tag entries with a language variant:
    - Isamurong, Ivasay, Itbayaten, Isabtang, or General Ivatan
  - If no variant is selected, the entry defaults to **General Ivatan**
  - Variant tags are **only displayed to visitors if not General Ivatan**

- **Folklore Archive Module**
  - Supports folklore categories (e.g., myths, legends, laji, poems, proverbs, idioms)
  - Text content is required for all folklore entries
  - Optional multimedia support:
    - Audio file upload, and/or
    - Embedded YouTube video

- **Contribution Metrics (Profile Display)**
  - User profiles display counts of **approved contributions**, including:
    - Ivatan terms (dictionary entries)
    - Audio pronunciations
    - Myths
    - Laji
    - Poems

- **Role-Based Access Control (RBAC)**
  - Visitors: read-only access to approved content
  - Contributors: submit and manage own entries
  - Reviewers: review and approve entries
  - Administrators: full system control with conflict-of-interest safeguards

---

### Should Have

- Multiple reviewer approvals visible per entry
- Advanced filtering and full-text search

---

### Could Have

- Gamified learning features
- Native video hosting (beyond YouTube embeds)

---

### Won’t Have

- Native mobile applications
- Real-time collaboration features


## Method



Chirin Ivatan follows a **single-tenant, web-based architecture**, where one deployed instance supports one language community. Replication for other languages is achieved by forking and redeploying the system with new seed data and branding.

### Architectural Overview

- **Frontend**: Responsive web UI built with React
- **Backend**: Django-based application layer with REST APIs
- **Database**: PostgreSQL relational database
- **Authentication**: Built-in Django authentication
- **Media Handling**: Server-based storage (MVP), cloud-ready by design

The system is organized around a controlled content lifecycle (draft → review → approved) to ensure cultural accuracy, accountability, and trust.

### Governance & Transparency Model

- Contributors submit entries with mandatory source declaration
- Reviewers validate accuracy and cultural appropriateness
- Approved entries display contributor and reviewer attribution
- Public profiles provide contextual authority while respecting privacy

---

## Milestones

### Completed – IS295A

- Problem definition and background analysis
- Literature review and related systems analysis
- Functional and non-functional requirements
- Architecture and database design
- Wireframes and UX planning

### IS295B

1. Environment and core setup
2. Dictionary module implementation
3. Folklore module implementation
4. Review and moderation dashboard
5. Frontend integration
6. Testing and usability evaluation
7. Deployment and documentation

---

## Gathering Results

The system will be evaluated using **balanced metrics** aligned with MIS principles.

### Usability

- System Usability Scale (SUS) with at least 10 users
- Task-based testing and qualitative feedback
- Target SUS score ≥ 68

### Content & Participation

- Number of dictionary and folklore entries
- Contributor and reviewer activity
- Approval-to-rejection ratios

### System Performance

- Page load times under normal usage
- Successful submission and upload rates
- System stability during evaluation

Results will be analyzed collectively to assess usability, information quality, and technical reliability.

---

## Need Professional Help in Developing Your Architecture?

Please contact me at [sammuti.com](https://sammuti.com) :)


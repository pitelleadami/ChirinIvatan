# SPEC-03 Defense Architecture Pack

Purpose: ready-to-present architecture visuals for capstone defense.

How to use this file:

- GitHub/Markdown viewers that support Mermaid can render these diagrams directly.
- You can also copy each Mermaid block into mermaid.live for export to PNG/SVG.

---

## 1) System ERD (Core Domain + Governance + Recognition)

```mermaid
erDiagram
    USER ||--o| USER_PROFILE : has

    VARIANT_GROUP ||--o{ ENTRY : contains
    VARIANT_GROUP o|--|| ENTRY : mother_entry

    USER ||--o{ ENTRY : initial_contributor
    USER ||--o{ ENTRY : last_revised_by
    USER ||--o{ ENTRY : audio_contributor
    USER ||--o{ ENTRY : photo_contributor

    ENTRY ||--o{ ENTRY_REVISION : has
    USER ||--o{ ENTRY_REVISION : contributes

    ENTRY_REVISION ||--o{ REVIEW : reviewed_by_round
    USER ||--o{ REVIEW : reviewer

    FOLKLORE_ENTRY ||--o{ FOLKLORE_REVISION : has
    USER ||--o{ FOLKLORE_ENTRY : contributor
    USER ||--o{ FOLKLORE_REVISION : contributes
    FOLKLORE_REVISION ||--o{ FOLKLORE_REVIEW : reviewed_by_round
    USER ||--o{ FOLKLORE_REVIEW : reviewer

    USER ||--o{ CONTRIBUTION_EVENT : earns
    ENTRY o|--o{ CONTRIBUTION_EVENT : dictionary_entry
    FOLKLORE_ENTRY o|--o{ CONTRIBUTION_EVENT : folklore_entry
    ENTRY_REVISION o|--o{ CONTRIBUTION_EVENT : entry_revision
    FOLKLORE_REVISION o|--o{ CONTRIBUTION_EVENT : folklore_revision

    USER ||--o{ ROLE_APPLICATION : applicant
    ROLE_APPLICATION ||--o{ ROLE_APPLICATION_DECISION : has_decisions
    USER ||--o{ ROLE_APPLICATION_DECISION : decided_by
    USER ||--o{ ROLE_ONBOARDING_RECORD : onboarded_user
    USER o|--o{ ROLE_ONBOARDING_RECORD : invited_by
    ROLE_APPLICATION o|--o{ ROLE_ONBOARDING_RECORD : source_application

    USER ||--o| USER_CONTRIBUTION_STATS : cached_stats
    MUNICIPALITY_STATS {
      string municipality PK
    }

    USER o|--o{ RECOGNITION_EVENT : user_event

    GAMIFICATION_CONFIG {
      string name PK
    }

    GAMIFICATION_RUNTIME_STATE {
      string key PK
    }

    MUNICIPALITY_MONTHLY_WINNER {
      string month_key
      string metric
      string municipality
    }

    USER {
      uuid id PK
      string username
    }

    USER_PROFILE {
      int id PK
      string municipality
      string affiliation
      string occupation
      string bio
      string profile_photo
    }

    ENTRY {
      uuid id PK
      string term
      string status
      bool is_mother
      datetime archived_at
      datetime last_approved_at
    }

    VARIANT_GROUP {
      uuid id PK
      datetime created_at
    }

    ENTRY_REVISION {
      uuid id PK
      string status
      bool is_base_snapshot
      json proposed_data
      datetime approved_at
      datetime created_at
    }

    REVIEW {
      uuid id PK
      string decision
      int review_round
      text notes
      datetime created_at
    }

    FOLKLORE_ENTRY {
      uuid id PK
      string title
      string category
      string municipality_source
      string status
      string copyright_usage
      datetime archived_at
    }

    FOLKLORE_REVISION {
      uuid id PK
      string status
      bool is_base_snapshot
      json proposed_data
      datetime approved_at
      datetime created_at
    }

    FOLKLORE_REVIEW {
      uuid id PK
      string decision
      int review_round
      text notes
      datetime created_at
    }

    CONTRIBUTION_EVENT {
      uuid id PK
      string contribution_type
      datetime awarded_at
    }

    ROLE_APPLICATION {
      uuid id PK
      string target_role
      string status
      datetime created_at
      datetime decided_at
    }

    ROLE_APPLICATION_DECISION {
      uuid id PK
      string decision
      text notes
      datetime created_at
    }

    ROLE_ONBOARDING_RECORD {
      uuid id PK
      string role
      string method
      text accountability_notes
      datetime created_at
    }

    USER_CONTRIBUTION_STATS {
      int id PK
      int combined_total
      int dictionary_original_total
      int folklore_original_total
      int review_completed_total
      int contributor_level
      int reviewer_level
      json unlocked_badges
    }

    MUNICIPALITY_STATS {
      int dictionary_all_time
      int folklore_all_time
      int combined_all_time
      int dictionary_month
      int folklore_month
      int combined_month
      string last_month_calculated
    }

    RECOGNITION_EVENT {
      uuid id PK
      string event_type
      string municipality
      string reference_id
      json payload
      datetime created_at
    }
```

---

## 2) State Transition Diagrams

## 2.1 Dictionary Entry State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PENDING : contributor submits
    PENDING --> APPROVED : quorum (2 reviewer OR 1 reviewer+1 admin)
    PENDING --> REJECTED : single rejection + notes

    APPROVED --> APPROVED_UNDER_REVIEW : flag + notes
    APPROVED_UNDER_REVIEW --> APPROVED : re-review quorum approve
    APPROVED_UNDER_REVIEW --> ARCHIVED : re-review Reject/Archive

    REJECTED --> ARCHIVED : auto/manual archive rules
    APPROVED --> ARCHIVED : manual archive
    ARCHIVED --> APPROVED : restore
    ARCHIVED --> DELETED : auto-delete window reached
```

## 2.2 Dictionary Revision State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PENDING : submit revision
    PENDING --> APPROVED : quorum approve
    PENDING --> REJECTED : single rejection + notes
```

## 2.3 Folklore Entry State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PENDING : submit
    PENDING --> APPROVED : quorum approve
    PENDING --> REJECTED : single rejection + notes

    APPROVED --> APPROVED_UNDER_REVIEW : flag + notes
    APPROVED_UNDER_REVIEW --> APPROVED : re-review quorum approve
    APPROVED_UNDER_REVIEW --> ARCHIVED : re-review Reject/Archive

    REJECTED --> ARCHIVED : auto/manual archive rules
    APPROVED --> ARCHIVED : manual archive
    ARCHIVED --> APPROVED : restore
    ARCHIVED --> DELETED : auto-delete window reached
```

## 2.4 Folklore Revision State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PENDING : submit revision
    PENDING --> APPROVED : quorum approve
    PENDING --> REJECTED : single rejection + notes
```

---

## 3) Sequence Diagrams

## 3.1 Dictionary Submit + Initial Review + Publish

```mermaid
sequenceDiagram
    autonumber
    actor C as Contributor
    participant UI as Frontend UI
    participant API as Django API
    participant REV as EntryRevision
    participant R as Review Service
    participant E as Entry
    participant CE as ContributionEvent

    C->>UI: Create draft and submit
    UI->>API: POST dictionary revision submit
    API->>REV: set status=PENDING

    actor RV1 as Reviewer 1
    RV1->>UI: Approve with notes
    UI->>API: POST /api/reviews/dictionary/submit (approve)
    API->>R: submit_review(revision, approve)
    R-->>API: quorum not met yet (still pending)

    actor RV2 as Reviewer 2/Admin
    RV2->>UI: Approve with notes
    UI->>API: POST /api/reviews/dictionary/submit (approve)
    API->>R: submit_review(revision, approve)
    R->>REV: status=APPROVED, approved_at set
    R->>E: publish_revision (create/update live entry)
    R->>REV: finalize_approved_revision (base snapshot + retention)
    R->>CE: award dictionary_term OR revision credit
    R-->>API: success + updated statuses
    API-->>UI: revision_status + entry_status
```

## 3.2 Dictionary Post-Publish Re-Review (Flag -> Decision)

```mermaid
sequenceDiagram
    autonumber
    actor RV as Reviewer/Admin
    participant UI as Frontend UI
    participant API as Django API
    participant R as Review Service
    participant REV as EntryRevision
    participant E as Entry

    RV->>UI: Flag approved entry (with notes)
    UI->>API: POST /api/reviews/dictionary/submit (flag)
    API->>R: submit_review(approved revision, flag)
    R->>E: status=APPROVED_UNDER_REVIEW
    API-->>UI: entry_status=approved_under_review

    alt Re-review reject path
      RV->>UI: Reject in active re-review round
      UI->>API: POST submit (reject + notes)
      API->>R: submit_review(...)
      R->>E: status=REJECTED
      API-->>UI: entry_status=rejected
    else Re-review restore path
      RV1->>UI: Approve re-review
      RV2/Admin->>UI: Approve re-review
      UI->>API: POST submit (approve)
      API->>R: submit_review(...)
      R->>E: status=APPROVED
      API-->>UI: entry_status=approved
    end
```

## 3.3 Folklore Submit + Review + Publish

```mermaid
sequenceDiagram
    autonumber
    actor C as Contributor
    participant UI as Frontend UI
    participant API as Django API
    participant FR as FolkloreRevision
    participant R as Review Service
    participant FE as FolkloreEntry
    participant CE as ContributionEvent

    C->>UI: Create folklore draft (with optional media)
    UI->>API: POST /api/folklore/revisions/create
    API->>FR: create DRAFT revision

    C->>UI: Submit draft
    UI->>API: POST /api/folklore/revisions/{id}/submit
    API->>FR: status=PENDING

    actor RV1 as Reviewer 1
    actor RV2 as Reviewer 2/Admin

    RV1->>API: approve decision
    API->>R: submit_folklore_review(...)
    R-->>API: quorum not met yet

    RV2->>API: approve decision
    API->>R: submit_folklore_review(...)
    R->>FR: status=APPROVED
    R->>FE: publish_revision (create/update live entry)
    R->>FR: finalize_approved_revision (base snapshot + retention)
    R->>CE: award folklore_entry OR revision credit
    API-->>UI: revision_status + entry_status
```

---

## 4) Presentation Notes (for defense slides)

Use 4 slides:

1. ERD slide (Section 1)
2. State machines slide (Section 2)
3. Dictionary sequence slide (Section 3.1 + 3.2)
4. Folklore sequence slide (Section 3.3)

Key message to panel:

- "All changes are revision-first and governance-validated before publication."
- "Auditability and accountability are first-class, not afterthoughts."
- "Contribution and recognition are backend-authoritative and non-inflationary."

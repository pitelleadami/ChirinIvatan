# ADR-0007: Normalize Usernames, Names, Affiliations, And Sentences

Date: 2026-06-19  
Status: Accepted

## Context

Public profiles and entry attributions became inconsistent when users entered usernames, personal names, affiliations, and sample sentences in different capitalization styles.

## Decision

The system applies normalization rules:

- usernames are lowercase
- person names are title-cased where appropriate
- affiliations use capitalized words
- all-caps sentence fields are normalized
- sentence fields receive ending punctuation when missing

## Alternatives Considered

- Preserve user-entered casing exactly.
- Only normalize display text, not saved data.
- Require admins to manually clean all account and entry text.

## Rationale

Normalization keeps public pages readable and professional while reducing reviewer/admin cleanup.

## Consequences

- Existing accounts with capitalized usernames need compatibility handling and clear user guidance.
- Name normalization must be careful around post-nominals and cultural naming conventions.

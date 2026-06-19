# ADR-0002: Use Mother Terms And Variant Groups

Date: 2026-06-19  
Status: Accepted

## Context

Ivatan words can appear in multiple forms across municipality usage, spelling, pronunciation, historical usage, borrowed usage, and emerging usage. Treating every form as a fully separate entry risks duplicating meanings and making search results confusing.

## Decision

Dictionary entries that represent the same lexical item are connected through a variant group. One entry acts as the mother term. Related variants remain separate entries but are displayed as connected forms.

Latest approved public lists show mother terms by default. When a user opens a term, related variants and their details are shown on the term page.

## Alternatives Considered

- Make every variant a separate unrelated dictionary entry.
- Store variants only as plain text inside one entry.
- Hide variants from public pages and show only one canonical form.

## Rationale

The mother/variant model balances readability and linguistic completeness. Users see one main public term while still preserving real community variation.

## Consequences

- Reviewers must decide when a form is a variant versus a separate entry.
- Public pages need to show both the mother meaning and variant-specific details.
- Search and latest lists need rules for mother-only versus variant-inclusive display.

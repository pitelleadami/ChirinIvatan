# ADR-0003: Separate Variant-Specific Fields From Semantic Core

Date: 2026-06-19  
Status: Accepted

## Context

A dictionary variant may differ in spelling, pronunciation, example usage, or historical status, while still sharing the same meaning as the mother term.

## Decision

Dictionary entries separate:

- semantic core fields: meaning, part of speech, synonyms, antonyms, inflected forms, source text, and main photo
- variant-specific fields: term/headword, pronunciation text, phonetic notation, audio, variant type, examples, usage notes, etymology, and variant source context

Current variant type labels are:

- `Ivatan (Common Usage)`
- `Isamurungen`
- `Ivasayen`
- `Itbayaten`
- `Old / Historical Form`
- `Borrowed Form`
- `Newly Coined Term / Expression`

## Alternatives Considered

- Give each variant its own full meaning.
- Store all variation in free-text notes.
- Limit variant types to municipality labels only.

## Rationale

Separating semantic and variant-specific fields prevents duplicated or conflicting meanings while still preserving pronunciation, usage, and origin differences.

## Consequences

- Contributors need guidance on whether a detail belongs to the shared meaning or the variant.
- Review previews must show both shared and variant-specific content clearly.

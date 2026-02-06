# Chirin Ivatan — Data Model Design

This document defines the core data entities for the Chirin Ivatan
community-based information system. The data model is finalized
prior to implementation to ensure scope control, governance clarity,
and academic defensibility.

## Core Entities
- User (role-based)
- DictionaryEntry
- FolkloreEntry
- AudioPronunciation
- Review

## Ownership by App
- users: User roles, profiles, municipality, affiliation, and status
- dictionary: DictionaryEntry and AudioPronunciation
- folklore: FolkloreEntry
- reviews: Review workflow and audit records

## User
Users are authenticated through Django’s built-in user system and
extended conceptually with governance- and provenance-related fields.

Fields include role (contributor / reviewer / admin), municipality
(declared source of Ivatan language influence), affiliation,
occupation, optional bio, active status, and join timestamp.

These fields support contributor attribution, reviewer legitimacy,
and ethical transparency. Display names and team page names are
derived at the application layer and are not stored.

## DictionaryEntry
DictionaryEntry represents a validated Ivatan–English term pair.

Fields include Ivatan term, English meaning, optional example usage,
optional Ivatan variant tag (Isamurong, Ivasay, Itbayaten, Isabtang,
or General Ivatan), mandatory source declaration, self-knowledge flag,
contributor reference, status (draft, pending, approved, rejected,
archived), and timestamps.

Audio pronunciation is intentionally excluded and handled separately
to allow an independent review lifecycle.

## AudioPronunciation
AudioPronunciation represents an audio rendering of an Ivatan term.

Fields include dictionary entry reference, audio file reference,
contributor reference, status (draft, pending, approved, rejected,
archived), and timestamp.

Audio contributions follow a separate review cycle from dictionary
text. Audio contributor identity is stored for auditability but may
be hidden from public display.

## FolkloreEntry
FolkloreEntry represents narrative cultural knowledge such as myths,
legends, laji, poems, proverbs, and idioms.

Fields include title, required text content, category, optional Ivatan
variant tag, mandatory source declaration, self-knowledge flag,
optional media reference (audio or embedded video), contributor
reference, status (draft, pending, approved, rejected, archived),
and timestamps.

Text content is always required; media supplements but does not
replace textual knowledge.

## Review
Reviews record governance decisions applied to dictionary entries,
audio pronunciations, and folklore entries.

Fields include reviewer reference (reviewer or administrator),
content type (dictionary_entry, folklore_entry, audio_pronunciation), object identifier,
decision (approved, rejected, revision requested), reviewer comments,
and review timestamp.

Review records are append-only and serve as an immutable audit log.

## Scope Control
This data model intentionally excludes gamification, analytics,
likes and comments, real-time collaboration, version history,
and multilingual expansion beyond Ivatan–English. These features
are reserved for future work.

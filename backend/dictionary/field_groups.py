"""
Shared dictionary field group definitions.

Mother terms own semantic core fields. Variant entries own pronunciation,
audio, spelling/variant, and other variant-specific fields.
"""

SEMANTIC_CORE_FIELDS = (
    "meaning",
    "part_of_speech",
    "photo",
    "photo_source",
    "photo_source_is_contributor_owned",
    "english_synonym",
    "ivatan_synonym",
    "english_antonym",
    "ivatan_antonym",
    "source_text",
    "term_source_is_self_knowledge",
    "inflected_forms",
)

VARIANT_SPECIFIC_FIELDS = (
    "term",
    "pronunciation_text",
    "phonetic",
    "audio_pronunciation",
    "audio_source",
    "audio_source_is_self_recorded",
    "variant_type",
    "usage_notes",
    "etymology",
    "example_sentence",
    "example_translation",
)

ENTRY_SNAPSHOT_FIELDS = VARIANT_SPECIFIC_FIELDS + SEMANTIC_CORE_FIELDS

MEDIA_FIELDS = {"photo", "audio_pronunciation"}

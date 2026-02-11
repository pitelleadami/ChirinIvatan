from django.db import transaction
from django.utils import timezone
from dictionary.models import Entry, EntryRevision, EntryStatus
from dictionary.state_machine import validate_transition


ENTRY_SNAPSHOT_FIELDS = (
    "term",
    "meaning",
    "part_of_speech",
    "photo",
    "photo_source",
    "english_synonym",
    "ivatan_synonym",
    "english_antonym",
    "ivatan_antonym",
    "pronunciation_text",
    "audio_pronunciation",
    "audio_source",
    "variant_type",
    "usage_notes",
    "etymology",
    "example_sentence",
    "example_translation",
    "source_text",
    "inflected_forms",
)


def _snapshot_entry(entry: Entry) -> dict:
    """
    Build a JSON-serializable snapshot of editable entry content.
    """

    snapshot = {}
    for field in ENTRY_SNAPSHOT_FIELDS:
        value = getattr(entry, field)
        if field in {"photo", "audio_pronunciation"}:
            snapshot[field] = value.name if value else ""
        else:
            snapshot[field] = value
    return snapshot


def _enforce_approved_revision_retention(entry: Entry) -> None:
    """
    Apply approved-revision retention policy.

    Spec quote:
    "Maximum 20 approved revisions retained.
    Original approved revision excluded from deletion."
    """

    approved_non_base = EntryRevision.objects.filter(
        entry=entry,
        status=EntryRevision.Status.APPROVED,
        is_base_snapshot=False,
    ).order_by("approved_at", "created_at")

    overflow = approved_non_base.count() - 20
    if overflow <= 0:
        return

    delete_ids = list(approved_non_base.values_list("id", flat=True)[:overflow])
    EntryRevision.objects.filter(id__in=delete_ids).delete()


@transaction.atomic
def finalize_approved_revision(*, revision: EntryRevision) -> EntryRevision:
    """
    Finalize revision bookkeeping after approval/publish.

    Spec quote:
    "The first revision that results in an approved entry becomes
    the permanent base snapshot and is never deleted."
    """

    if revision.status != EntryRevision.Status.APPROVED:
        raise ValueError("Only approved revisions can be finalized.")
    if not revision.entry_id:
        raise ValueError("Approved revision must be attached to an entry.")

    existing_base = EntryRevision.objects.filter(
        entry_id=revision.entry_id,
        status=EntryRevision.Status.APPROVED,
        is_base_snapshot=True,
    ).exists()

    if not existing_base:
        revision.is_base_snapshot = True
        revision.save(update_fields=["is_base_snapshot"])

    _enforce_approved_revision_retention(revision.entry)
    return revision


@transaction.atomic
def publish_revision(*, revision, approvers):
    """
    Publish an approved revision into Entry.

    Handles:
    - New entry creation
    - Existing entry updates
    - Metadata updates
    """

    data = revision.proposed_data or {}
    term = data.get("term")

    if not term:
        raise ValueError("Revision publish requires a non-empty term.")

    # -------------------------------------------------------
    # CASE 1: New Entry
    # -------------------------------------------------------

    if revision.entry is None:
        create_kwargs = {
            "term": term,
            "status": EntryStatus.APPROVED,
            "initial_contributor": revision.contributor,
            "last_revised_by": revision.contributor,
            "last_approved_at": timezone.now(),
        }

        for field in ENTRY_SNAPSHOT_FIELDS:
            if field == "term":
                continue
            if field in data:
                create_kwargs[field] = data[field]

        entry = Entry.objects.create(**create_kwargs)

        revision.entry = entry
        revision.save(update_fields=["entry"])

    # -------------------------------------------------------
    # CASE 2: Update Existing Entry
    # -------------------------------------------------------

    else:
        entry = revision.entry
        validate_transition(
            entry.status,
            EntryStatus.APPROVED,
            allow_same=True,
            entity_name="DictionaryEntry",
        )

        entry.term = term
        entry.last_revised_by = revision.contributor
        entry.status = EntryStatus.APPROVED
        entry.last_approved_at = timezone.now()

        update_fields = ["term", "last_revised_by", "status", "last_approved_at"]
        for field in ENTRY_SNAPSHOT_FIELDS:
            if field == "term":
                continue
            if field in data:
                setattr(entry, field, data[field])
                update_fields.append(field)

        entry.save(update_fields=update_fields)

    # -------------------------------------------------------
    # Update approval metadata
    # -------------------------------------------------------

    entry.last_approved_by.set(approvers)

    return entry



@transaction.atomic
def create_revision_from_entry(*, entry: Entry, contributor) -> EntryRevision:
    """
    Create a DRAFT EntryRevision pre-populated from the current approved Entry.

    This is the ONLY correct way to start a revision of an approved entry.
    """

    if entry is None:
        raise ValueError("Cannot create a revision without an approved Entry.")

    revision = EntryRevision.objects.create(
        entry=entry,
        proposed_data=_snapshot_entry(entry),
        contributor=contributor,
        status=EntryRevision.Status.DRAFT,
    )

    return revision

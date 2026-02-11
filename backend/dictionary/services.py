from django.db import transaction
from django.utils import timezone
from dictionary.models import Entry, EntryRevision, EntryStatus


@transaction.atomic
def publish_revision(*, revision, approvers):
    """
    Publish an approved revision into Entry.

    Handles:
    - New entry creation
    - Existing entry updates
    - Metadata updates
    """

    data = revision.proposed_data

    # -------------------------------------------------------
    # CASE 1: New Entry
    # -------------------------------------------------------

    if revision.entry is None:

        entry = Entry.objects.create(
            term=data.get("term"),
            status=EntryStatus.APPROVED,
            initial_contributor=revision.contributor,
            last_revised_by=revision.contributor,
            created_at=timezone.now(),
        )

        revision.entry = entry
        revision.save(update_fields=["entry"])

    # -------------------------------------------------------
    # CASE 2: Update Existing Entry
    # -------------------------------------------------------

    else:
        entry = revision.entry

        entry.term = data.get("term")
        entry.last_revised_by = revision.contributor
        entry.status = EntryStatus.APPROVED
        entry.save(update_fields=["term", "last_revised_by", "status"])

    # -------------------------------------------------------
    # Update approval metadata
    # -------------------------------------------------------

    entry.last_approved_by.clear()

    for user in approvers:
        entry.last_approved_by.add(user)

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
        term=entry.term,
        meaning=entry.meaning,
        part_of_speech=entry.part_of_speech,
        contributor=contributor,
        status=EntryRevision.Status.DRAFT,
    )

    return revision
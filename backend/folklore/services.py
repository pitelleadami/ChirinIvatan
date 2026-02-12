from django.db import transaction
from django.utils import timezone

from folklore.models import FolkloreEntry, FolkloreRevision
from folklore.state_machine import validate_transition
from users.contributions import award_folklore_entry

FOLKLORE_SNAPSHOT_FIELDS = (
    "title",
    "content",
    "category",
    "municipality_source",
    "source",
    "self_knowledge",
    "media_url",
    "media_source",
    "self_produced_media",
    "copyright_usage",
)


def _snapshot_entry(entry: FolkloreEntry) -> dict:
    return {field: getattr(entry, field) for field in FOLKLORE_SNAPSHOT_FIELDS}


@transaction.atomic
def transition_folklore_status(*, entry: FolkloreEntry, to_status: str) -> FolkloreEntry:
    """
    Central folklore state transition gate.

    Rule reminder:
    "No state change is allowed outside this table."
    """

    validate_transition(
        entry.status,
        to_status,
        entity_name="FolkloreEntry",
    )
    entry.status = to_status
    update_fields = ["status"]

    # Keep archival timestamp for "archive + 1 year delete" lifecycle.
    if to_status == FolkloreEntry.Status.ARCHIVED:
        entry.archived_at = timezone.now()
        update_fields.append("archived_at")
    elif to_status == FolkloreEntry.Status.APPROVED and entry.archived_at:
        entry.archived_at = None
        update_fields.append("archived_at")

    entry.save(update_fields=update_fields)

    # Historical leaderboard rule:
    # approved folklore contribution remains counted permanently.
    if to_status == FolkloreEntry.Status.APPROVED:
        award_folklore_entry(
            user=entry.contributor,
            entry=entry,
        )

    return entry


def _enforce_approved_revision_retention(entry: FolkloreEntry) -> None:
    approved_non_base = FolkloreRevision.objects.filter(
        entry=entry,
        status=FolkloreRevision.Status.APPROVED,
        is_base_snapshot=False,
    ).order_by("approved_at", "created_at")

    overflow = approved_non_base.count() - 20
    if overflow <= 0:
        return

    delete_ids = list(approved_non_base.values_list("id", flat=True)[:overflow])
    FolkloreRevision.objects.filter(id__in=delete_ids).delete()


@transaction.atomic
def finalize_approved_revision(*, revision: FolkloreRevision) -> FolkloreRevision:
    if revision.status != FolkloreRevision.Status.APPROVED:
        raise ValueError("Only approved revisions can be finalized.")
    if not revision.entry_id:
        raise ValueError("Approved folklore revision must be attached to an entry.")

    existing_base = FolkloreRevision.objects.filter(
        entry_id=revision.entry_id,
        status=FolkloreRevision.Status.APPROVED,
        is_base_snapshot=True,
    ).exists()
    if not existing_base:
        revision.is_base_snapshot = True
        revision.save(update_fields=["is_base_snapshot"])

    _enforce_approved_revision_retention(revision.entry)
    return revision


@transaction.atomic
def publish_revision(*, revision: FolkloreRevision) -> FolkloreEntry:
    data = revision.proposed_data or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    category = (data.get("category") or "").strip()
    source = (data.get("source") or "").strip()

    if not title or not content or not category or not source:
        raise ValueError("Folklore revision must include title/content/category/source.")

    if revision.entry is None:
        create_kwargs = {
            "contributor": revision.contributor,
            "status": FolkloreEntry.Status.APPROVED,
        }
        for field in FOLKLORE_SNAPSHOT_FIELDS:
            if field in data:
                create_kwargs[field] = data[field]
        entry = FolkloreEntry.objects.create(**create_kwargs)
        revision.entry = entry
        revision.save(update_fields=["entry"])
    else:
        entry = revision.entry
        for field in FOLKLORE_SNAPSHOT_FIELDS:
            if field in data:
                setattr(entry, field, data[field])
        entry.status = FolkloreEntry.Status.APPROVED
        entry.archived_at = None
        entry.save()

    return entry


@transaction.atomic
def create_revision_from_entry(*, entry: FolkloreEntry, contributor) -> FolkloreRevision:
    if entry is None:
        raise ValueError("Cannot create folklore revision without an existing entry.")

    return FolkloreRevision.objects.create(
        entry=entry,
        contributor=contributor,
        proposed_data=_snapshot_entry(entry),
        status=FolkloreRevision.Status.DRAFT,
    )

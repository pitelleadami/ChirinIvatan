"""
folklore/services.py

Write-side folklore business logic.

Main responsibilities:
- validate/publish approved revisions into live entries
- enforce revision retention policies
- apply lifecycle-safe state transitions
"""

from django.db import transaction
from django.utils import timezone

from folklore.models import FolkloreEntry, FolkloreRevision, normalize_folklore_taxonomy
from folklore.state_machine import validate_transition
from users.contributions import award_folklore_entry

FOLKLORE_SNAPSHOT_FIELDS = (
    "title",
    "content",
    "category",
    "subcategory",
    "municipality_source",
    "source",
    "self_knowledge",
    "media_url",
    "media_source",
    "self_produced_media",
    "copyright_usage",
    "photo_upload",
    "audio_upload",
)


def _snapshot_entry(entry: FolkloreEntry) -> dict:
    # Build JSON snapshot from current live entry for draft revision bootstrap.
    snapshot = {}
    for field in FOLKLORE_SNAPSHOT_FIELDS:
        value = getattr(entry, field)
        if field in {"photo_upload", "audio_upload"}:
            snapshot[field] = value.name if value else ""
        else:
            snapshot[field] = value
    return snapshot


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
    # Keep max 20 approved non-base revisions.
    # Oldest non-base approved revisions are deleted first.
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
    # First approved revision becomes immutable base snapshot.
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
    """
    Apply approved revision payload to live folklore entry.

    Handles:
    - first publish (creates FolkloreEntry)
    - update publish (modifies existing FolkloreEntry)
    """
    data = normalize_folklore_taxonomy(dict(revision.proposed_data or {}))
    if data != (revision.proposed_data or {}):
        revision.proposed_data = data
        revision.save(update_fields=["proposed_data"])
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    category = (data.get("category") or "").strip()
    subcategory = (data.get("subcategory") or "").strip()
    source = (data.get("source") or "").strip()
    self_knowledge = bool(data.get("self_knowledge", False))
    media_url = (data.get("media_url") or "").strip()
    media_source = (data.get("media_source") or "").strip()
    self_produced_media = bool(data.get("self_produced_media", False))

    if not title or not content or not category:
        raise ValueError("Folklore revision must include title/content/category.")
    if not subcategory:
        raise ValueError("Folklore revision must include subcategory.")
    if not self_knowledge and not source:
        raise ValueError("Source is required unless marked as self-knowledge.")
    has_media = bool(media_url or revision.photo_upload or revision.audio_upload)
    if has_media and not self_produced_media and not media_source:
        raise ValueError("Media source is required unless marked as self-produced.")

    if revision.entry is None:
        create_kwargs = {
            "contributor": revision.contributor,
            "status": FolkloreEntry.Status.APPROVED,
        }
        for field in FOLKLORE_SNAPSHOT_FIELDS:
            if field in data:
                create_kwargs[field] = data[field]
        if revision.photo_upload:
            create_kwargs["photo_upload"] = revision.photo_upload
        if revision.audio_upload:
            create_kwargs["audio_upload"] = revision.audio_upload
        entry = FolkloreEntry.objects.create(**create_kwargs)
        revision.entry = entry
        revision.save(update_fields=["entry"])
    else:
        entry = revision.entry
        is_assigned_correction = hasattr(revision, "correction_assignment")
        if not (is_assigned_correction and entry.status == FolkloreEntry.Status.REJECTED):
            validate_transition(
                entry.status,
                FolkloreEntry.Status.APPROVED,
                allow_same=True,
                entity_name="FolkloreEntry",
            )
        for field in FOLKLORE_SNAPSHOT_FIELDS:
            if field in data:
                setattr(entry, field, data[field])
        if revision.photo_upload:
            entry.photo_upload = revision.photo_upload
        if revision.audio_upload:
            entry.audio_upload = revision.audio_upload
        entry.status = FolkloreEntry.Status.APPROVED
        entry.archived_at = None
        entry.save()

    return entry


@transaction.atomic
def create_revision_from_entry(*, entry: FolkloreEntry, contributor) -> FolkloreRevision:
    # Preferred path for starting edits on approved folklore entries.
    # Caller is responsible for enforcing that contributor owns the entry.
    if entry is None:
        raise ValueError("Cannot create folklore revision without an existing entry.")

    return FolkloreRevision.objects.create(
        entry=entry,
        contributor=contributor,
        proposed_data=_snapshot_entry(entry),
        photo_upload=entry.photo_upload,
        audio_upload=entry.audio_upload,
        revision_type=FolkloreRevision.RevisionType.REVISION,
        status=FolkloreRevision.Status.DRAFT,
    )


@transaction.atomic
def create_variant_from_entry(*, entry: FolkloreEntry, contributor) -> FolkloreRevision:
    """
    Create a variant revision seeded from an existing entry.

    Variants are submitted by contributors who do not own the original entry.
    On approval, publish_revision creates a new FolkloreEntry rather than
    overwriting the original (because entry=None on the revision).
    variant_of tracks the lineage back to the source entry.
    """
    if entry is None:
        raise ValueError("Cannot create folklore variant without an existing entry.")

    return FolkloreRevision.objects.create(
        entry=None,
        variant_of=entry,
        contributor=contributor,
        proposed_data={},
        revision_type=FolkloreRevision.RevisionType.VARIANT,
        status=FolkloreRevision.Status.DRAFT,
    )

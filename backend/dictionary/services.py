from django.db import transaction
from django.utils import timezone
from dictionary.field_groups import (
    ENTRY_SNAPSHOT_FIELDS,
    MEDIA_FIELDS,
    SEMANTIC_CORE_FIELDS,
    VARIANT_SPECIFIC_FIELDS,
)
from dictionary.models import Entry, EntryRevision, EntryStatus
from dictionary.state_machine import validate_transition
from dictionary.variant_services import ensure_group_and_mother, maybe_promote_general_ivatan


# Dictionary publishing service:
# - Takes approved revisions and applies them to live entries.
# - Preserves base snapshot and revision retention rules.
# - Keeps mother/variant group state in sync after publish.
REVISION_HISTORY_LIMITS = {
    "public": 5,
    "staff": 15,  # reviewers/admins
}


def _semantic_source_entry(entry: Entry) -> Entry:
    """
    Return the entry that owns shared semantic fields.
    """

    if entry.is_mother:
        return entry

    group = entry.variant_group
    if not group or not group.mother_entry:
        return entry

    return group.mother_entry


def _field_snapshot_value(entry: Entry, field: str):
    value = getattr(entry, field)
    if field in MEDIA_FIELDS:
        return value.name if value else ""
    return value


def _snapshot_entry(entry: Entry) -> dict:
    """
    Build a JSON-serializable snapshot of editable entry content.

    Variant revisions use the clicked variant for variant-specific fields,
    but inherit semantic core fields from the mother term. That matches the
    public dictionary display and prevents variants from silently carrying
    their own separate meaning/part-of-speech data.
    """

    semantic_entry = _semantic_source_entry(entry)
    snapshot = {}
    for field in ENTRY_SNAPSHOT_FIELDS:
        source = semantic_entry if field in SEMANTIC_CORE_FIELDS else entry
        snapshot[field] = _field_snapshot_value(source, field)
    return snapshot


def _assign_if_changed(*, target: Entry, field: str, value, update_fields: set):
    """
    Assign a field only when the stored value actually changes.
    """

    if _field_snapshot_value(target, field) == value:
        return
    setattr(target, field, value)
    update_fields.add(field)


def _build_variant_create_kwargs(*, variant_data: dict, semantic_entry: Entry, revision):
    """
    Build a live Entry payload for an additional variant submitted with a draft.
    """

    create_kwargs = {
        "term": str(variant_data.get("term") or "").strip(),
        "status": EntryStatus.APPROVED,
        "variant_group": semantic_entry.variant_group,
        "is_mother": False,
        "initial_contributor": revision.contributor,
        "last_revised_by": revision.contributor,
        "last_approved_at": timezone.now(),
        "photo_contributor": semantic_entry.photo_contributor,
    }

    for field in SEMANTIC_CORE_FIELDS:
        create_kwargs[field] = _field_snapshot_value(semantic_entry, field)

    for field in VARIANT_SPECIFIC_FIELDS:
        if field == "term":
            continue
        if field in variant_data:
            create_kwargs[field] = variant_data[field]

    if variant_data.get("audio_pronunciation"):
        create_kwargs["audio_contributor"] = revision.contributor

    return create_kwargs


def _create_additional_variants(*, entry: Entry, revision, approvers) -> list[Entry]:
    """
    Publish extra variant rows carried in revision.proposed_data["variants"].
    """

    variants = revision.proposed_data.get("variants") or []
    if not variants:
        return []

    ensure_group_and_mother(entry=entry)
    entry.refresh_from_db()
    semantic_entry = _semantic_source_entry(entry)
    if not semantic_entry.variant_group_id:
        ensure_group_and_mother(entry=semantic_entry)
        semantic_entry.refresh_from_db()

    created = []
    group = semantic_entry.variant_group
    for variant_data in variants:
        if not isinstance(variant_data, dict):
            continue
        term = str(variant_data.get("term") or "").strip()
        if not term:
            continue

        variant_type = str(variant_data.get("variant_type") or "").strip()
        duplicate = group.entries.filter(
            term__iexact=term,
            variant_type__iexact=variant_type,
            status__in=[EntryStatus.APPROVED, EntryStatus.APPROVED_UNDER_REVIEW],
        ).first()
        if duplicate:
            continue

        variant_entry = Entry.objects.create(
            **_build_variant_create_kwargs(
                variant_data=variant_data,
                semantic_entry=semantic_entry,
                revision=revision,
            )
        )
        variant_entry.last_approved_by.set(approvers)
        maybe_promote_general_ivatan(entry=variant_entry)

        EntryRevision.objects.create(
            entry=variant_entry,
            contributor=revision.contributor,
            proposed_data=_snapshot_entry(variant_entry),
            status=EntryRevision.Status.APPROVED,
            approved_at=revision.approved_at or timezone.now(),
            is_base_snapshot=True,
        )
        created.append(variant_entry)

    return created


def get_visible_revision_history(*, entry: Entry, audience: str = "public") -> dict:
    """
    Return role-scoped approved revision history.

    Spec quote:
    Public sees "Original approved version + last 5 approved revisions".
    Reviewer/Admin sees "Original approved version + last 15 approved revisions".
    """

    if audience not in REVISION_HISTORY_LIMITS:
        raise ValueError(f"Unknown audience '{audience}'.")

    base_snapshot = (
        EntryRevision.objects.filter(
            entry=entry,
            status=EntryRevision.Status.APPROVED,
            is_base_snapshot=True,
        )
        .order_by("approved_at", "created_at")
        .first()
    )

    recent_approved = list(
        EntryRevision.objects.filter(
            entry=entry,
            status=EntryRevision.Status.APPROVED,
            is_base_snapshot=False,
        )
        .order_by("-approved_at", "-created_at")[: REVISION_HISTORY_LIMITS[audience]]
    )

    recent_rejected = list(
        EntryRevision.objects.filter(
            entry=entry,
            status=EntryRevision.Status.REJECTED,
            is_base_snapshot=False,
        )
        .order_by("-created_at")[: REVISION_HISTORY_LIMITS[audience]]
    )

    return {
        "base_snapshot": base_snapshot,
        "recent_approved_revisions": recent_approved,
        "recent_rejected_revisions": recent_rejected,
    }


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

    # `proposed_data` is the canonical payload from reviewable revision JSON.
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
            # First approved term starts as the authoritative mother term
            # until grouped/promotion logic says otherwise.
            "is_mother": True,
        }

        for field in ENTRY_SNAPSHOT_FIELDS:
            if field == "term":
                continue
            if field in data:
                create_kwargs[field] = data[field]

        # Active media contributor attribution:
        # when media is present in this approved submission, the revision
        # contributor becomes the visible media contributor.
        if data.get("audio_pronunciation"):
            create_kwargs["audio_contributor"] = revision.contributor
        if data.get("photo"):
            create_kwargs["photo_contributor"] = revision.contributor

        entry = Entry.objects.create(**create_kwargs)

        revision.entry = entry
        revision.save(update_fields=["entry"])

    # -------------------------------------------------------
    # CASE 2: Update Existing Entry
    # -------------------------------------------------------

    else:
        entry = revision.entry
        semantic_entry = _semantic_source_entry(entry)
        old_audio = entry.audio_pronunciation.name if entry.audio_pronunciation else ""
        old_photo = semantic_entry.photo.name if semantic_entry.photo else ""
        validate_transition(
            entry.status,
            EntryStatus.APPROVED,
            allow_same=True,
            entity_name="DictionaryEntry",
        )

        now = timezone.now()
        entry_update_fields = set()
        semantic_update_fields = set()

        _assign_if_changed(
            target=entry,
            field="term",
            value=term,
            update_fields=entry_update_fields,
        )
        entry.last_revised_by = revision.contributor
        entry.status = EntryStatus.APPROVED
        entry.last_approved_at = now
        entry_update_fields.update({"last_revised_by", "status", "last_approved_at"})

        for field in VARIANT_SPECIFIC_FIELDS:
            if field == "term":
                continue
            if field in data:
                _assign_if_changed(
                    target=entry,
                    field=field,
                    value=data[field],
                    update_fields=entry_update_fields,
                )

        for field in SEMANTIC_CORE_FIELDS:
            if field in data:
                _assign_if_changed(
                    target=semantic_entry,
                    field=field,
                    value=data[field],
                    update_fields=semantic_update_fields,
                )

        if semantic_update_fields:
            semantic_entry.last_revised_by = revision.contributor
            semantic_entry.last_approved_at = now
            semantic_update_fields.update({"last_revised_by", "last_approved_at"})

        # If active media changed in this approved revision, update
        # the media contributor attribution to the revising user.
        if "audio_pronunciation" in data:
            new_audio = entry.audio_pronunciation.name if entry.audio_pronunciation else ""
            if new_audio != old_audio:
                entry.audio_contributor = revision.contributor
                entry_update_fields.add("audio_contributor")
        if "photo" in data:
            new_photo = semantic_entry.photo.name if semantic_entry.photo else ""
            if new_photo != old_photo:
                semantic_entry.photo_contributor = revision.contributor
                semantic_update_fields.add("photo_contributor")

        if semantic_entry.id == entry.id:
            entry_update_fields.update(semantic_update_fields)
            if entry_update_fields:
                entry.save(update_fields=sorted(entry_update_fields))
        else:
            if semantic_update_fields:
                semantic_entry.save(update_fields=sorted(semantic_update_fields))
            if entry_update_fields:
                entry.save(update_fields=sorted(entry_update_fields))

    # -------------------------------------------------------
    # Update approval metadata
    # -------------------------------------------------------

    # Approval metadata and group/mother logic are updated after data write.
    entry.last_approved_by.set(approvers)
    ensure_group_and_mother(entry=entry)
    maybe_promote_general_ivatan(entry=entry)
    _create_additional_variants(entry=entry, revision=revision, approvers=approvers)

    return entry



@transaction.atomic
def create_revision_from_entry(*, entry: Entry, contributor) -> EntryRevision:
    """
    Create a DRAFT EntryRevision pre-populated from the current approved Entry.

    This is the ONLY correct way to start a revision of an approved entry.
    """

    if entry is None:
        raise ValueError("Cannot create a revision without an approved Entry.")

    # Troubleshooting tip:
    # If users complain that revisions start "blank", ensure this function is used.
    revision = EntryRevision.objects.create(
        entry=entry,
        proposed_data=_snapshot_entry(entry),
        contributor=contributor,
        status=EntryRevision.Status.DRAFT,
    )

    return revision

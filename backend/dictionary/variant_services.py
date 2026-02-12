from django.db import transaction
from django.db.models import Min, Q

from dictionary.models import Entry, EntryRevision, EntryStatus, VariantGroup


GENERAL_VARIANT_ALIASES = {"general", "general ivatan"}


def _normalize_variant_type(value: str) -> str:
    return (value or "").strip().lower()


def is_general_ivatan_entry(entry: Entry) -> bool:
    return _normalize_variant_type(entry.variant_type) in GENERAL_VARIANT_ALIASES


def _published_statuses():
    return [EntryStatus.APPROVED, EntryStatus.APPROVED_UNDER_REVIEW]


def _set_group_mother_flags(*, group: VariantGroup, mother_entry: Entry | None):
    """
    Keep `Entry.is_mother` in sync with `VariantGroup.mother_entry`.
    """

    group.entries.update(is_mother=False)
    if mother_entry:
        group.entries.filter(id=mother_entry.id).update(is_mother=True)


@transaction.atomic
def create_variant_group(*, entry: Entry) -> VariantGroup:
    """
    Create a new VariantGroup with the given entry as its first member.
    The first approved entry becomes the mother term by default.
    """

    group = VariantGroup.objects.create(mother_entry=entry)

    entry.variant_group = group
    entry.is_mother = True
    entry.save(update_fields=["variant_group", "is_mother"])

    return group


@transaction.atomic
def attach_entry_to_group(*, entry: Entry, group: VariantGroup):
    """
    Attach an approved entry to an existing VariantGroup.
    """

    entry.variant_group = group
    entry.save(update_fields=["variant_group"])

    # If a group currently has no mother, the next approved variant
    # becomes mother automatically once attached/published.
    if not group.mother_entry_id and entry.status in _published_statuses():
        promote_to_mother(entry=entry)


@transaction.atomic
def promote_to_mother(*, entry: Entry):
    """
    Promote an entry to be the mother term of its VariantGroup.
    Used when a General Ivatan term is approved.
    """

    if not entry.variant_group:
        raise ValueError("Entry is not part of a VariantGroup.")

    group = entry.variant_group
    group.mother_entry = entry
    group.save(update_fields=["mother_entry"])
    _set_group_mother_flags(group=group, mother_entry=entry)

    return entry


@transaction.atomic
def ensure_group_and_mother(*, entry: Entry):
    """
    Guarantee a published entry belongs to a group and that a mother exists.
    """

    if not entry.variant_group_id:
        create_variant_group(entry=entry)
        return entry

    if not entry.variant_group.mother_entry_id:
        recompute_mother_for_group(group=entry.variant_group)
    return entry


@transaction.atomic
def maybe_promote_general_ivatan(*, entry: Entry):
    """
    SPEC rule:
    approving a General Ivatan term in a group promotes it to mother.
    """

    if not entry.variant_group_id:
        return entry
    if is_general_ivatan_entry(entry):
        promote_to_mother(entry=entry)
    return entry


@transaction.atomic
def recompute_mother_for_group(*, group: VariantGroup, exclude_entry_id=None):
    """
    Deterministic fallback:
    new mother = earliest approved, non-archived variant by submission timestamp.
    """

    candidates = list(
        group.entries.filter(status__in=_published_statuses())
        .exclude(id=exclude_entry_id)
        .annotate(
            first_approved_at=Min(
                "revisions__approved_at",
                filter=Q(revisions__status=EntryRevision.Status.APPROVED),
            )
        )
    )

    if not candidates:
        group.mother_entry = None
        group.save(update_fields=["mother_entry"])
        _set_group_mother_flags(group=group, mother_entry=None)
        return None

    candidates.sort(
        key=lambda item: (
            item.first_approved_at or item.created_at,
            item.created_at,
            str(item.id),
        )
    )
    chosen = candidates[0]
    promote_to_mother(entry=chosen)
    return chosen


@transaction.atomic
def handle_mother_removed_or_archived(*, entry: Entry, removed=False):
    """
    Recompute mother when current mother is archived or physically deleted.
    """

    if not entry.variant_group_id:
        return None

    group = entry.variant_group
    if group.mother_entry_id != entry.id and not entry.is_mother:
        return group.mother_entry

    exclude_entry_id = entry.id if removed else None
    return recompute_mother_for_group(group=group, exclude_entry_id=exclude_entry_id)

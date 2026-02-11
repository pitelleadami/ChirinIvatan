from django.db import transaction
from dictionary.models import Entry, VariantGroup


@transaction.atomic
def create_variant_group(*, entry: Entry) -> VariantGroup:
    """
    Create a new VariantGroup with the given entry as its first member.
    The first approved entry becomes the mother term by default.
    """

    group = VariantGroup.objects.create(
        mother_entry=entry
    )

    entry.variant_group = group
    entry.save(update_fields=["variant_group"])

    return group


@transaction.atomic
def attach_entry_to_group(*, entry: Entry, group: VariantGroup):
    """
    Attach an approved entry to an existing VariantGroup.
    """

    entry.variant_group = group
    entry.save(update_fields=["variant_group"])


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

    return entry

from django.db import transaction

from folklore.models import FolkloreEntry
from folklore.state_machine import validate_transition


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
    entry.save(update_fields=["status"])
    return entry

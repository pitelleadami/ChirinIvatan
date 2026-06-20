"""
dictionary/state_machine.py

Single source of truth for allowed dictionary entry status transitions.

If you need to change lifecycle behavior:
1) update transition map
2) update tests
3) verify review/archive/delete workflows still pass
"""

from django.core.exceptions import ValidationError

# "No state change is allowed outside this table."
VALID_TRANSITIONS = {
    "draft": {"pending"},
    "pending": {"approved", "rejected"},
    "approved": {"approved_under_review", "archived"},
    "approved_under_review": {"approved", "rejected", "archived"},
    "rejected": {"archived"},
    "archived": {"approved", "deleted"},
    "deleted": set(),
}


def can_transition(from_status: str, to_status: str, *, allow_same=False) -> bool:
    if from_status == to_status:
        return allow_same
    return to_status in VALID_TRANSITIONS.get(from_status, set())


def validate_transition(
    from_status: str,
    to_status: str,
    *,
    allow_same=False,
    entity_name="Entry",
) -> None:
    if can_transition(from_status, to_status, allow_same=allow_same):
        return
    raise ValidationError(f"Invalid {entity_name} state transition: {from_status} -> {to_status}.")

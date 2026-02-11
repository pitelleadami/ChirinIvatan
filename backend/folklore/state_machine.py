from django.core.exceptions import ValidationError


# "No state change is allowed outside this table."
VALID_TRANSITIONS = {
    "draft": {"pending"},
    "pending": {"approved", "rejected"},
    "approved": {"approved_under_review", "archived"},
    "approved_under_review": {"approved", "rejected"},
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
    entity_name="FolkloreEntry",
) -> None:
    if can_transition(from_status, to_status, allow_same=allow_same):
        return
    raise ValidationError(
        f"Invalid {entity_name} state transition: {from_status} -> {to_status}."
    )

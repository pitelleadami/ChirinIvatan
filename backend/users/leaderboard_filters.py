from django.db import models

LEADERBOARD_PARTICIPANT_GROUPS = ("Contributor", "Reviewer", "Consultant")
LEADERBOARD_ADMIN_GROUP = "Admin"


def leaderboard_participant_q(prefix=""):
    """
    Users shown on leaderboards must be active, have an opted-in profile, and
    have a role that can legitimately contribute or review. Admins can hide
    test/demo accounts later by turning off include_in_leaderboard.
    """
    path = f"{prefix}__" if prefix else ""
    return (
        models.Q(**{f"{path}is_active": True})
        & ~models.Q(**{f"{path}password": ""})
        & ~models.Q(**{f"{path}password__startswith": "!"})
        & models.Q(**{f"{path}profile__isnull": False})
        & models.Q(**{f"{path}profile__include_in_leaderboard": True})
        & (
            models.Q(**{f"{path}is_superuser": True})
            | models.Q(**{f"{path}groups__name": LEADERBOARD_ADMIN_GROUP})
            | models.Q(**{f"{path}groups__name__in": LEADERBOARD_PARTICIPANT_GROUPS})
        )
    )

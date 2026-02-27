from django.contrib.auth import get_user_model
from django.db import models

from users.models import ContributionEvent


"""
users/contributions.py

Purpose:
- Central helper functions for awarding contribution credit.
- Keeps credit rules in one place so services/views stay consistent.

Important rule:
- Do not manually create ContributionEvent rows in random files.
- Use these helpers so uniqueness and linking remain consistent.
"""


User = get_user_model()


def award_dictionary_term(*, user, entry, revision=None):
    """
    Historical rule:
    Approved original dictionary contributions are recorded once and
    never decremented later.

    Return shape:
    - (event, created)
    created=False means credit already existed (no double-count).
    """

    return ContributionEvent.objects.get_or_create(
        user=user,
        dictionary_entry=entry,
        contribution_type=ContributionEvent.Type.DICTIONARY_TERM,
        defaults={"entry_revision": revision},
    )


def award_folklore_entry(*, user, entry):
    """
    Award first-time folklore contribution credit.

    Troubleshooting:
    - If contributor says score did not increase, check `created` flag.
    - If created=False, user already had credit for this entry.
    """
    return ContributionEvent.objects.get_or_create(
        user=user,
        folklore_entry=entry,
        contribution_type=ContributionEvent.Type.FOLKLORE_ENTRY,
    )


def award_revision(*, user, entry=None, folklore_entry=None, revision=None, folklore_revision=None):
    """
    Locked rule:
    "Revisions are counted once per entry per contributor lifetime."

    Safe usage:
    - pass exactly one target: dictionary entry OR folklore entry
    - pass related revision when available for audit traceability
    """

    if entry and folklore_entry:
        raise ValueError("Provide either dictionary entry or folklore entry, not both.")
    if not entry and not folklore_entry:
        raise ValueError("A revision award requires a dictionary or folklore entry.")

    if entry:
        return ContributionEvent.objects.get_or_create(
            user=user,
            dictionary_entry=entry,
            contribution_type=ContributionEvent.Type.REVISION,
            defaults={"entry_revision": revision},
        )

    return ContributionEvent.objects.get_or_create(
        user=user,
        folklore_entry=folklore_entry,
        contribution_type=ContributionEvent.Type.REVISION,
        defaults={"folklore_revision": folklore_revision},
    )


def contribution_summary_for_user(*, user):
    """
    Lightweight aggregation helper.

    Used for:
    - profile summary cards
    - quick leaderboard-style totals
    """
    qs = ContributionEvent.objects.filter(user=user)
    counts = qs.values("contribution_type").annotate(c=models.Count("id"))
    by_type = {item["contribution_type"]: item["c"] for item in counts}
    dictionary_terms = by_type.get(ContributionEvent.Type.DICTIONARY_TERM, 0)
    folklore_entries = by_type.get(ContributionEvent.Type.FOLKLORE_ENTRY, 0)
    revisions = by_type.get(ContributionEvent.Type.REVISION, 0)
    total = dictionary_terms + folklore_entries + revisions
    last_event = qs.order_by("-awarded_at").first()
    return {
        "dictionary_terms": dictionary_terms,
        "folklore_entries": folklore_entries,
        "revisions": revisions,
        "total": total,
        "last_contribution_at": last_event.awarded_at if last_event else None,
    }


def _leaderboard_queryset():
    """
    Legacy aggregate queryset.

    Note:
    Newer leaderboard endpoints often use cached stats table.
    This helper is still kept for compatibility and tests.
    """
    return (
        User.objects.all()
        .annotate(
            dictionary_terms_count=models.Count(
                "contribution_events",
                filter=models.Q(
                    contribution_events__contribution_type=ContributionEvent.Type.DICTIONARY_TERM
                ),
                distinct=True,
            ),
            folklore_entries_count=models.Count(
                "contribution_events",
                filter=models.Q(
                    contribution_events__contribution_type=ContributionEvent.Type.FOLKLORE_ENTRY
                ),
                distinct=True,
            ),
            revisions_count=models.Count(
                "contribution_events",
                filter=models.Q(
                    contribution_events__contribution_type=ContributionEvent.Type.REVISION
                ),
                distinct=True,
            ),
            last_contribution_at=models.Max("contribution_events__awarded_at"),
            municipality_name=models.Max("profile__municipality"),
        )
        .annotate(
            total=models.F("dictionary_terms_count")
            + models.F("folklore_entries_count")
            + models.F("revisions_count")
        )
        .filter(total__gt=0)
    )


def global_leaderboard(*, limit=50):
    """Return top users globally ordered by total contribution count."""
    qs = _leaderboard_queryset().order_by("-total", "-last_contribution_at", "username")
    return qs[:limit]


def municipality_leaderboard(*, municipality, limit=50):
    """Return top users within one municipality by total contribution count."""
    qs = (
        _leaderboard_queryset()
        .filter(profile__municipality__iexact=municipality)
        .order_by("-total", "-last_contribution_at", "username")
    )
    return qs[:limit]

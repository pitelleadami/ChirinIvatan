from django.contrib.auth import get_user_model
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_GET

from dictionary.models import Entry, EntryStatus
from folklore.models import FolkloreEntry
from users.contributions import global_leaderboard, municipality_leaderboard
from users.models import ContributionEvent


User = get_user_model()


def _serialize_user_row(user, request):
    profile = getattr(user, "profile", None)
    photo_url = ""
    if profile and profile.profile_photo:
        photo_url = request.build_absolute_uri(profile.profile_photo.url)

    return {
        "username": user.username,
        "profile_photo": photo_url,
        "municipality": user.municipality_name or "",
        "dictionary_terms_count": user.dictionary_terms_count,
        "folklore_entries_count": user.folklore_entries_count,
        "revisions_count": user.revisions_count,
        "total_contributions": user.total,
        "last_contribution_date": user.last_contribution_at.isoformat()
        if user.last_contribution_at
        else None,
    }


@require_GET
def global_leaderboard_view(request):
    rows = [_serialize_user_row(user, request) for user in global_leaderboard()]
    return JsonResponse({"leaderboard_type": "global", "rows": rows})


@require_GET
def municipality_leaderboard_view(request):
    municipality = (request.GET.get("municipality") or "").strip()
    if not municipality:
        return JsonResponse(
            {"detail": "Query param 'municipality' is required."},
            status=400,
        )

    rows = [
        _serialize_user_row(user, request)
        for user in municipality_leaderboard(municipality=municipality)
    ]
    return JsonResponse(
        {
            "leaderboard_type": "municipality",
            "municipality": municipality,
            "rows": rows,
        }
    )


def _serialize_term(entry):
    return {
        "entry_id": str(entry.id),
        "term": entry.term,
        "status": entry.status,
    }


def _serialize_folklore(entry):
    return {
        "entry_id": str(entry.id),
        "title": entry.title,
        "category": entry.category,
        "status": entry.status,
    }


@require_GET
def public_user_profile_view(request, username):
    user = User.objects.filter(username=username).first()
    if not user:
        raise Http404("User not found.")

    profile = getattr(user, "profile", None)
    photo_url = ""
    if profile and profile.profile_photo:
        photo_url = request.build_absolute_uri(profile.profile_photo.url)

    # Spec quote:
    # "Hidden: Drafts, Rejections, Review actions."
    visible_statuses = [EntryStatus.APPROVED, EntryStatus.APPROVED_UNDER_REVIEW]
    approved_mother_terms = Entry.objects.filter(
        initial_contributor=user,
        is_mother=True,
        status__in=visible_statuses,
    ).order_by("term")
    approved_folklore_entries = FolkloreEntry.objects.filter(
        contributor=user,
        status__in=[FolkloreEntry.Status.APPROVED, FolkloreEntry.Status.APPROVED_UNDER_REVIEW],
    ).order_by("title")

    # Locked rule reminder:
    # Revisions are counted uniquely per contributor per entry lifetime.
    revised_entry_ids = (
        ContributionEvent.objects.filter(
            user=user,
            contribution_type=ContributionEvent.Type.REVISION,
            dictionary_entry__isnull=False,
        )
        .values_list("dictionary_entry_id", flat=True)
        .distinct()
    )
    revised_entries = Entry.objects.filter(
        id__in=revised_entry_ids,
        status__in=visible_statuses,
    ).order_by("term")

    dictionary_terms_count = approved_mother_terms.count()
    folklore_entries_count = approved_folklore_entries.count()
    revisions_count = revised_entries.count()

    # Profile total follows project formula:
    # total = dictionary_terms + folklore_entries + revisions
    total_contributions = (
        dictionary_terms_count + folklore_entries_count + revisions_count
    )

    return JsonResponse(
        {
            "header": {
                "username": user.username,
                "profile_photo": photo_url,
                "municipality": profile.municipality if profile else "",
                "affiliation": profile.affiliation if profile else "",
                "occupation": profile.occupation if profile else "",
                "bio": profile.bio if profile else "",
                "joined_date": user.date_joined.date().isoformat(),
            },
            "contribution_summary": {
                "dictionary_terms": dictionary_terms_count,
                "folklore_entries": folklore_entries_count,
                "revisions": revisions_count,
                "total_contributions": total_contributions,
            },
            "lists": {
                "approved_mother_terms": [
                    _serialize_term(entry) for entry in approved_mother_terms
                ],
                "approved_folklore_entries": [
                    _serialize_folklore(entry) for entry in approved_folklore_entries
                ],
                "entries_revised": [_serialize_term(entry) for entry in revised_entries],
            },
        }
    )

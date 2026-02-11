from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_GET

from dictionary.models import Entry, EntryStatus
from dictionary.services import get_visible_revision_history


def public_dictionary(request):
    return HttpResponse("Public dictionary view – coming soon.")


def _is_reviewer_or_admin(user):
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name__in=["Reviewer", "Admin"]).exists()


def _serialize_revision(revision):
    return {
        "id": str(revision.id),
        "status": revision.status,
        "is_base_snapshot": revision.is_base_snapshot,
        "proposed_data": revision.proposed_data,
        "contributor_username": revision.contributor.username,
        "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
        "created_at": revision.created_at.isoformat(),
    }


@require_GET
def dictionary_entry_detail_view(request, entry_id):
    try:
        entry = Entry.objects.get(
            id=entry_id,
            status__in=[EntryStatus.APPROVED, EntryStatus.APPROVED_UNDER_REVIEW],
        )
    except Entry.DoesNotExist as exc:
        raise Http404("Dictionary entry not found.") from exc

    # SPEC quote:
    # Public: base + last 5 approved revisions.
    # Reviewer/Admin: base + last 15 approved revisions.
    audience = "staff" if _is_reviewer_or_admin(request.user) else "public"
    history = get_visible_revision_history(entry=entry, audience=audience)

    return JsonResponse(
        {
            "entry": {
                "id": str(entry.id),
                "term": entry.term,
                "status": entry.status,
                "is_mother": entry.is_mother,
                "meaning": entry.meaning,
                "part_of_speech": entry.part_of_speech,
            },
            "revision_history": {
                "audience": audience,
                "base_snapshot": _serialize_revision(history["base_snapshot"])
                if history["base_snapshot"]
                else None,
                "recent_approved_revisions": [
                    _serialize_revision(rev)
                    for rev in history["recent_approved_revisions"]
                ],
            },
        }
    )

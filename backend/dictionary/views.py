from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_GET

from dictionary.models import Entry, EntryRevision, EntryStatus
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


def _media_url(request, file_field):
    if not file_field:
        return ""
    return request.build_absolute_uri(file_field.url)


def _semantic_source_entry(entry: Entry):
    """
    Semantic core fields are authoritative on mother entry.
    For a variant, we show the mother's semantic core as read-only.
    """

    if entry.is_mother:
        return entry

    group = entry.variant_group
    if not group or not group.mother_entry:
        # Fallback for edge cases where group temporarily has no mother.
        return entry

    return group.mother_entry


def _serialize_connected_variants(entry: Entry):
    if not entry.variant_group_id:
        return []

    # Public list shows approved related terms in the same group.
    related = (
        entry.variant_group.entries.filter(status=EntryStatus.APPROVED)
        .exclude(id=entry.id)
        .order_by("term")
    )

    return [
        {
            "entry_id": str(item.id),
            "term": item.term,
            "variant_type": item.variant_type,
            "pronunciation_text": item.pronunciation_text,
            "is_mother": item.is_mother,
        }
        for item in related
    ]


def _serialize_contributors(entry: Entry):
    approved_revision_contributors = (
        EntryRevision.objects.filter(
            entry=entry,
            status=EntryRevision.Status.APPROVED,
            is_base_snapshot=False,
        )
        .values_list("contributor__username", flat=True)
        .distinct()
    )

    return {
        "original_contributor": entry.initial_contributor.username,
        "unique_revision_contributors": sorted(approved_revision_contributors),
        "last_revised_by": (
            entry.last_revised_by.username if entry.last_revised_by else None
        ),
        "approved_by": sorted(
            list(entry.last_approved_by.values_list("username", flat=True))
        ),
    }


def _serialize_attribution(entry: Entry):
    """
    Source/attribution visibility rules from SPEC:
    - Term source hidden if self-knowledge.
    - Audio source hidden if self-recorded.
    - Photo source hidden if contributor-owned.
    - Audio contributor hidden if it is the same contributor context as term.
    """

    term_contributor = entry.initial_contributor.username
    audio_contributor = (
        entry.audio_contributor.username if entry.audio_contributor else None
    )
    photo_contributor = (
        entry.photo_contributor.username if entry.photo_contributor else None
    )

    if audio_contributor and entry.audio_contributor_id == entry.initial_contributor_id:
        audio_contributor = None

    return {
        "term": {
            "initially_contributed_by": term_contributor,
            "source_text": "" if entry.term_source_is_self_knowledge else entry.source_text,
        },
        "audio": {
            "contributed_by": audio_contributor,
            "source": "" if entry.audio_source_is_self_recorded else entry.audio_source,
        },
        "photo": {
            "contributed_by": photo_contributor,
            "source": (
                "" if entry.photo_source_is_contributor_owned else entry.photo_source
            ),
        },
        "always_visible": {
            "last_revised_by": (
                entry.last_revised_by.username if entry.last_revised_by else None
            ),
            "reviewed_and_approved_by": sorted(
                list(entry.last_approved_by.values_list("username", flat=True))
            ),
        },
    }


@require_GET
def dictionary_entry_detail_view(request, entry_id):
    try:
        entry = (
            Entry.objects.select_related(
                "initial_contributor",
                "last_revised_by",
                "variant_group__mother_entry",
            )
            .prefetch_related("last_approved_by")
            .get(
                id=entry_id,
                status__in=[EntryStatus.APPROVED, EntryStatus.APPROVED_UNDER_REVIEW],
            )
        )
    except Entry.DoesNotExist as exc:
        raise Http404("Dictionary entry not found.") from exc

    # SPEC quote:
    # Public: base + last 5 approved revisions.
    # Reviewer/Admin: base + last 15 approved revisions.
    audience = "staff" if _is_reviewer_or_admin(request.user) else "public"
    history = get_visible_revision_history(entry=entry, audience=audience)
    semantic_entry = _semantic_source_entry(entry)

    return JsonResponse(
        {
            # Header block from SPEC:
            # mother term, variant badge, pronunciation, audio, variant type
            "header": {
                "entry_id": str(entry.id),
                "term": entry.term,
                "mother_term": semantic_entry.term,
                "is_variant": not entry.is_mother,
                "status": entry.status,
                "pronunciation_text": entry.pronunciation_text,
                "audio_pronunciation_url": _media_url(request, entry.audio_pronunciation),
                "variant_type": entry.variant_type,
            },
            # Semantic core is always sourced from mother when available.
            "semantic_core": {
                "source_entry_id": str(semantic_entry.id),
                "meaning": semantic_entry.meaning,
                "part_of_speech": semantic_entry.part_of_speech,
                "english_synonym": semantic_entry.english_synonym,
                "ivatan_synonym": semantic_entry.ivatan_synonym,
                "english_antonym": semantic_entry.english_antonym,
                "ivatan_antonym": semantic_entry.ivatan_antonym,
                "inflected_forms": semantic_entry.inflected_forms,
                "photo_url": _media_url(request, semantic_entry.photo),
                "photo_source": semantic_entry.photo_source,
            },
            # Variant-specific section always shows current clicked term fields.
            "variant_section": {
                "term": entry.term,
                "pronunciation_text": entry.pronunciation_text,
                "audio_pronunciation_url": _media_url(request, entry.audio_pronunciation),
                "audio_source": entry.audio_source,
                "source_text": entry.source_text,
                "usage_notes": entry.usage_notes,
                "etymology": entry.etymology,
                "example_sentence": entry.example_sentence,
                "example_translation": entry.example_translation,
                "variant_type": entry.variant_type,
            },
            "connected_variants": _serialize_connected_variants(entry),
            "contributors": _serialize_contributors(entry),
            "attribution": _serialize_attribution(entry),
            # Keep a compact entry object for backward compatibility with
            # earlier clients already reading this key.
            "entry": {
                "id": str(entry.id),
                "term": entry.term,
                "status": entry.status,
                "is_mother": entry.is_mother,
                "meaning": semantic_entry.meaning,
                "part_of_speech": semantic_entry.part_of_speech,
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

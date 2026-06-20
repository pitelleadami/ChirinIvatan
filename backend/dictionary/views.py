"""
dictionary/views.py

This file serves dictionary read APIs.
It assembles response payloads using governance-aware visibility rules.

Quick troubleshooting:
- Missing expected field in response: check serializer helper in this file.
- Wrong revision history length: check audience role + services history limits.
- Semantic mismatch on variant pages: check `_semantic_source_entry`.
"""

import json
import re

from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from dictionary.models import Entry, EntryRevision, EntryStatus
from dictionary.services import create_revision_from_entry, get_visible_revision_history
from dictionary.text import capitalize_first, normalize_headword, normalize_sentence
from users.names import display_name as formatted_display_name
from users.names import normalize_username

EDITABLE_REVISION_FIELDS = (
    "term",
    "meaning",
    "part_of_speech",
    "pronunciation_text",
    "phonetic",
    "audio_source",
    "audio_source_is_self_recorded",
    "audio_license",
    "variant_type",
    "variants",
    "usage_notes",
    "etymology",
    "example_sentence",
    "example_translation",
    "source_text",
    "term_source_is_self_knowledge",
    "inflected_forms",
    "photo_source",
    "photo_source_is_contributor_owned",
    "photo_license",
    "english_synonym",
    "ivatan_synonym",
    "english_antonym",
    "ivatan_antonym",
)


BOOLEAN_REVISION_FIELDS = {
    "audio_source_is_self_recorded",
    "term_source_is_self_knowledge",
    "photo_source_is_contributor_owned",
}

VISIBLE_PUBLIC_STATUSES = [
    EntryStatus.APPROVED,
    EntryStatus.APPROVED_UNDER_REVIEW,
]
DEFAULT_MEDIA_LICENSE = "CC BY-NC 4.0"


def _live_contributor_q(field_name):
    return Q(**{f"{field_name}__profile__isnull": True}) | Q(
        **{f"{field_name}__profile__show_live_contributions": True}
    )


def _public_username(user):
    if not user:
        return None
    profile = getattr(user, "profile", None)
    if profile and profile.show_live_contributions is False:
        return None
    return normalize_username(user.username)


def _public_actor(user):
    username = _public_username(user)
    if not username:
        return None
    profile = getattr(user, "profile", None)
    return {
        "username": username,
        "display_name": formatted_display_name(user, profile),
    }


def public_dictionary(request):
    # Root API index for local development sanity checks.
    return JsonResponse(
        {
            "service": "Chirin Ivatan Backend",
            "status": "ok",
            "docs_hint": "Use project docs under /docs for full workflow guides.",
            "key_endpoints": {
                "reviews_dashboard": "/api/reviews/dashboard",
                "dictionary_entry_detail": "/api/dictionary/entries/<entry_uuid>",
                "folklore_entries": "/api/folklore/entries",
                "user_profile": "/api/users/<username>",
            },
        }
    )


def _is_reviewer_or_admin(user):
    # Staff audience gets deeper revision visibility than public audience.
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name__in=["Reviewer", "Admin"]).exists()


def _can_flag_live_entry(user):
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name__in=["Contributor", "Reviewer", "Consultant", "Admin"]).exists()


def _require_authenticated(request):
    if request.user.is_authenticated:
        return None
    return JsonResponse({"detail": "Authentication required."}, status=401)


def _parse_json_body(request):
    try:
        return json.loads(request.body or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"detail": "Invalid JSON body."}, status=400)


def _parse_revision_payload(request):
    content_type = (request.content_type or "").lower()
    if "application/json" in content_type:
        return _parse_json_body(request)

    payload = {}
    for key, value in request.POST.items():
        payload[key] = value
    return payload, None


def _as_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _normalize_variants(value):
    if isinstance(value, list):
        parsed = value
    elif not str(value or "").strip():
        parsed = []
    else:
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValidationError("variants must be valid JSON.") from exc

    if not isinstance(parsed, list):
        raise ValidationError("variants must be a JSON array.")

    variants = []
    for item in parsed:
        if not isinstance(item, dict):
            raise ValidationError("variants items must be JSON objects.")
        variants.append(
            {
                "term": normalize_headword(item.get("term")),
                "variant_type": str(item.get("variant_type") or ""),
                "pronunciation_text": str(item.get("pronunciation_text") or ""),
                "phonetic": str(item.get("phonetic") or ""),
                "usage_notes": str(item.get("usage_notes") or ""),
                "etymology": str(item.get("etymology") or ""),
                "example_sentence": normalize_sentence(item.get("example_sentence")),
                "example_translation": normalize_sentence(item.get("example_translation")),
                "historical_note": str(item.get("historical_note") or ""),
                "audio_source": str(item.get("audio_source") or ""),
                "audio_source_is_self_recorded": _as_bool(
                    item.get("audio_source_is_self_recorded")
                ),
                **(
                    {"audio_pronunciation": str(item.get("audio_pronunciation") or "")}
                    if item.get("audio_pronunciation")
                    else {}
                ),
            }
        )
    return variants


def _editable_revision_payload(payload):
    result = {}
    for field in EDITABLE_REVISION_FIELDS:
        if field not in payload:
            continue
        value = payload[field]
        if field in BOOLEAN_REVISION_FIELDS:
            result[field] = _as_bool(value)
        elif field == "inflected_forms":
            if isinstance(value, dict):
                result[field] = value
            elif not str(value or "").strip():
                result[field] = {}
            else:
                try:
                    parsed = json.loads(value)
                except json.JSONDecodeError as exc:
                    raise ValidationError("inflected_forms must be valid JSON.") from exc
                if not isinstance(parsed, dict):
                    raise ValidationError("inflected_forms must be a JSON object.")
                result[field] = parsed
        elif field == "variants":
            result[field] = _normalize_variants(value)
        elif field == "term":
            result[field] = normalize_headword(value)
        elif field in {"example_sentence", "example_translation"}:
            result[field] = normalize_sentence(value)
        elif field == "meaning":
            result[field] = capitalize_first(value)
        else:
            result[field] = str(value or "")
    return result


def _uploaded_revision_media_payload(request, proposed_data=None):
    media_payload = {}
    audio_file = request.FILES.get("audio_pronunciation")
    photo_file = request.FILES.get("photo")

    if audio_file:
        media_payload["audio_pronunciation"] = default_storage.save(
            f"dictionary/audio/{audio_file.name}",
            audio_file,
        )
    if photo_file:
        media_payload["photo"] = default_storage.save(
            f"dictionary/photos/{photo_file.name}",
            photo_file,
        )

    variants = list((proposed_data or {}).get("variants") or [])
    has_variant_audio = False
    for key, file_value in request.FILES.items():
        if not key.startswith("variant_audio_"):
            continue
        try:
            index = int(key.replace("variant_audio_", "", 1))
        except ValueError:
            continue
        if index < 0 or index >= len(variants):
            continue
        variants[index]["audio_pronunciation"] = default_storage.save(
            f"dictionary/audio/{file_value.name}",
            file_value,
        )
        has_variant_audio = True
    if has_variant_audio:
        media_payload["variants"] = variants

    return media_payload


def _validate_submittable_revision_data(data):
    if not str(data.get("term", "")).strip():
        raise ValidationError("headword is required before submitting a dictionary revision.")
    if not str(data.get("meaning", "")).strip():
        raise ValidationError("meaning is required before submitting a dictionary revision.")
    if (
        str(data.get("example_sentence", "")).strip()
        and not str(data.get("example_translation", "")).strip()
    ):
        raise ValidationError(
            "English translation is required when an Ivatan example sentence is provided."
        )
    for index, variant in enumerate(data.get("variants") or [], start=1):
        if (
            str(variant.get("example_sentence", "")).strip()
            and not str(variant.get("example_translation", "")).strip()
        ):
            raise ValidationError(
                f"English translation is required for Variant {index} when an Ivatan example sentence is provided."
            )
    if (
        not _as_bool(data.get("term_source_is_self_knowledge"))
        and not str(data.get("source_text", "")).strip()
    ):
        raise ValidationError(
            "headword source is required unless the headword source is self-knowledge."
        )
    if (
        data.get("audio_pronunciation")
        and not _as_bool(data.get("audio_source_is_self_recorded"))
        and not str(data.get("audio_source", "")).strip()
    ):
        raise ValidationError("audio source is required unless the audio source is self-recorded.")
    if (
        data.get("photo")
        and not _as_bool(data.get("photo_source_is_contributor_owned"))
        and not str(data.get("photo_source", "")).strip()
    ):
        raise ValidationError(
            "photo source is required unless the photo source is contributor-owned."
        )


def _has_meaningful_revision_value(value, *, top_level=False):
    if isinstance(value, bool):
        return top_level
    if isinstance(value, dict):
        return any(_has_meaningful_revision_value(item) for item in value.values())
    if isinstance(value, list):
        return any(_has_meaningful_revision_value(item) for item in value)
    return bool(str(value or "").strip())


def _has_draft_content(data, request):
    return any(
        _has_meaningful_revision_value(value, top_level=True) for value in (data or {}).values()
    ) or bool(request.FILES)


def _normalize_media_licenses(data):
    if data.get("audio_source_is_self_recorded"):
        data["audio_license"] = str(data.get("audio_license") or DEFAULT_MEDIA_LICENSE).strip()
    else:
        data["audio_license"] = ""

    if data.get("photo_source_is_contributor_owned"):
        data["photo_license"] = str(data.get("photo_license") or DEFAULT_MEDIA_LICENSE).strip()
    else:
        data["photo_license"] = ""

    return data


def _stored_media_url(request, stored_path):
    if not stored_path:
        return ""
    try:
        return request.build_absolute_uri(default_storage.url(stored_path))
    except Exception:
        return ""


def _serialize_revision_row(revision, request=None):
    proposed = revision.proposed_data or {}
    audio_path = proposed.get("audio_pronunciation", "")
    photo_path = proposed.get("photo", "")
    correction = getattr(revision, "correction_assignment", None)
    return {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "term": proposed.get("term", ""),
        "meaning": proposed.get("meaning", ""),
        "part_of_speech": proposed.get("part_of_speech", ""),
        "variant_type": proposed.get("variant_type", ""),
        "variants": proposed.get("variants", []),
        "audio_pronunciation": audio_path,
        "audio_pronunciation_url": _stored_media_url(request, audio_path) if request else "",
        "photo": photo_path,
        "photo_url": _stored_media_url(request, photo_path) if request else "",
        "proposed_data": proposed,
        "status": revision.status,
        "reviewer_notes": revision.reviewer_notes,
        "created_at": revision.created_at.isoformat(),
        "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
        "correction_assignment": (
            {
                "assignment_id": str(correction.id),
                "scope": correction.scope,
                "notes": correction.notes,
                "returned_by": correction.returned_by.username,
                "status": correction.status,
                "source_snapshot": correction.source_snapshot,
            }
            if correction
            else None
        ),
    }


def _serialize_revision(revision):
    # Canonical revision serializer used for history responses.
    return {
        "id": str(revision.id),
        "status": revision.status,
        "is_base_snapshot": revision.is_base_snapshot,
        "proposed_data": revision.proposed_data,
        "contributor_username": _public_username(revision.contributor),
        "reviewer_notes": revision.reviewer_notes,
        "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
        "created_at": revision.created_at.isoformat(),
    }


def _serialize_public_entry_row(entry, request=None):
    semantic_entry = _semantic_source_entry(entry)
    return {
        "entry_id": str(entry.id),
        "term": entry.term,
        "is_mother": entry.is_mother,
        "variant_group_id": str(entry.variant_group_id) if entry.variant_group_id else None,
        "meaning": semantic_entry.meaning,
        "part_of_speech": semantic_entry.part_of_speech,
        "audio_pronunciation_url": (
            _media_url(request, entry.audio_pronunciation) if request else ""
        ),
        "photo_url": _media_url(request, semantic_entry.photo) if request else "",
        "status": entry.status,
        "created_at": entry.created_at.isoformat(),
        "approved_at": entry.last_approved_at.isoformat() if entry.last_approved_at else None,
    }


def _english_lookup_key(value):
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", str(value or "").lower())
    if not (1 <= len(words) <= 2):
        return ""
    return " ".join(words)


@require_GET
def dictionary_entries_list_view(request):
    limit_raw = request.GET.get("limit", "200")
    search_term = request.GET.get("q", "").strip()
    starts_with = request.GET.get("starts_with", "").strip()
    sort_mode = request.GET.get("sort", "recent").strip().lower()
    mother_only = _as_bool(request.GET.get("mother_only"), default=False)

    try:
        limit = int(limit_raw)
    except ValueError:
        return JsonResponse({"detail": "limit must be an integer."}, status=400)

    limit = max(1, min(limit, 500))
    queryset = (
        Entry.objects.select_related("variant_group__mother_entry")
        .filter(status__in=VISIBLE_PUBLIC_STATUSES)
        .filter(_live_contributor_q("initial_contributor"))
    )

    if search_term:
        queryset = queryset.filter(term__icontains=search_term)

    if starts_with:
        queryset = queryset.filter(term__istartswith=starts_with[:1])

    if mother_only:
        queryset = queryset.filter(Q(is_mother=True) | Q(variant_group__isnull=True))

    if sort_mode == "alpha":
        queryset = queryset.order_by("term", "-last_approved_at")
    else:
        queryset = queryset.order_by("-last_approved_at", "-created_at")

    rows = queryset[:limit]
    return JsonResponse(
        {
            "rows": [_serialize_public_entry_row(entry, request=request) for entry in rows],
            "counts": {
                "visible_total": queryset.count(),
                "approved": queryset.filter(status=EntryStatus.APPROVED).count(),
                "approved_under_review": queryset.filter(
                    status=EntryStatus.APPROVED_UNDER_REVIEW
                ).count(),
            },
        }
    )


@require_GET
def dictionary_english_terms_view(request):
    limit_raw = request.GET.get("limit", "100")
    search_term = _english_lookup_key(request.GET.get("q", ""))

    try:
        limit = int(limit_raw)
    except ValueError:
        return JsonResponse({"detail": "limit must be an integer."}, status=400)

    limit = max(1, min(limit, 200))
    queryset = (
        Entry.objects.select_related("variant_group__mother_entry")
        .filter(status__in=VISIBLE_PUBLIC_STATUSES)
        .filter(_live_contributor_q("initial_contributor"))
        .order_by("term")
    )

    lookup_rows = {}
    for entry in queryset:
        semantic_entry = _semantic_source_entry(entry)
        english_terms = [
            _english_lookup_key(semantic_entry.meaning),
            *[
                _english_lookup_key(item)
                for item in re.split(r"[,;\n]", semantic_entry.english_synonym or "")
            ],
        ]
        for english_term in dict.fromkeys(item for item in english_terms if item):
            if search_term and search_term not in english_term:
                continue

            row = lookup_rows.setdefault(
                english_term,
                {
                    "english_term": english_term,
                    "translations": [],
                },
            )
            row["translations"].append(
                {
                    "entry_id": str(entry.id),
                    "term": entry.term,
                    "part_of_speech": semantic_entry.part_of_speech,
                }
            )

    rows = sorted(lookup_rows.values(), key=lambda item: item["english_term"])[:limit]
    return JsonResponse({"rows": rows, "count": len(rows)})


@require_GET
def my_dictionary_revisions_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    rows = EntryRevision.objects.filter(contributor=request.user).order_by("-created_at")
    return JsonResponse(
        {"rows": [_serialize_revision_row(revision, request=request) for revision in rows]}
    )


@require_http_methods(["POST"])
def create_dictionary_revision_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    payload, parse_error = _parse_revision_payload(request)
    if parse_error:
        return parse_error

    try:
        proposed_data = _editable_revision_payload(payload)
        proposed_data.update(_uploaded_revision_media_payload(request, proposed_data=proposed_data))
        _normalize_media_licenses(proposed_data)
    except ValidationError as exc:
        return JsonResponse({"detail": exc.messages[0]}, status=400)

    if not _has_draft_content(proposed_data, request):
        return JsonResponse(
            {"detail": "Add at least one field before saving this dictionary draft."}, status=400
        )
    if not str(proposed_data.get("term", "")).strip():
        return JsonResponse(
            {"detail": "Headword is required before saving a dictionary draft."}, status=400
        )

    revision = EntryRevision.objects.create(
        contributor=request.user,
        proposed_data=proposed_data,
        status=EntryRevision.Status.DRAFT,
    )
    return JsonResponse(_serialize_revision_row(revision, request=request), status=201)


@require_http_methods(["POST"])
def start_dictionary_entry_revision_view(request, entry_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    try:
        entry = Entry.objects.get(
            id=entry_id,
            status__in=[EntryStatus.APPROVED, EntryStatus.APPROVED_UNDER_REVIEW],
        )
    except Entry.DoesNotExist:
        return JsonResponse({"detail": "Dictionary entry not found."}, status=404)

    revision = create_revision_from_entry(entry=entry, contributor=request.user)
    return JsonResponse(_serialize_revision_row(revision, request=request), status=201)


@require_http_methods(["PATCH", "POST"])
def update_dictionary_revision_view(request, revision_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    payload, parse_error = _parse_revision_payload(request)
    if parse_error:
        return parse_error

    try:
        revision = EntryRevision.objects.get(id=revision_id)
    except EntryRevision.DoesNotExist:
        return JsonResponse({"detail": "Dictionary revision not found."}, status=404)

    if revision.contributor_id != request.user.id:
        return JsonResponse({"detail": "You can edit only your own revision."}, status=403)
    if revision.status not in {EntryRevision.Status.DRAFT, EntryRevision.Status.REJECTED}:
        return JsonResponse(
            {"detail": "Only DRAFT or REJECTED submissions are editable."},
            status=400,
        )

    try:
        updates = _editable_revision_payload(payload)
        updates.update(_uploaded_revision_media_payload(request, proposed_data=updates))
    except ValidationError as exc:
        return JsonResponse({"detail": exc.messages[0]}, status=400)

    if not updates:
        return JsonResponse({"detail": "No editable fields provided."}, status=400)

    proposed_data = dict(revision.proposed_data or {})
    proposed_data.update(updates)
    _normalize_media_licenses(proposed_data)
    if not str(proposed_data.get("term", "")).strip():
        return JsonResponse(
            {"detail": "Headword is required before saving a dictionary draft."}, status=400
        )
    revision.proposed_data = proposed_data
    revision.save(update_fields=["proposed_data"])
    return JsonResponse(_serialize_revision_row(revision, request=request))


@require_http_methods(["POST"])
def submit_dictionary_revision_view(request, revision_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    try:
        revision = EntryRevision.objects.get(id=revision_id)
    except EntryRevision.DoesNotExist:
        return JsonResponse({"detail": "Dictionary revision not found."}, status=404)

    if revision.contributor_id != request.user.id:
        return JsonResponse({"detail": "You can submit only your own revision."}, status=403)
    if revision.status not in {EntryRevision.Status.DRAFT, EntryRevision.Status.REJECTED}:
        return JsonResponse(
            {"detail": "Only DRAFT or REJECTED submissions can be submitted."},
            status=400,
        )

    try:
        _validate_submittable_revision_data(revision.proposed_data or {})
    except ValidationError as exc:
        return JsonResponse({"detail": exc.messages[0]}, status=400)

    revision.status = EntryRevision.Status.PENDING
    revision.save(update_fields=["status"])
    correction = getattr(revision, "correction_assignment", None)
    if correction:
        correction.status = "submitted"
        correction.save(update_fields=["status"])
    return JsonResponse(_serialize_revision_row(revision, request=request))


@require_http_methods(["DELETE"])
def delete_dictionary_revision_view(request, revision_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    try:
        revision = EntryRevision.objects.get(id=revision_id)
    except EntryRevision.DoesNotExist:
        return JsonResponse({"detail": "Dictionary revision not found."}, status=404)

    if revision.contributor_id != request.user.id:
        return JsonResponse({"detail": "You can delete only your own revision."}, status=403)

    if revision.status != EntryRevision.Status.DRAFT:
        return JsonResponse(
            {"detail": "Only editable DRAFT submissions can be deleted."},
            status=400,
        )

    revision.delete()
    return JsonResponse({"ok": True})


def _media_url(request, file_field):
    # Build absolute URL because frontend may run on different origin/port.
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


def _serialize_connected_variants(entry: Entry, request=None):
    # Connected variants shown in entry detail page.
    if not entry.variant_group_id:
        return []

    # Public list shows approved related terms in the same group.
    related = (
        entry.variant_group.entries.filter(status__in=VISIBLE_PUBLIC_STATUSES)
        .filter(_live_contributor_q("initial_contributor"))
        .exclude(id=entry.id)
        .order_by("term")
    )

    return [
        {
            "entry_id": str(item.id),
            "term": item.term,
            "variant_type": item.variant_type,
            "pronunciation_text": item.pronunciation_text,
            "phonetic": item.phonetic,
            "audio_pronunciation_url": (
                _media_url(request, item.audio_pronunciation) if request else ""
            ),
            "usage_notes": item.usage_notes,
            "etymology": item.etymology,
            "example_sentence": item.example_sentence,
            "example_translation": item.example_translation,
            "is_mother": item.is_mother,
        }
        for item in related
    ]


def _serialize_contributors(entry: Entry):
    # Contributor section in public detail page.
    approved_revision_contributors = list(
        EntryRevision.objects.filter(
            entry=entry,
            status=EntryRevision.Status.APPROVED,
            is_base_snapshot=False,
        )
        .filter(_live_contributor_q("contributor"))
        .select_related("contributor", "contributor__profile")
        .order_by("-approved_at", "-created_at")
    )
    revision_actors = []
    seen_usernames = set()
    for revision in approved_revision_contributors:
        actor = _public_actor(revision.contributor)
        if actor and actor["username"] not in seen_usernames:
            revision_actors.append(actor)
            seen_usernames.add(actor["username"])

    return {
        "original_contributor": _public_username(entry.initial_contributor),
        "original_contributor_actor": _public_actor(entry.initial_contributor),
        "unique_revision_contributors": sorted(seen_usernames),
        "unique_revision_contributor_actors": revision_actors,
        "last_revised_by": (revision_actors[0]["username"] if revision_actors else None),
        "last_revised_by_actor": revision_actors[0] if revision_actors else None,
        "approved_by": sorted(list(entry.last_approved_by.values_list("username", flat=True))),
        "approved_by_actors": [
            actor
            for actor in (_public_actor(user) for user in entry.last_approved_by.all())
            if actor
        ],
    }


def _serialize_attribution(entry: Entry):
    """
    Source/attribution visibility rules from SPEC:
    - Term source hidden if self-knowledge.
    - Audio source hidden if self-recorded.
    - Photo source hidden if contributor-owned.
    - Audio contributor hidden if it is the same contributor context as term.
    """

    semantic_entry = _semantic_source_entry(entry)

    term_contributor = _public_username(entry.initial_contributor)
    audio_contributor = (
        _public_username(entry.audio_contributor) if entry.audio_contributor else None
    )
    photo_contributor = (
        _public_username(semantic_entry.photo_contributor)
        if semantic_entry.photo_contributor
        else None
    )

    if audio_contributor and entry.audio_contributor_id == entry.initial_contributor_id:
        audio_contributor = None

    return {
        "term": {
            "initially_contributed_by": term_contributor,
            "initially_contributed_by_actor": _public_actor(entry.initial_contributor),
            "source_text": (
                "" if semantic_entry.term_source_is_self_knowledge else semantic_entry.source_text
            ),
        },
        "audio": {
            "contributed_by": audio_contributor,
            "source": "" if entry.audio_source_is_self_recorded else entry.audio_source,
            "license": entry.audio_license if entry.audio_source_is_self_recorded else "",
        },
        "photo": {
            "contributed_by": photo_contributor,
            "source": (
                ""
                if semantic_entry.photo_source_is_contributor_owned
                else semantic_entry.photo_source
            ),
            "license": (
                semantic_entry.photo_license
                if semantic_entry.photo_source_is_contributor_owned
                else ""
            ),
        },
        "always_visible": {
            "last_revised_by": (
                _public_username(entry.last_revised_by)
                if EntryRevision.objects.filter(
                    entry=entry,
                    status=EntryRevision.Status.APPROVED,
                    is_base_snapshot=False,
                ).exists()
                else None
            ),
            "reviewed_and_approved_by": sorted(
                list(entry.last_approved_by.values_list("username", flat=True))
            ),
            "reviewed_and_approved_by_actors": [
                actor
                for actor in (_public_actor(user) for user in entry.last_approved_by.all())
                if actor
            ],
        },
    }


def _latest_approved_revision(entry: Entry):
    return (
        EntryRevision.objects.filter(
            entry=entry,
            status=EntryRevision.Status.APPROVED,
        )
        .select_related("contributor")
        .order_by("-approved_at", "-created_at")
        .first()
    )


@require_GET
def dictionary_entry_detail_view(request, entry_id):
    """
    Main dictionary term detail endpoint.

    Includes:
    - header
    - semantic_core
    - variant_section
    - connected_variants
    - contributors
    - attribution
    - revision_history
    """
    try:
        entry = (
            Entry.objects.select_related(
                "initial_contributor",
                "last_revised_by",
                "variant_group__mother_entry",
            )
            .prefetch_related("last_approved_by")
            .filter(_live_contributor_q("initial_contributor"))
            .get(
                id=entry_id,
                status__in=VISIBLE_PUBLIC_STATUSES,
            )
        )
    except Entry.DoesNotExist:
        return JsonResponse({"detail": "Dictionary entry not found."}, status=404)

    # SPEC quote:
    # Public: base + last 5 approved revisions.
    # Reviewer/Admin: base + last 15 approved revisions.
    audience = "staff" if _is_reviewer_or_admin(request.user) else "public"
    history = get_visible_revision_history(entry=entry, audience=audience)
    semantic_entry = _semantic_source_entry(entry)
    latest_approved_revision = _latest_approved_revision(entry)

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
                "phonetic": entry.phonetic,
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
                "phonetic": entry.phonetic,
                "audio_pronunciation_url": _media_url(request, entry.audio_pronunciation),
                "audio_source": entry.audio_source,
                "source_text": entry.source_text,
                "usage_notes": entry.usage_notes,
                "etymology": entry.etymology,
                "example_sentence": entry.example_sentence,
                "example_translation": entry.example_translation,
                "variant_type": entry.variant_type,
            },
            "connected_variants": _serialize_connected_variants(entry, request=request),
            "contributors": _serialize_contributors(entry),
            "attribution": _serialize_attribution(entry),
            "review_action": {
                "can_flag_for_rereview": bool(
                    latest_approved_revision
                    and entry.status == EntryStatus.APPROVED
                    and _can_flag_live_entry(request.user)
                ),
                "latest_approved_revision_id": (
                    str(latest_approved_revision.id) if latest_approved_revision else None
                ),
                "latest_approved_revision_contributor": (
                    _public_username(latest_approved_revision.contributor)
                    if latest_approved_revision
                    else None
                ),
            },
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
                "base_snapshot": (
                    _serialize_revision(history["base_snapshot"])
                    if history["base_snapshot"]
                    else None
                ),
                "recent_approved_revisions": [
                    _serialize_revision(rev) for rev in history["recent_approved_revisions"]
                ],
                "recent_rejected_revisions": [
                    _serialize_revision(rev) for rev in history.get("recent_rejected_revisions", [])
                ],
            },
        }
    )

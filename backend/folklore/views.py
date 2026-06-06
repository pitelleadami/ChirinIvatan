"""
folklore/views.py

This file handles folklore API endpoints for:
- list/detail read views
- draft create/update/submit workflow
- contributor-owned revision listing

Troubleshooting:
- Validation errors usually come from conditional source/media rules.
- Missing uploads usually means request content type/body format mismatch.
"""

import json

from django.core.exceptions import ValidationError
from django.db.models import Q
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from folklore.models import (
    FOLKLORE_SUBCATEGORIES_BY_CATEGORY,
    FolkloreEntry,
    FolkloreRevision,
    normalize_folklore_taxonomy,
)


VISIBLE_PUBLIC_STATUSES = [
    FolkloreEntry.Status.APPROVED,
    FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
]


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
    return user.username


def _media_url(request, file_field):
    if not file_field:
        return ""
    return request.build_absolute_uri(file_field.url)


def _serialize_folklore_entry(entry: FolkloreEntry, request):
    # Public-list/detail serializer for live folklore entry rows.
    return {
        "entry_id": str(entry.id),
        "title": entry.title,
        "category": entry.category,
        "subcategory": entry.subcategory,
        "municipality_source": entry.municipality_source,
        "status": entry.status,
        "contributor_username": _public_username(entry.contributor),
        "photo_upload_url": _media_url(request, entry.photo_upload),
        "audio_upload_url": _media_url(request, entry.audio_upload),
        "created_at": entry.created_at.isoformat(),
    }


def _serialize_folklore_revision(revision: FolkloreRevision, request):
    # Contributor-facing serializer for draft/pending/approved revision rows.
    proposed_data = revision.proposed_data or {}
    return {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "title": proposed_data.get("title", ""),
        "content": proposed_data.get("content", ""),
        "category": proposed_data.get("category", ""),
        "subcategory": proposed_data.get("subcategory", ""),
        "municipality_source": proposed_data.get("municipality_source", ""),
        "source": proposed_data.get("source", ""),
        "self_knowledge": proposed_data.get("self_knowledge", None),
        "media_url": proposed_data.get("media_url", ""),
        "media_source": proposed_data.get("media_source", ""),
        "self_produced_media": proposed_data.get("self_produced_media", None),
        "copyright_usage": proposed_data.get("copyright_usage", ""),
        "proposed_data": proposed_data,
        "status": revision.status,
        "photo_upload_url": _media_url(request, revision.photo_upload),
        "audio_upload_url": _media_url(request, revision.audio_upload),
        "created_at": revision.created_at.isoformat(),
        "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
    }


def _is_reviewer_or_admin(user):
    if not user.is_authenticated:
        return False
    return user.is_superuser or user.groups.filter(name__in=["Admin", "Reviewer"]).exists()


def _latest_approved_folklore_revision(entry: FolkloreEntry):
    return (
        FolkloreRevision.objects.filter(
            entry=entry,
            status=FolkloreRevision.Status.APPROVED,
        )
        .select_related("contributor", "contributor__profile")
        .order_by("-approved_at", "-created_at")
        .first()
    )


def _require_authenticated(request):
    # Shared auth guard for write endpoints.
    if request.user.is_authenticated:
        return None
    return JsonResponse({"detail": "Authentication required."}, status=401)


def _parse_json_body(request):
    # Safe JSON parser: returns controlled 400 on malformed body.
    try:
        return json.loads(request.body or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"detail": "Invalid JSON body."}, status=400)


def _parse_request_payload(request):
    # Supports both JSON and multipart form submissions (for media uploads).
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


def _editable_payload_fields(payload):
    # Whitelist editable fields so unexpected keys are ignored.
    editable_fields = [
        "title",
        "content",
        "category",
        "subcategory",
        "municipality_source",
        "source",
        "self_knowledge",
        "media_url",
        "media_source",
        "self_produced_media",
        "copyright_usage",
    ]
    result = {field: payload[field] for field in editable_fields if field in payload}
    normalize_folklore_taxonomy(result)
    for boolean_field in ("self_knowledge", "self_produced_media"):
        if boolean_field in result:
            result[boolean_field] = _as_bool(result[boolean_field], default=False)
    return result


def _submission_missing_fields(*, data, has_photo, has_audio):
    # Enforces required fields and conditional source/media-source rules.
    missing = []
    for field in ("title", "content", "category", "subcategory"):
        if not str(data.get(field, "")).strip():
            missing.append(field)

    self_knowledge = _as_bool(data.get("self_knowledge"), default=False)
    if not self_knowledge and not str(data.get("source", "")).strip():
        missing.append("source")

    has_media = bool(str(data.get("media_url", "")).strip() or has_photo or has_audio)
    self_produced_media = _as_bool(data.get("self_produced_media"), default=False)
    if has_media and not self_produced_media and not str(data.get("media_source", "")).strip():
        missing.append("media_source")

    return missing


def _invalid_choice_errors(data):
    # Explicit enum-choice validation for cleaner user-facing errors.
    errors = []

    if "category" in data:
        valid_categories = set(FolkloreEntry.Category.values)
        if data["category"] not in valid_categories:
            errors.append("category")

    if "subcategory" in data:
        valid_subcategories = set(FolkloreEntry.Subcategory.values)
        if data["subcategory"] not in valid_subcategories:
            errors.append("subcategory")
        if (
            "category" in data
            and data["subcategory"] not in FOLKLORE_SUBCATEGORIES_BY_CATEGORY.get(data["category"], set())
        ):
            errors.append("subcategory")

    if "municipality_source" in data:
        valid_municipalities = set(FolkloreEntry.MunicipalitySource.values)
        if data["municipality_source"] not in valid_municipalities:
            errors.append("municipality_source")

    return errors


@require_GET
def folklore_entries_list_view(request):
    """
    Public folklore listing.

    Rule quote: only publicly visible states are returned.
    """

    entries = (
        FolkloreEntry.objects.filter(status__in=VISIBLE_PUBLIC_STATUSES)
        .filter(_live_contributor_q("contributor"))
        .select_related("contributor", "contributor__profile")
        .order_by("title")
    )
    return JsonResponse(
        {
            "rows": [_serialize_folklore_entry(entry, request) for entry in entries],
            "counts": {
                "visible_total": entries.count(),
                "approved": entries.filter(status=FolkloreEntry.Status.APPROVED).count(),
                "approved_under_review": entries.filter(
                    status=FolkloreEntry.Status.APPROVED_UNDER_REVIEW
                ).count(),
            },
        }
    )


@require_http_methods(["GET"])
def my_folklore_entries_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    revisions = FolkloreRevision.objects.filter(contributor=request.user).order_by("-created_at")
    return JsonResponse({"rows": [_serialize_folklore_revision(revision, request) for revision in revisions]})


@require_http_methods(["POST"])
def create_folklore_entry_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    payload, parse_error = _parse_request_payload(request)
    if parse_error:
        return parse_error

    photo_upload = request.FILES.get("photo_upload")
    audio_upload = request.FILES.get("audio_upload")

    proposed_data = _editable_payload_fields(payload)
    invalid_choices = _invalid_choice_errors(proposed_data)
    if invalid_choices:
        return JsonResponse(
            {"detail": f"Invalid choice values: {', '.join(invalid_choices)}"},
            status=400,
        )
    missing = _submission_missing_fields(
        data=proposed_data,
        has_photo=bool(photo_upload),
        has_audio=bool(audio_upload),
    )
    if missing:
        return JsonResponse(
            {"detail": f"Missing required fields: {', '.join(missing)}"},
            status=400,
        )

    revision = FolkloreRevision.objects.create(
        contributor=request.user,
        proposed_data=proposed_data,
        photo_upload=photo_upload,
        audio_upload=audio_upload,
        status=FolkloreRevision.Status.DRAFT,
    )
    return JsonResponse(
        {
            "revision_id": str(revision.id),
            "status": revision.status,
            "license_notice": (
                "If copyright_usage is empty at approval, default CC BY-NC 4.0 is applied."
            ),
        },
        status=201,
    )


@require_http_methods(["PATCH", "POST"])
def update_folklore_draft_view(request, revision_id):
    """
    Update a folklore draft revision.

    Supports both PATCH and POST for practical browser/client compatibility:
    - PATCH is canonical REST method.
    - POST fallback helps clients that struggle with multipart PATCH payloads.
    """
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    payload, parse_error = _parse_request_payload(request)
    if parse_error:
        return parse_error

    try:
        revision = FolkloreRevision.objects.get(id=revision_id)
    except FolkloreRevision.DoesNotExist:
        return JsonResponse({"detail": "Folklore revision not found."}, status=404)

    if revision.contributor_id != request.user.id:
        return JsonResponse({"detail": "You can edit only your own revision."}, status=403)
    if revision.status != FolkloreRevision.Status.DRAFT:
        return JsonResponse({"detail": "Only DRAFT revisions are editable."}, status=400)

    updates = _editable_payload_fields(payload)
    if not updates:
        return JsonResponse({"detail": "No editable fields provided."}, status=400)
    invalid_choices = _invalid_choice_errors(updates)
    if invalid_choices:
        return JsonResponse(
            {"detail": f"Invalid choice values: {', '.join(invalid_choices)}"},
            status=400,
        )

    next_payload = dict(revision.proposed_data or {})
    next_payload.update(updates)
    normalize_folklore_taxonomy(next_payload)
    invalid_choices = _invalid_choice_errors(next_payload)
    if invalid_choices:
        return JsonResponse(
            {"detail": f"Invalid choice values: {', '.join(invalid_choices)}"},
            status=400,
        )
    revision.proposed_data = next_payload
    update_fields = ["proposed_data"]
    if "photo_upload" in request.FILES:
        revision.photo_upload = request.FILES["photo_upload"]
        update_fields.append("photo_upload")
    if "audio_upload" in request.FILES:
        revision.audio_upload = request.FILES["audio_upload"]
        update_fields.append("audio_upload")
    revision.save(update_fields=update_fields)

    return JsonResponse(
        {
            "revision_id": str(revision.id),
            "status": revision.status,
            "license_notice": (
                "If copyright_usage is empty at approval, default CC BY-NC 4.0 is applied."
            ),
        }
    )


@require_http_methods(["POST"])
def submit_folklore_entry_view(request, revision_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    try:
        revision = FolkloreRevision.objects.get(id=revision_id)
    except FolkloreRevision.DoesNotExist:
        return JsonResponse({"detail": "Folklore revision not found."}, status=404)

    if revision.contributor_id != request.user.id:
        return JsonResponse({"detail": "You can submit only your own revision."}, status=403)
    if revision.status != FolkloreRevision.Status.DRAFT:
        return JsonResponse({"detail": "Only DRAFT revisions can be submitted."}, status=400)

    payload = normalize_folklore_taxonomy(dict(revision.proposed_data or {}))
    if payload != (revision.proposed_data or {}):
        revision.proposed_data = payload
        revision.save(update_fields=["proposed_data"])
    missing = _submission_missing_fields(
        data=payload,
        has_photo=bool(revision.photo_upload),
        has_audio=bool(revision.audio_upload),
    )
    if missing:
        return JsonResponse(
            {"detail": f"Missing required fields: {', '.join(missing)}"},
            status=400,
        )

    revision.status = FolkloreRevision.Status.PENDING
    revision.save(update_fields=["status"])

    return JsonResponse(
        {
            "revision_id": str(revision.id),
            "status": revision.status,
            "license_notice": (
                "If copyright_usage is empty at approval, default CC BY-NC 4.0 is applied."
            ),
        }
    )


@require_http_methods(["DELETE"])
def delete_folklore_revision_view(request, revision_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    try:
        revision = FolkloreRevision.objects.get(id=revision_id)
    except FolkloreRevision.DoesNotExist:
        return JsonResponse({"detail": "Folklore revision not found."}, status=404)

    if revision.contributor_id != request.user.id:
        return JsonResponse({"detail": "You can delete only your own revision."}, status=403)
    if revision.status != FolkloreRevision.Status.DRAFT:
        return JsonResponse({"detail": "Only DRAFT revisions can be deleted."}, status=400)

    revision.delete()
    return JsonResponse({"ok": True})


@require_GET
def folklore_entry_detail_view(request, entry_id):
    try:
        entry = (
            FolkloreEntry.objects.select_related("contributor", "contributor__profile")
            .filter(_live_contributor_q("contributor"))
            .get(
                id=entry_id,
                status__in=VISIBLE_PUBLIC_STATUSES,
            )
        )
    except FolkloreEntry.DoesNotExist as exc:
        raise Http404("Folklore entry not found.") from exc

    latest_approved_revision = _latest_approved_folklore_revision(entry)

    return JsonResponse(
        {
            "entry_id": str(entry.id),
            "title": entry.title,
            "content": entry.content,
            "category": entry.category,
            "subcategory": entry.subcategory,
            "municipality_source": entry.municipality_source,
            # Hide source details if contributor marked the content/media as self-owned.
            "source": "" if entry.self_knowledge else entry.source,
            "media_url": entry.media_url,
            "photo_upload_url": _media_url(request, entry.photo_upload),
            "audio_upload_url": _media_url(request, entry.audio_upload),
            "media_source": "" if entry.self_produced_media else entry.media_source,
            "copyright_usage": entry.copyright_usage,
            "contributor": _public_username(entry.contributor),
            "status": entry.status,
            "created_at": entry.created_at.isoformat(),
            "updated_at": entry.updated_at.isoformat(),
            "review_action": {
                "can_flag_for_rereview": bool(
                    latest_approved_revision
                    and entry.status == FolkloreEntry.Status.APPROVED
                    and _is_reviewer_or_admin(request.user)
                    and latest_approved_revision.contributor_id != request.user.id
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
        }
    )

import json

from django.core.exceptions import ValidationError
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from folklore.models import FolkloreEntry, FolkloreRevision


VISIBLE_PUBLIC_STATUSES = [
    FolkloreEntry.Status.APPROVED,
    FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
]


def _serialize_folklore_entry(entry: FolkloreEntry):
    return {
        "entry_id": str(entry.id),
        "title": entry.title,
        "category": entry.category,
        "municipality_source": entry.municipality_source,
        "status": entry.status,
        "contributor_username": entry.contributor.username,
        "photo_upload_url": entry.photo_upload.url if entry.photo_upload else "",
        "audio_upload_url": entry.audio_upload.url if entry.audio_upload else "",
        "created_at": entry.created_at.isoformat(),
    }


def _serialize_folklore_revision(revision: FolkloreRevision):
    proposed_data = revision.proposed_data or {}
    return {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "title": proposed_data.get("title", ""),
        "category": proposed_data.get("category", ""),
        "municipality_source": proposed_data.get("municipality_source", ""),
        "status": revision.status,
        "photo_upload_url": revision.photo_upload.url if revision.photo_upload else "",
        "audio_upload_url": revision.audio_upload.url if revision.audio_upload else "",
        "created_at": revision.created_at.isoformat(),
        "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
    }


def _require_authenticated(request):
    if request.user.is_authenticated:
        return None
    return JsonResponse({"detail": "Authentication required."}, status=401)


def _parse_json_body(request):
    try:
        return json.loads(request.body or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"detail": "Invalid JSON body."}, status=400)


def _parse_request_payload(request):
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
    editable_fields = [
        "title",
        "content",
        "category",
        "municipality_source",
        "source",
        "self_knowledge",
        "media_url",
        "media_source",
        "self_produced_media",
        "copyright_usage",
    ]
    result = {field: payload[field] for field in editable_fields if field in payload}
    for boolean_field in ("self_knowledge", "self_produced_media"):
        if boolean_field in result:
            result[boolean_field] = _as_bool(result[boolean_field], default=False)
    return result


def _submission_missing_fields(*, data, has_photo, has_audio):
    missing = []
    for field in ("title", "content", "category"):
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
    errors = []

    if "category" in data:
        valid_categories = set(FolkloreEntry.Category.values)
        if data["category"] not in valid_categories:
            errors.append("category")

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
        .select_related("contributor")
        .order_by("title")
    )
    return JsonResponse({"rows": [_serialize_folklore_entry(entry) for entry in entries]})


@require_http_methods(["GET"])
def my_folklore_entries_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    revisions = FolkloreRevision.objects.filter(contributor=request.user).order_by("-created_at")
    return JsonResponse({"rows": [_serialize_folklore_revision(revision) for revision in revisions]})


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


@require_http_methods(["PATCH"])
def update_folklore_draft_view(request, revision_id):
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

    payload = revision.proposed_data or {}
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


@require_GET
def folklore_entry_detail_view(request, entry_id):
    try:
        entry = FolkloreEntry.objects.select_related("contributor").get(
            id=entry_id,
            status__in=VISIBLE_PUBLIC_STATUSES,
        )
    except FolkloreEntry.DoesNotExist as exc:
        raise Http404("Folklore entry not found.") from exc

    return JsonResponse(
        {
            "entry_id": str(entry.id),
            "title": entry.title,
            "content": entry.content,
            "category": entry.category,
            "municipality_source": entry.municipality_source,
            # Hide source details if contributor marked the content/media as self-owned.
            "source": "" if entry.self_knowledge else entry.source,
            "media_url": entry.media_url,
            "photo_upload_url": entry.photo_upload.url if entry.photo_upload else "",
            "audio_upload_url": entry.audio_upload.url if entry.audio_upload else "",
            "media_source": "" if entry.self_produced_media else entry.media_source,
            "copyright_usage": entry.copyright_usage,
            "contributor": entry.contributor.username,
            "status": entry.status,
            "created_at": entry.created_at.isoformat(),
            "updated_at": entry.updated_at.isoformat(),
        }
    )

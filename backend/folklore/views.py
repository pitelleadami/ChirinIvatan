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
from django.utils.html import strip_tags
from django.views.decorators.http import require_GET, require_http_methods

from folklore.models import (
    FOLKLORE_SUBCATEGORIES_BY_CATEGORY,
    FolkloreComment,
    FolkloreEntry,
    FolkloreMediaAsset,
    FolkloreRevision,
    normalize_folklore_taxonomy,
)
from folklore.services import create_revision_from_entry, create_variant_from_entry
from reviews.models import FolkloreReview
from users.models import Notification
from users.names import display_name as formatted_display_name
from users.names import normalize_username
from users.notifications import notify

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
    return normalize_username(user.username)


def _public_display_name(user):
    if not user:
        return None
    profile = getattr(user, "profile", None)
    if profile and profile.show_live_contributions is False:
        return None
    return formatted_display_name(user, profile)


def _can_flag_live_entry(user):
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name__in=["Contributor", "Reviewer", "Consultant", "Admin"]).exists()


def _serialize_public_actor(user):
    username = _public_username(user)
    if not username:
        return None
    return {
        "username": username,
        "display_name": _public_display_name(user) or username,
    }


def _media_url(request, file_field):
    if not file_field:
        return ""
    return request.build_absolute_uri(file_field.url)


def _serialize_folklore_entry(entry: FolkloreEntry, request):
    # Public-list/detail serializer for live folklore entry rows.
    content_preview = " ".join(strip_tags(entry.content or "").split())
    return {
        "entry_id": str(entry.id),
        "title": entry.title,
        "preview": content_preview[:180],
        "category": entry.category,
        "subcategory": entry.subcategory,
        "municipality_source": entry.municipality_source,
        "status": entry.status,
        "contributor_username": _public_username(entry.contributor),
        "photo_upload_url": _media_url(request, entry.photo_upload),
        "audio_upload_url": _media_url(request, entry.audio_upload),
        "created_at": entry.created_at.isoformat(),
    }


def _is_entry_owner_or_admin(user, entry: FolkloreEntry) -> bool:
    if user.is_superuser:
        return True
    if user.groups.filter(name="Admin").exists():
        return True
    return entry.contributor_id == user.id


def _serialize_folklore_revision(revision: FolkloreRevision, request):
    # Contributor-facing serializer for draft/pending/approved revision rows.
    proposed_data = revision.proposed_data or {}
    correction = getattr(revision, "correction_assignment", None)
    return {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "revision_type": revision.revision_type,
        "variant_of_id": str(revision.variant_of_id) if revision.variant_of_id else None,
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
        "reviewer_notes": revision.reviewer_notes,
        "photo_upload_url": _media_url(request, revision.photo_upload),
        "audio_upload_url": _media_url(request, revision.audio_upload),
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


def _serialize_folklore_media_asset(asset: FolkloreMediaAsset, request):
    return {
        "media_id": str(asset.id),
        "image_url": _media_url(request, asset.image),
        "caption": asset.caption,
        "alt_text": asset.alt_text,
        "order": asset.order,
        "self_produced": asset.self_produced,
        "source": asset.source,
    }


def _is_reviewer_or_admin(user):
    if not user.is_authenticated:
        return False
    return user.is_superuser or user.groups.filter(name__in=["Admin", "Reviewer"]).exists()


def _published_variant_entries(entry: FolkloreEntry, request) -> list:
    # Find FolkloreEntries that were created from a variant revision of this entry.
    # Only the base-snapshot revision (first-published) is checked to avoid duplicates.
    variant_revisions = (
        FolkloreRevision.objects.filter(
            variant_of=entry,
            revision_type=FolkloreRevision.RevisionType.VARIANT,
            is_base_snapshot=True,
            entry__isnull=False,
            entry__status__in=VISIBLE_PUBLIC_STATUSES,
        )
        .select_related("entry", "entry__contributor", "entry__contributor__profile")
        .order_by("entry__created_at")
    )
    return [
        {
            "entry_id": str(rev.entry.id),
            "title": rev.entry.title,
            "contributor": _public_username(rev.entry.contributor),
            "created_at": rev.entry.created_at.isoformat(),
        }
        for rev in variant_revisions
    ]


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


def _approval_actors_for_revision(revision):
    if not revision:
        return []
    rows = (
        FolkloreReview.objects.filter(
            folklore_revision=revision,
            decision=FolkloreReview.Decision.APPROVE,
        )
        .select_related("reviewer", "reviewer__profile")
        .order_by("created_at")
    )
    actors = []
    seen = set()
    for row in rows:
        if row.reviewer_id in seen:
            continue
        seen.add(row.reviewer_id)
        actor = _serialize_public_actor(row.reviewer)
        if actor:
            actors.append(actor)
    return actors


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
        if "category" in data and data["subcategory"] not in FOLKLORE_SUBCATEGORIES_BY_CATEGORY.get(
            data["category"], set()
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
    return JsonResponse(
        {"rows": [_serialize_folklore_revision(revision, request) for revision in revisions]}
    )


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
    if not str(proposed_data.get("title", "")).strip():
        return JsonResponse(
            {"detail": "Title is required before saving a folklore draft."}, status=400
        )
    invalid_choices = _invalid_choice_errors(proposed_data)
    if invalid_choices:
        return JsonResponse(
            {"detail": f"Invalid choice values: {', '.join(invalid_choices)}"},
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


@require_http_methods(["POST"])
def start_folklore_entry_revision_view(request, entry_id):
    """
    Start a revision of an existing entry.

    Only the original contributor or an Admin/superuser may revise an entry.
    Other authenticated users must use the variant endpoint instead.
    """
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    try:
        entry = FolkloreEntry.objects.get(
            id=entry_id,
            status__in=VISIBLE_PUBLIC_STATUSES,
        )
    except FolkloreEntry.DoesNotExist:
        return JsonResponse({"detail": "Folklore entry not found."}, status=404)

    if not _is_entry_owner_or_admin(request.user, entry):
        return JsonResponse(
            {
                "detail": (
                    "Only the original contributor may revise this folklore entry. "
                    "Use the variant endpoint to submit an alternate version."
                )
            },
            status=403,
        )

    revision = create_revision_from_entry(entry=entry, contributor=request.user)
    return JsonResponse(_serialize_folklore_revision(revision, request), status=201)


@require_http_methods(["POST"])
def start_folklore_variant_view(request, entry_id):
    """
    Start a variant (alternate version) of an existing entry.

    Any authenticated user — including contributors who do not own the entry —
    may propose a variant. On approval, a new FolkloreEntry is created; the
    original entry is not modified.
    """
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    try:
        entry = FolkloreEntry.objects.get(
            id=entry_id,
            status__in=VISIBLE_PUBLIC_STATUSES,
        )
    except FolkloreEntry.DoesNotExist:
        return JsonResponse({"detail": "Folklore entry not found."}, status=404)

    revision = create_variant_from_entry(entry=entry, contributor=request.user)
    return JsonResponse(_serialize_folklore_revision(revision, request), status=201)


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
    if revision.status not in {FolkloreRevision.Status.DRAFT, FolkloreRevision.Status.REJECTED}:
        return JsonResponse(
            {"detail": "Only draft or rejected revisions are editable."}, status=400
        )

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
    if not str(next_payload.get("title", "")).strip():
        return JsonResponse(
            {"detail": "Title is required before saving a folklore draft."}, status=400
        )
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
def upload_folklore_revision_media_view(request, revision_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    try:
        revision = FolkloreRevision.objects.get(id=revision_id)
    except FolkloreRevision.DoesNotExist:
        return JsonResponse({"detail": "Folklore revision not found."}, status=404)

    if revision.contributor_id != request.user.id:
        return JsonResponse({"detail": "You can add images only to your own revision."}, status=403)
    if revision.status not in {FolkloreRevision.Status.DRAFT, FolkloreRevision.Status.REJECTED}:
        return JsonResponse(
            {"detail": "Only draft or rejected revisions can accept images."}, status=400
        )

    image = request.FILES.get("image")
    if not image:
        return JsonResponse({"detail": "Image file is required."}, status=400)
    content_type = (getattr(image, "content_type", "") or "").lower()
    if content_type and not content_type.startswith("image/"):
        return JsonResponse({"detail": "Upload must be an image."}, status=400)

    self_produced_value = str(request.POST.get("self_produced", "true")).strip().lower()
    self_produced = self_produced_value not in {"false", "0", "no"}
    source = (request.POST.get("source") or "").strip()
    if not self_produced and not source:
        return JsonResponse(
            {"detail": "Image source is required unless marked self-produced."}, status=400
        )

    asset = FolkloreMediaAsset(
        revision=revision,
        uploaded_by=request.user,
        image=image,
        caption=(request.POST.get("caption") or "").strip()[:240],
        alt_text=(request.POST.get("alt_text") or "").strip()[:180],
        order=revision.media_assets.count(),
        self_produced=self_produced,
        source=source,
    )
    try:
        asset.full_clean()
        asset.save()
    except ValidationError as exc:
        return JsonResponse({"detail": "; ".join(exc.messages)}, status=400)

    return JsonResponse(_serialize_folklore_media_asset(asset, request), status=201)


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
    if revision.status not in {FolkloreRevision.Status.DRAFT, FolkloreRevision.Status.REJECTED}:
        return JsonResponse(
            {"detail": "Only draft or rejected revisions can be submitted."}, status=400
        )

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
    correction = getattr(revision, "correction_assignment", None)
    if correction:
        correction.status = "submitted"
        correction.save(update_fields=["status"])

    return JsonResponse(
        {
            "revision_id": str(revision.id),
            "status": revision.status,
            "license_notice": (
                "Self-produced media defaults to CC BY-NC 4.0 when no license is provided."
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
    approved_by = _approval_actors_for_revision(latest_approved_revision)
    alternate_versions = _published_variant_entries(entry, request)

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
            "self_knowledge": entry.self_knowledge,
            "media_url": entry.media_url,
            "photo_upload_url": _media_url(request, entry.photo_upload),
            "audio_upload_url": _media_url(request, entry.audio_upload),
            "media_source": "" if entry.self_produced_media else entry.media_source,
            "self_produced_media": entry.self_produced_media,
            "copyright_usage": entry.copyright_usage,
            "contributor": _public_username(entry.contributor),
            "contributor_display_name": _public_display_name(entry.contributor),
            "approved_by": approved_by,
            "status": entry.status,
            "created_at": entry.created_at.isoformat(),
            "updated_at": entry.updated_at.isoformat(),
            "alternate_versions": alternate_versions,
            "review_action": {
                "can_flag_for_rereview": bool(
                    latest_approved_revision
                    and entry.status == FolkloreEntry.Status.APPROVED
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
        }
    )


def _serialize_comment(comment: FolkloreComment, *, request=None, current_user=None) -> dict:
    profile = getattr(comment.author, "profile", None)
    photo_url = ""
    if request and profile and profile.profile_photo:
        photo_url = request.build_absolute_uri(profile.profile_photo.url)
    return {
        "comment_id": str(comment.id),
        "author": _public_username(comment.author) or comment.author.username,
        "author_photo_url": photo_url,
        "body": comment.body,
        "created_at": comment.created_at.isoformat(),
        "is_own": bool(
            current_user and current_user.is_authenticated and comment.author_id == current_user.id
        ),
    }


@require_GET
def folklore_comments_list_view(request, entry_id):
    try:
        entry = FolkloreEntry.objects.get(id=entry_id, status__in=VISIBLE_PUBLIC_STATUSES)
    except FolkloreEntry.DoesNotExist:
        return JsonResponse({"detail": "Folklore entry not found."}, status=404)

    comments = (
        FolkloreComment.objects.filter(entry=entry)
        .select_related("author", "author__profile")
        .order_by("created_at")
    )
    return JsonResponse(
        {
            "entry_id": str(entry.id),
            "rows": [
                _serialize_comment(c, request=request, current_user=request.user) for c in comments
            ],
        }
    )


@require_http_methods(["POST"])
def folklore_comment_create_view(request, entry_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    try:
        entry = FolkloreEntry.objects.get(id=entry_id, status__in=VISIBLE_PUBLIC_STATUSES)
    except FolkloreEntry.DoesNotExist:
        return JsonResponse({"detail": "Folklore entry not found."}, status=404)

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    body = (payload.get("body") or "").strip()
    if not body:
        return JsonResponse({"detail": "Comment body must not be empty."}, status=400)
    if len(body) > FolkloreComment.BODY_MAX_LENGTH:
        return JsonResponse(
            {"detail": f"Comment must be {FolkloreComment.BODY_MAX_LENGTH} characters or fewer."},
            status=400,
        )

    comment = FolkloreComment.objects.create(entry=entry, author=request.user, body=body)
    if comment.author_id != entry.contributor_id:
        notify(
            user=entry.contributor,
            notif_type=Notification.Type.COMMENT_RECEIVED,
            message=f'{comment.author.username} commented on your entry "{entry.title}".',
            target_url=f"/folklore-view?entry_id={entry.id}",
        )
    comment.author = request.user  # ensure profile is accessible without extra query
    return JsonResponse(
        _serialize_comment(comment, request=request, current_user=request.user), status=201
    )


@require_http_methods(["DELETE"])
def folklore_comment_delete_view(request, comment_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    try:
        comment = FolkloreComment.objects.get(id=comment_id)
    except FolkloreComment.DoesNotExist:
        return JsonResponse({"detail": "Comment not found."}, status=404)

    is_admin = request.user.is_superuser or request.user.groups.filter(name__in=["Admin"]).exists()
    if comment.author_id != request.user.id and not is_admin:
        return JsonResponse({"detail": "You can only delete your own comments."}, status=403)

    comment.delete()
    return JsonResponse({"ok": True})

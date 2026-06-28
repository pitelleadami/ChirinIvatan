"""
reviews/views.py

API layer for review workflows.

Design intent:
- Keep heavy governance rules in services.py.
- Keep this file focused on request parsing, role checks, and response shaping.
"""

import json

from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from dictionary.models import Entry, EntryRevision, EntryStatus
from folklore.models import FolkloreEntry, FolkloreRevision
from reviews.models import FolkloreReview, Review, ReviewAdminOverride
from reviews.services import (
    admin_override_dictionary_entry,
    admin_override_folklore_entry,
    is_admin,
    is_reviewer,
    submit_folklore_review,
    submit_review,
)
from users.names import normalize_username


def _stored_media_url(request, stored_path):
    if not stored_path:
        return ""
    try:
        return request.build_absolute_uri(default_storage.url(stored_path))
    except Exception:
        return ""


def _file_media_url(request, file_field):
    if not file_field:
        return ""
    try:
        return request.build_absolute_uri(file_field.url)
    except Exception:
        return ""


def _dictionary_preview_payload(proposed_data, request):
    variants = []
    for item in proposed_data.get("variants", []) or []:
        if not isinstance(item, dict):
            continue
        audio_path = item.get("audio_pronunciation", "")
        variants.append(
            {
                **item,
                "audio_pronunciation_url": _stored_media_url(request, audio_path),
            }
        )
    audio_path = proposed_data.get("audio_pronunciation", "")
    photo_path = proposed_data.get("photo", "")
    return {
        "meaning": proposed_data.get("meaning", ""),
        "part_of_speech": proposed_data.get("part_of_speech", ""),
        "variant_type": proposed_data.get("variant_type", ""),
        "phonetic": proposed_data.get("phonetic", ""),
        "pronunciation": proposed_data.get("pronunciation_text", ""),
        "example_sentence": proposed_data.get("example_sentence", ""),
        "example_translation": proposed_data.get("example_translation", ""),
        "usage_notes": proposed_data.get("usage_notes", ""),
        "etymology": proposed_data.get("etymology", ""),
        "english_synonym": proposed_data.get("english_synonym", ""),
        "ivatan_synonym": proposed_data.get("ivatan_synonym", ""),
        "english_antonym": proposed_data.get("english_antonym", ""),
        "ivatan_antonym": proposed_data.get("ivatan_antonym", ""),
        "inflected_forms": proposed_data.get("inflected_forms", ""),
        "source": proposed_data.get("source_text", ""),
        "term_source_is_self_knowledge": proposed_data.get("term_source_is_self_knowledge", None),
        "audio_pronunciation": audio_path,
        "audio_pronunciation_url": _stored_media_url(request, audio_path),
        "audio_source": proposed_data.get("audio_source", ""),
        "audio_source_is_self_recorded": proposed_data.get("audio_source_is_self_recorded", None),
        "audio_license": proposed_data.get("audio_license", ""),
        "photo": photo_path,
        "photo_url": _stored_media_url(request, photo_path),
        "photo_source": proposed_data.get("photo_source", ""),
        "photo_source_is_contributor_owned": proposed_data.get(
            "photo_source_is_contributor_owned", None
        ),
        "photo_license": proposed_data.get("photo_license", ""),
        "variants": variants,
    }


def _folklore_preview_payload(revision, request):
    proposed_data = revision.proposed_data or {}
    return {
        "content": proposed_data.get("content", ""),
        "municipality_source": proposed_data.get("municipality_source", ""),
        "source": proposed_data.get("source", ""),
        "self_knowledge": proposed_data.get("self_knowledge", None),
        "media_url": proposed_data.get("media_url", ""),
        "media_source": proposed_data.get("media_source", ""),
        "self_produced_media": proposed_data.get("self_produced_media", None),
        "copyright_usage": proposed_data.get("copyright_usage", ""),
        "photo_upload_url": _file_media_url(request, revision.photo_upload),
        "audio_upload_url": _file_media_url(request, revision.audio_upload),
    }


def _contributor_display_name(user):
    from users.names import name_with_extension

    profile = getattr(user, "profile", None)
    base = name_with_extension(user, profile) or user.username
    post_nominals = str(getattr(profile, "post_nominals", "") or "").strip()
    if post_nominals:
        parts = [p.strip() for p in post_nominals.split(",") if p.strip()]
        trimmed = ", ".join(parts[-2:])
        return f"{base}, {trimmed}"
    return base


def _active_rereview_round(revision: EntryRevision):
    """
    Return the currently active re-review round for a revision.
    If no flag exists, there is no active re-review round.
    """
    latest_flag = (
        Review.objects.filter(revision=revision, decision=Review.Decision.FLAG)
        .order_by("-review_round", "-created_at")
        .first()
    )
    return latest_flag.review_round if latest_flag else None


def _active_folklore_rereview_round(revision: FolkloreRevision):
    latest_flag = (
        FolkloreReview.objects.filter(
            folklore_revision=revision,
            decision=FolkloreReview.Decision.FLAG,
        )
        .order_by("-review_round", "-created_at")
        .first()
    )
    return latest_flag.review_round if latest_flag else None


def _approval_sets_for_round(revision: EntryRevision, round_number: int):
    # Quorum depends on reviewer/admin composition, so we split sets by role.
    approvals = Review.objects.filter(
        revision=revision,
        review_round=round_number,
        decision=Review.Decision.APPROVE,
    )
    reviewer_ids = set()
    admin_ids = set()
    for row in approvals:
        if is_admin(row.reviewer):
            admin_ids.add(row.reviewer_id)
        elif is_reviewer(row.reviewer):
            reviewer_ids.add(row.reviewer_id)
    return reviewer_ids, admin_ids


def _folklore_approval_sets_for_round(
    revision: FolkloreRevision,
    round_number: int,
):
    approvals = FolkloreReview.objects.filter(
        folklore_revision=revision,
        review_round=round_number,
        decision=FolkloreReview.Decision.APPROVE,
    )
    reviewer_ids = set()
    admin_ids = set()
    for row in approvals:
        if is_admin(row.reviewer):
            admin_ids.add(row.reviewer_id)
        elif is_reviewer(row.reviewer):
            reviewer_ids.add(row.reviewer_id)
    return reviewer_ids, admin_ids


def _quorum_met(reviewer_ids, admin_ids):
    # Any two distinct qualified approvers satisfy quorum.
    return len(reviewer_ids) + len(admin_ids) >= 2


def _quorum_progress(reviewer_ids, admin_ids):
    reviewer_count = len(reviewer_ids)
    admin_count = len(admin_ids)
    requirement = "Needs 1 more reviewer/admin approval"
    return {
        "reviewer_approvals": reviewer_count,
        "admin_approvals": admin_count,
        "quorum_requirement": requirement,
    }


def _serialize_pending_revision(revision: EntryRevision, request=None):
    # Queue serializer for dictionary pending workflow.
    proposed_data = revision.proposed_data or {}
    proposed_term = proposed_data.get("term", "")
    payload = {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "term": proposed_term,
        "preview": _dictionary_preview_payload(proposed_data, request),
        "contributor_username": normalize_username(revision.contributor.username),
        "contributor_display_name": _contributor_display_name(revision.contributor),
        "created_at": revision.created_at.isoformat(),
        "status": revision.status,
    }
    if revision.entry_id:
        snapshots = list(
            revision.entry.revisions.filter(status=EntryRevision.Status.APPROVED)
            .select_related("contributor", "contributor__profile")
            .order_by("created_at")
        )
        payload["revision_log"] = [
            {
                "revision_id": str(item.id),
                "label": (
                    "Original approved entry" if item.is_base_snapshot else "Approved revision"
                ),
                "contributor_username": normalize_username(item.contributor.username),
                "created_at": item.created_at.isoformat(),
                "approved_at": item.approved_at.isoformat() if item.approved_at else None,
                "is_base_snapshot": item.is_base_snapshot,
                "snapshot": item.proposed_data or {},
            }
            for item in snapshots
        ]
        payload["contributor_options"] = sorted(
            {
                normalize_username(item.contributor.username)
                for item in snapshots
                if item.contributor_id
            }
        )
        latest_flag = (
            revision.reviews.filter(
                decision=Review.Decision.FLAG,
            )
            .order_by("-review_round", "-created_at")
            .first()
        )
        payload["flag_notes"] = latest_flag.notes if latest_flag else ""
    return payload


def _serialize_published_revision(revision: EntryRevision, request=None):
    # Queue serializer for approved dictionary revisions (flag candidates).
    proposed_data = revision.proposed_data or {}
    proposed_term = proposed_data.get("term", "")
    return {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "term": proposed_term,
        "preview": _dictionary_preview_payload(proposed_data, request),
        "contributor_username": normalize_username(revision.contributor.username),
        "contributor_display_name": _contributor_display_name(revision.contributor),
        "created_at": revision.created_at.isoformat(),
        "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
        "status": revision.status,
        "entry_status": revision.entry.status if revision.entry else None,
    }


def _serialize_pending_folklore(revision: FolkloreRevision, request=None):
    # Queue serializer for folklore pending workflow.
    proposed_data = revision.proposed_data or {}
    payload = {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "title": proposed_data.get("title", ""),
        "category": proposed_data.get("category", ""),
        "subcategory": proposed_data.get("subcategory", ""),
        "preview": _folklore_preview_payload(revision, request),
        "contributor_username": normalize_username(revision.contributor.username),
        "contributor_display_name": _contributor_display_name(revision.contributor),
        "created_at": revision.created_at.isoformat(),
        "status": revision.status,
    }
    if revision.entry_id:
        snapshots = list(
            revision.entry.revisions.filter(status=FolkloreRevision.Status.APPROVED)
            .select_related("contributor", "contributor__profile")
            .order_by("created_at")
        )
        payload["revision_log"] = [
            {
                "revision_id": str(item.id),
                "label": (
                    "Original approved entry" if item.is_base_snapshot else "Approved revision"
                ),
                "contributor_username": normalize_username(item.contributor.username),
                "created_at": item.created_at.isoformat(),
                "approved_at": item.approved_at.isoformat() if item.approved_at else None,
                "is_base_snapshot": item.is_base_snapshot,
                "snapshot": item.proposed_data or {},
            }
            for item in snapshots
        ]
        payload["contributor_options"] = sorted(
            {
                normalize_username(item.contributor.username)
                for item in snapshots
                if item.contributor_id
            }
        )
        latest_flag = (
            revision.reviews.filter(
                decision=FolkloreReview.Decision.FLAG,
            )
            .order_by("-review_round", "-created_at")
            .first()
        )
        payload["flag_notes"] = latest_flag.notes if latest_flag else ""
    return payload


def _serialize_published_folklore(revision: FolkloreRevision, request=None):
    # Queue serializer for approved folklore revisions (flag candidates).
    proposed_data = revision.proposed_data or {}
    return {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "title": proposed_data.get("title", ""),
        "category": proposed_data.get("category", ""),
        "subcategory": proposed_data.get("subcategory", ""),
        "preview": _folklore_preview_payload(revision, request),
        "contributor_username": normalize_username(revision.contributor.username),
        "contributor_display_name": _contributor_display_name(revision.contributor),
        "created_at": revision.created_at.isoformat(),
        "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
        "status": revision.status,
        "entry_status": revision.entry.status if revision.entry else None,
    }


def _serialize_review(review: Review):
    # Dashboard history serializer with interpreted final outcome.
    revision = review.revision
    entry = revision.entry if revision else None
    active_round = _active_rereview_round(revision) if revision else None

    # Simple "final outcome" interpretation for dashboard:
    # - initial round (0): follow revision status
    # - re-review rounds (>0): follow entry status, unless superseded by newer round
    if review.review_round == 0:
        final_outcome = revision.status if revision else "unknown"
    else:
        if active_round and review.review_round < active_round:
            final_outcome = "superseded_by_new_round"
        elif entry:
            final_outcome = entry.status
        else:
            final_outcome = "unknown"

    return {
        "review_id": str(review.id),
        "revision_id": str(review.revision_id) if review.revision_id else None,
        "entry_id": str(entry.id) if entry else None,
        "review_round": review.review_round,
        "decision": review.decision,
        "notes": review.notes,
        "created_at": review.created_at.isoformat(),
        "final_outcome": final_outcome,
    }


def _latest_approved_dictionary_revisions(*, user, request=None):
    """
    Return one approved revision per approved dictionary entry.
    Includes only entries currently in APPROVED state (flaggable).
    """
    revisions = (
        EntryRevision.objects.filter(
            status=EntryRevision.Status.APPROVED,
            entry__status=EntryStatus.APPROVED,
        )
        .select_related("contributor", "contributor__profile", "entry")
        .order_by("-approved_at", "-created_at")
    )

    latest_by_entry = {}
    for revision in revisions:
        if revision.entry_id and revision.entry_id not in latest_by_entry:
            latest_by_entry[revision.entry_id] = revision

    rows = []
    for revision in latest_by_entry.values():
        if revision.contributor_id == user.id:
            continue
        rows.append(_serialize_published_revision(revision, request=request))
    return rows


def _latest_approved_folklore_revisions(*, user, request=None):
    """
    Return one approved revision per approved folklore entry.
    Includes only entries currently in APPROVED state (flaggable).
    """
    revisions = (
        FolkloreRevision.objects.filter(
            status=FolkloreRevision.Status.APPROVED,
            entry__status=FolkloreEntry.Status.APPROVED,
        )
        .select_related("contributor", "contributor__profile", "entry")
        .order_by("-approved_at", "-created_at")
    )

    latest_by_entry = {}
    for revision in revisions:
        if revision.entry_id and revision.entry_id not in latest_by_entry:
            latest_by_entry[revision.entry_id] = revision

    rows = []
    for revision in latest_by_entry.values():
        if revision.contributor_id == user.id:
            continue
        rows.append(_serialize_published_folklore(revision, request=request))
    return rows


@require_GET
def reviewer_dashboard_view(request):
    """
    Main dashboard endpoint for reviewer/admin queues.

    Returned buckets:
    - dictionary pending submissions
    - dictionary pending re-review
    - dictionary published entries (flaggable)
    - folklore equivalents
    - user's own review history summary
    """
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)
    if not (is_reviewer(user) or is_admin(user)):
        return JsonResponse({"detail": "Reviewer or admin access required."}, status=403)

    # 1) Pending initial submissions (revision.status = pending)
    # Queue view excludes items the current reviewer/admin already reviewed in this round.
    pending_initial_qs = EntryRevision.objects.filter(
        status=EntryRevision.Status.PENDING,
    ).select_related("contributor", "contributor__profile", "entry")
    pending_initial_qs = pending_initial_qs.exclude(contributor=user)
    pending_initial_qs = (
        pending_initial_qs.exclude(
            reviews__reviewer=user,
            reviews__review_round=0,
        )
        .exclude(
            reviews__decision=Review.Decision.REJECT,
            reviews__review_round=0,
        )
        .order_by("-created_at")
    )

    pending_initial = [
        _serialize_pending_revision(rev, request=request) for rev in pending_initial_qs
    ]

    pending_folklore_qs = FolkloreRevision.objects.filter(
        status=FolkloreRevision.Status.PENDING
    ).select_related("contributor", "contributor__profile", "entry")
    pending_folklore_qs = pending_folklore_qs.exclude(contributor=user)
    pending_folklore_qs = (
        pending_folklore_qs.exclude(
            reviews__reviewer=user,
            reviews__review_round=0,
        )
        .exclude(
            reviews__decision=FolkloreReview.Decision.REJECT,
            reviews__review_round=0,
        )
        .order_by("-created_at")
    )
    pending_folklore = [
        _serialize_pending_folklore(revision, request=request) for revision in pending_folklore_qs
    ]

    # 2) Pending re-review queue:
    # entry is publicly visible but under review, and revision is approved.
    pending_rereview_qs = (
        EntryRevision.objects.filter(
            status=EntryRevision.Status.APPROVED,
            entry__status=EntryStatus.APPROVED_UNDER_REVIEW,
        )
        .select_related("contributor", "contributor__profile", "entry")
        .exclude(contributor=user)
        .order_by("-approved_at", "-created_at")
        .distinct()
    )
    pending_rereview = []
    for rev in pending_rereview_qs:
        current_round = _active_rereview_round(rev)
        if not current_round:
            continue
        if Review.objects.filter(
            revision=rev,
            reviewer=user,
            review_round=current_round,
        ).exists():
            continue
        item = _serialize_pending_revision(rev, request=request)
        item["review_round"] = current_round
        pending_rereview.append(item)

    pending_folklore_rereview_qs = FolkloreRevision.objects.filter(
        status=FolkloreRevision.Status.APPROVED,
        entry__status=FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
    ).select_related("contributor", "contributor__profile", "entry")
    pending_folklore_rereview_qs = pending_folklore_rereview_qs.exclude(contributor=user).order_by(
        "-approved_at", "-created_at"
    )
    pending_folklore_rereview = []
    for revision in pending_folklore_rereview_qs:
        current_round = (
            revision.reviews.filter(decision=FolkloreReview.Decision.FLAG)
            .order_by("-review_round", "-created_at")
            .values_list("review_round", flat=True)
            .first()
        )
        if not current_round:
            continue
        if revision.reviews.filter(
            reviewer=user,
            review_round=current_round,
        ).exists():
            continue
        item = _serialize_pending_folklore(revision, request=request)
        item["review_round"] = current_round
        pending_folklore_rereview.append(item)

    # 2b) Published approved entries eligible to be flagged.
    dictionary_published = _latest_approved_dictionary_revisions(
        user=user,
        request=request,
    )
    folklore_published = _latest_approved_folklore_revisions(
        user=user,
        request=request,
    )

    # 3) My reviews + outcomes
    my_reviews_qs = (
        Review.objects.filter(reviewer=user)
        .select_related(
            "revision",
            "revision__entry",
        )
        .order_by("-created_at")
    )
    my_reviews = [_serialize_review(r) for r in my_reviews_qs]

    # 4) Read-only status rows after this user approved but quorum is still open.
    awaiting_dictionary_quorum = []
    for review in my_reviews_qs.filter(decision=Review.Decision.APPROVE):
        rev = review.revision
        if not rev:
            continue

        if review.review_round == 0:
            if rev.status != EntryRevision.Status.PENDING:
                continue
            if Review.objects.filter(
                revision=rev,
                review_round=0,
                decision=Review.Decision.REJECT,
            ).exists():
                continue
            reviewer_ids, admin_ids = _approval_sets_for_round(rev, 0)
            item = _serialize_pending_revision(rev, request=request)
            item.update(
                {
                    "review_round": 0,
                    "context": "initial_review",
                    **_quorum_progress(reviewer_ids, admin_ids),
                }
            )
            awaiting_dictionary_quorum.append(item)
            continue

        active_round = _active_rereview_round(rev)
        if not active_round or review.review_round != active_round:
            continue
        if not rev.entry or rev.entry.status != EntryStatus.APPROVED_UNDER_REVIEW:
            continue
        if Review.objects.filter(
            revision=rev,
            review_round=active_round,
            decision=Review.Decision.REJECT,
        ).exists():
            continue

        reviewer_ids, admin_ids = _approval_sets_for_round(rev, active_round)
        if _quorum_met(reviewer_ids, admin_ids):
            continue

        item = _serialize_pending_revision(rev, request=request)
        item.update(
            {
                "review_round": active_round,
                "context": "rereview",
                **_quorum_progress(reviewer_ids, admin_ids),
            }
        )
        awaiting_dictionary_quorum.append(item)

    my_folklore_reviews_qs = (
        FolkloreReview.objects.filter(
            reviewer=user,
        )
        .select_related(
            "folklore_revision",
            "folklore_revision__entry",
            "folklore_revision__contributor",
        )
        .order_by("-created_at")
    )
    awaiting_folklore_quorum = []
    for review in my_folklore_reviews_qs.filter(
        decision=FolkloreReview.Decision.APPROVE,
    ):
        revision = review.folklore_revision

        if review.review_round == 0:
            if revision.status != FolkloreRevision.Status.PENDING:
                continue
            if FolkloreReview.objects.filter(
                folklore_revision=revision,
                review_round=0,
                decision=FolkloreReview.Decision.REJECT,
            ).exists():
                continue
            reviewer_ids, admin_ids = _folklore_approval_sets_for_round(
                revision,
                0,
            )
            item = _serialize_pending_folklore(revision, request=request)
            item.update(
                {
                    "review_round": 0,
                    "context": "initial_review",
                    **_quorum_progress(reviewer_ids, admin_ids),
                }
            )
            awaiting_folklore_quorum.append(item)
            continue

        active_round = _active_folklore_rereview_round(revision)
        if not active_round or review.review_round != active_round:
            continue
        if (
            not revision.entry
            or revision.entry.status != FolkloreEntry.Status.APPROVED_UNDER_REVIEW
        ):
            continue
        if FolkloreReview.objects.filter(
            folklore_revision=revision,
            review_round=active_round,
            decision=FolkloreReview.Decision.REJECT,
        ).exists():
            continue

        reviewer_ids, admin_ids = _folklore_approval_sets_for_round(
            revision,
            active_round,
        )
        if _quorum_met(reviewer_ids, admin_ids):
            continue

        item = _serialize_pending_folklore(revision, request=request)
        item.update(
            {
                "review_round": active_round,
                "context": "rereview",
                **_quorum_progress(reviewer_ids, admin_ids),
            }
        )
        awaiting_folklore_quorum.append(item)

    awaiting_quorum = [
        *({"kind": "dictionary", **item} for item in awaiting_dictionary_quorum),
        *({"kind": "folklore", **item} for item in awaiting_folklore_quorum),
    ]

    return JsonResponse(
        {
            "dictionary": {
                "pending_submissions": pending_initial,
                "pending_rereview": pending_rereview,
                "published_entries": dictionary_published,
                "awaiting_quorum_after_my_approval": awaiting_dictionary_quorum,
            },
            "folklore": {
                "pending_submissions": pending_folklore,
                "pending_rereview": pending_folklore_rereview,
                "published_entries": folklore_published,
                "awaiting_quorum_after_my_approval": awaiting_folklore_quorum,
            },
            "reviews": {
                "my_reviews": my_reviews,
                "awaiting_quorum_after_my_approval": awaiting_quorum,
            },
            # Backward-compatible keys kept for existing clients.
            "pending_submissions": pending_initial,
            "pending_folklore_submissions": pending_folklore,
            "pending_rereview": pending_rereview,
            "pending_folklore_rereview": pending_folklore_rereview,
            "published_entries": dictionary_published,
            "published_folklore_entries": folklore_published,
            "my_reviews": my_reviews,
            "awaiting_quorum_after_my_approval": awaiting_quorum,
        }
    )


def _serialize_archive_entry(entry, target_type):
    contributor = entry.initial_contributor if target_type == "dictionary" else entry.contributor
    return {
        "target_type": target_type,
        "target_id": str(entry.id),
        "title": entry.term if target_type == "dictionary" else entry.title,
        "status": entry.status,
        "contributor_username": contributor.username if contributor else "",
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "archived_at": entry.archived_at.isoformat() if entry.archived_at else None,
    }


@require_GET
def admin_archive_entries_view(request):
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)
    if not is_admin(user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    search = str(request.GET.get("q", "") or "").strip()
    dictionary_archived = Entry.objects.filter(status=EntryStatus.ARCHIVED).select_related(
        "initial_contributor"
    )
    folklore_archived = FolkloreEntry.objects.filter(
        status=FolkloreEntry.Status.ARCHIVED
    ).select_related("contributor")

    if search:
        dictionary_filter = Q(term__icontains=search) | Q(
            initial_contributor__username__icontains=search
        )
        folklore_filter = Q(title__icontains=search) | Q(contributor__username__icontains=search)
        dictionary_archived = dictionary_archived.filter(dictionary_filter)
        folklore_archived = folklore_archived.filter(folklore_filter)

    archived = [
        *[
            _serialize_archive_entry(row, "dictionary")
            for row in dictionary_archived.order_by("-archived_at")[:200]
        ],
        *[
            _serialize_archive_entry(row, "folklore")
            for row in folklore_archived.order_by("-archived_at")[:200]
        ],
    ]
    archived.sort(key=lambda row: row.get("archived_at") or "", reverse=True)

    return JsonResponse(
        {
            "archived": archived[:200],
            "counts": {
                "archived": len(archived[:200]),
            },
        }
    )


@require_POST
def admin_override_view(request):
    # High-authority endpoint: admin-only state override for disputed entries.
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)
    if not is_admin(user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON body."}, status=400)

    target_type = (payload.get("target_type") or "").strip()
    target_id = (payload.get("target_id") or "").strip()
    action = (payload.get("action") or "").strip()
    notes = (payload.get("notes") or "").strip()

    if not target_type or not target_id or not action:
        return JsonResponse(
            {"detail": "target_type, target_id, and action are required."},
            status=400,
        )

    # Explicitly list allowed actions for easier frontend integration.
    valid_actions = set(ReviewAdminOverride.Action.values)
    if action not in valid_actions:
        return JsonResponse(
            {"detail": f"Invalid action. Allowed: {sorted(valid_actions)}"},
            status=400,
        )

    try:
        if target_type == ReviewAdminOverride.TargetType.DICTIONARY:
            entry = Entry.objects.get(id=target_id)
            updated_entry, override = admin_override_dictionary_entry(
                entry=entry,
                admin_user=user,
                action=action,
                notes=notes,
            )
            return JsonResponse(
                {
                    "target_type": target_type,
                    "target_id": str(updated_entry.id),
                    "status": updated_entry.status,
                    "override_id": str(override.id),
                }
            )

        if target_type == ReviewAdminOverride.TargetType.FOLKLORE:
            entry = FolkloreEntry.objects.get(id=target_id)
            updated_entry, override = admin_override_folklore_entry(
                entry=entry,
                admin_user=user,
                action=action,
                notes=notes,
            )
            return JsonResponse(
                {
                    "target_type": target_type,
                    "target_id": str(updated_entry.id),
                    "status": updated_entry.status,
                    "override_id": str(override.id),
                }
            )

        return JsonResponse({"detail": "Unsupported target_type."}, status=400)
    except (Entry.DoesNotExist, FolkloreEntry.DoesNotExist):
        return JsonResponse({"detail": "Target entry not found."}, status=404)
    except ValidationError as exc:
        return JsonResponse({"detail": exc.messages[0]}, status=400)


@require_POST
def submit_folklore_review_view(request):
    # Accept approve/reject/flag decisions for folklore revision workflow.
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON body."}, status=400)

    revision_id = (payload.get("revision_id") or "").strip()
    entry_id = (payload.get("entry_id") or "").strip()
    decision = (payload.get("decision") or "").strip()
    notes = (payload.get("notes") or "").strip()
    assigned_to_username = (payload.get("assigned_to_username") or "").strip()
    source_revision_id = (payload.get("source_revision_id") or "").strip()

    if not decision or (not revision_id and not entry_id):
        return JsonResponse(
            {"detail": "decision and revision_id (or entry_id) are required."},
            status=400,
        )

    valid_decisions = set(FolkloreReview.Decision.values)
    if decision not in valid_decisions:
        return JsonResponse(
            {"detail": f"Invalid decision. Allowed: {sorted(valid_decisions)}"},
            status=400,
        )

    revision = None
    entry = None
    if revision_id:
        try:
            revision = FolkloreRevision.objects.select_related("entry").get(id=revision_id)
        except ValidationError:
            return JsonResponse({"detail": "Invalid revision_id UUID."}, status=400)
        except FolkloreRevision.DoesNotExist:
            return JsonResponse({"detail": "Folklore revision not found."}, status=404)
    elif entry_id:
        try:
            entry = FolkloreEntry.objects.get(id=entry_id)
        except ValidationError:
            return JsonResponse({"detail": "Invalid entry_id UUID."}, status=400)
        except FolkloreEntry.DoesNotExist:
            return JsonResponse({"detail": "Folklore entry not found."}, status=404)

    try:
        updated_revision = submit_folklore_review(
            revision=revision,
            entry=entry,
            reviewer=user,
            decision=decision,
            notes=notes,
            assigned_to_username=assigned_to_username,
            source_revision_id=source_revision_id,
        )
    except ValidationError as exc:
        return JsonResponse({"detail": exc.messages[0]}, status=400)

    updated_entry = updated_revision.entry if updated_revision else None
    return JsonResponse(
        {
            "revision_id": str(updated_revision.id),
            "revision_status": updated_revision.status,
            "entry_id": str(updated_entry.id) if updated_entry else None,
            "entry_status": updated_entry.status if updated_entry else None,
        }
    )


@require_POST
def submit_dictionary_review_view(request):
    # Accept approve/reject/flag decisions for dictionary revision workflow.
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "Invalid JSON body."}, status=400)

    revision_id = (payload.get("revision_id") or "").strip()
    decision = (payload.get("decision") or "").strip()
    notes = (payload.get("notes") or "").strip()
    assigned_to_username = (payload.get("assigned_to_username") or "").strip()
    source_revision_id = (payload.get("source_revision_id") or "").strip()

    if not revision_id or not decision:
        return JsonResponse(
            {"detail": "revision_id and decision are required."},
            status=400,
        )

    valid_decisions = set(Review.Decision.values)
    if decision not in valid_decisions:
        return JsonResponse(
            {"detail": f"Invalid decision. Allowed: {sorted(valid_decisions)}"},
            status=400,
        )

    try:
        revision = EntryRevision.objects.select_related("entry").get(id=revision_id)
    except ValidationError:
        return JsonResponse({"detail": "Invalid revision_id UUID."}, status=400)
    except EntryRevision.DoesNotExist:
        return JsonResponse({"detail": "Dictionary revision not found."}, status=404)

    try:
        updated_revision = submit_review(
            revision=revision,
            reviewer=user,
            decision=decision,
            notes=notes,
            assigned_to_username=assigned_to_username,
            source_revision_id=source_revision_id,
        )
    except ValidationError as exc:
        return JsonResponse({"detail": exc.messages[0]}, status=400)

    updated_entry = updated_revision.entry
    return JsonResponse(
        {
            "revision_id": str(updated_revision.id),
            "revision_status": updated_revision.status,
            "entry_id": str(updated_entry.id) if updated_entry else None,
            "entry_status": updated_entry.status if updated_entry else None,
        }
    )

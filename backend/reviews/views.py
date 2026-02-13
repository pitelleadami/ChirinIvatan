import json

from django.core.exceptions import ValidationError
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
    submit_review,
    submit_folklore_review,
)


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


def _approval_sets_for_round(revision: EntryRevision, round_number: int):
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


def _quorum_met(reviewer_ids, admin_ids):
    # SPEC quorum:
    # - 2 reviewers OR
    # - 1 reviewer + 1 admin
    return len(reviewer_ids) >= 2 or (
        len(reviewer_ids) >= 1 and len(admin_ids) >= 1
    )


def _serialize_pending_revision(revision: EntryRevision):
    proposed_term = (revision.proposed_data or {}).get("term", "")
    return {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "term": proposed_term,
        "contributor_username": revision.contributor.username,
        "created_at": revision.created_at.isoformat(),
        "status": revision.status,
    }


def _serialize_published_revision(revision: EntryRevision):
    proposed_term = (revision.proposed_data or {}).get("term", "")
    return {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "term": proposed_term,
        "contributor_username": revision.contributor.username,
        "created_at": revision.created_at.isoformat(),
        "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
        "status": revision.status,
        "entry_status": revision.entry.status if revision.entry else None,
    }


def _serialize_pending_folklore(revision: FolkloreRevision):
    proposed_data = revision.proposed_data or {}
    return {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "title": proposed_data.get("title", ""),
        "category": proposed_data.get("category", ""),
        "contributor_username": revision.contributor.username,
        "created_at": revision.created_at.isoformat(),
        "status": revision.status,
    }


def _serialize_published_folklore(revision: FolkloreRevision):
    proposed_data = revision.proposed_data or {}
    return {
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else None,
        "title": proposed_data.get("title", ""),
        "category": proposed_data.get("category", ""),
        "contributor_username": revision.contributor.username,
        "created_at": revision.created_at.isoformat(),
        "approved_at": revision.approved_at.isoformat() if revision.approved_at else None,
        "status": revision.status,
        "entry_status": revision.entry.status if revision.entry else None,
    }


def _serialize_review(review: Review):
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

def _latest_approved_dictionary_revisions(*, user):
    """
    Return one approved revision per approved dictionary entry.
    Includes only entries currently in APPROVED state (flaggable).
    """
    revisions = (
        EntryRevision.objects.filter(
            status=EntryRevision.Status.APPROVED,
            entry__status=EntryStatus.APPROVED,
        )
        .select_related("contributor", "entry")
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
        rows.append(_serialize_published_revision(revision))
    return rows


def _latest_approved_folklore_revisions(*, user):
    """
    Return one approved revision per approved folklore entry.
    Includes only entries currently in APPROVED state (flaggable).
    """
    revisions = (
        FolkloreRevision.objects.filter(
            status=FolkloreRevision.Status.APPROVED,
            entry__status=FolkloreEntry.Status.APPROVED,
        )
        .select_related("contributor", "entry")
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
        rows.append(_serialize_published_folklore(revision))
    return rows


@require_GET
def reviewer_dashboard_view(request):
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Authentication required."}, status=401)
    if not (is_reviewer(user) or is_admin(user)):
        return JsonResponse({"detail": "Reviewer or admin access required."}, status=403)

    # 1) Pending initial submissions (revision.status = pending)
    # Reviewer view excludes items they already reviewed.
    pending_initial_qs = EntryRevision.objects.filter(
        status=EntryRevision.Status.PENDING,
    ).select_related("contributor", "entry")
    if not is_admin(user):
        pending_initial_qs = pending_initial_qs.exclude(
            reviews__reviewer=user,
            reviews__review_round=0,
        )

    pending_initial = [_serialize_pending_revision(rev) for rev in pending_initial_qs]

    pending_folklore_qs = FolkloreRevision.objects.filter(
        status=FolkloreRevision.Status.PENDING
    ).select_related("contributor", "entry")
    if not is_admin(user):
        pending_folklore_qs = pending_folklore_qs.exclude(
            reviews__reviewer=user,
            reviews__review_round=0,
        )
    pending_folklore = [
        _serialize_pending_folklore(revision) for revision in pending_folklore_qs
    ]

    # 2) Pending re-review queue:
    # entry is publicly visible but under review, and revision is approved.
    pending_rereview_qs = (
        EntryRevision.objects.filter(
            status=EntryRevision.Status.APPROVED,
            entry__status=EntryStatus.APPROVED_UNDER_REVIEW,
        )
        .select_related("contributor", "entry")
        .distinct()
    )
    pending_rereview = []
    for rev in pending_rereview_qs:
        current_round = _active_rereview_round(rev)
        if not current_round:
            continue
        if (
            not is_admin(user)
            and Review.objects.filter(
                revision=rev,
                reviewer=user,
                review_round=current_round,
            ).exists()
        ):
            continue
        item = _serialize_pending_revision(rev)
        item["review_round"] = current_round
        pending_rereview.append(item)

    pending_folklore_rereview_qs = FolkloreRevision.objects.filter(
        status=FolkloreRevision.Status.APPROVED,
        entry__status=FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
    ).select_related("contributor", "entry")
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
        if (
            not is_admin(user)
            and revision.reviews.filter(
                reviewer=user,
                review_round=current_round,
            ).exists()
        ):
            continue
        item = _serialize_pending_folklore(revision)
        item["review_round"] = current_round
        pending_folklore_rereview.append(item)

    # 2b) Published approved entries eligible to be flagged.
    dictionary_published = _latest_approved_dictionary_revisions(user=user)
    folklore_published = _latest_approved_folklore_revisions(user=user)

    # 3) My reviews + outcomes
    my_reviews_qs = Review.objects.filter(reviewer=user).select_related(
        "revision",
        "revision__entry",
    ).order_by("-created_at")
    my_reviews = [_serialize_review(r) for r in my_reviews_qs]

    # 4) Awaiting quorum after my approval
    awaiting_quorum = []
    for review in my_reviews_qs.filter(decision=Review.Decision.APPROVE):
        rev = review.revision
        if not rev:
            continue

        if review.review_round == 0:
            # Initial workflow: still waiting if revision is still pending.
            if rev.status == EntryRevision.Status.PENDING:
                awaiting_quorum.append(
                    {
                        "revision_id": str(rev.id),
                        "entry_id": str(rev.entry_id) if rev.entry_id else None,
                        "review_round": 0,
                        "context": "initial_review",
                    }
                )
            continue

        # Re-review workflow:
        # waiting means this round is still active and quorum is not yet met.
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

        awaiting_quorum.append(
            {
                "revision_id": str(rev.id),
                "entry_id": str(rev.entry_id) if rev.entry_id else None,
                "review_round": active_round,
                "context": "rereview",
            }
        )

    return JsonResponse(
        {
            "dictionary": {
                "pending_submissions": pending_initial,
                "pending_rereview": pending_rereview,
                "published_entries": dictionary_published,
            },
            "folklore": {
                "pending_submissions": pending_folklore,
                "pending_rereview": pending_folklore_rereview,
                "published_entries": folklore_published,
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


@require_POST
def admin_override_view(request):
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

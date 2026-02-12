"""
reviews/services.py

Central governance logic for review decisions.

This file controls:
- Review submission
- Quorum enforcement
- Rejection handling
- Publishing logic
- Re-review logic
"""

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import FolkloreReview, Review, ReviewAdminOverride
from dictionary.models import EntryRevision, EntryStatus
from folklore.models import FolkloreEntry, FolkloreRevision
from dictionary.services import finalize_approved_revision, publish_revision
from dictionary.state_machine import validate_transition
from dictionary.variant_services import handle_mother_removed_or_archived
from folklore.services import (
    finalize_approved_revision as finalize_folklore_approved_revision,
    publish_revision as publish_folklore_revision,
    transition_folklore_status,
)
from users.contributions import award_dictionary_term, award_folklore_entry, award_revision

User = get_user_model()

REVIEWER_GROUP = "Reviewer"
ADMIN_GROUP = "Admin"


# ============================================================
# ROLE HELPERS
# ============================================================

def is_admin(user):
    """Return True if user is admin (superuser OR Admin group)."""
    return user.is_superuser or user.groups.filter(name=ADMIN_GROUP).exists()


def is_reviewer(user):
    """Return True if user belongs to Reviewer group."""
    return user.groups.filter(name=REVIEWER_GROUP).exists()


# ============================================================
# MAIN REVIEW LOGIC
# ============================================================

def _latest_flag_review(revision: EntryRevision):
    return (
        Review.objects.filter(revision=revision, decision=Review.Decision.FLAG)
        .order_by("-review_round", "-created_at")
        .first()
    )


def _latest_folklore_flag_review(revision: FolkloreRevision):
    return (
        FolkloreReview.objects.filter(
            folklore_revision=revision,
            decision=FolkloreReview.Decision.FLAG,
        )
        .order_by("-review_round", "-created_at")
        .first()
    )


def _require_admin_with_notes(*, admin_user, notes: str):
    if not is_admin(admin_user):
        raise ValidationError("Only admins can perform override actions.")
    if not notes.strip():
        raise ValidationError("Admin override requires notes.")


@transaction.atomic
def admin_override_dictionary_entry(*, entry, admin_user, action, notes=""):
    """
    Apply admin override to dictionary entry under re-review.

    Spec quote:
    "Admin override > Quorum decision > Single rejection."
    """

    _require_admin_with_notes(admin_user=admin_user, notes=notes)
    if entry.status != EntryStatus.APPROVED_UNDER_REVIEW:
        raise ValidationError("Dictionary entry must be under review for override.")

    before = entry.status

    if action == ReviewAdminOverride.Action.FORCE_REJECT:
        entry.status = EntryStatus.REJECTED
        entry.save(update_fields=["status"])
    elif action == ReviewAdminOverride.Action.RESTORE_APPROVED:
        entry.status = EntryStatus.APPROVED
        entry.save(update_fields=["status"])
    elif action == ReviewAdminOverride.Action.ARCHIVE:
        # Archive can be forced directly as an admin authority action.
        entry.status = EntryStatus.ARCHIVED
        entry.archived_at = timezone.now()
        entry.save(update_fields=["status", "archived_at"])
        handle_mother_removed_or_archived(entry=entry, removed=False)
    else:
        raise ValidationError("Unsupported admin override action.")

    override = ReviewAdminOverride.objects.create(
        admin=admin_user,
        target_type=ReviewAdminOverride.TargetType.DICTIONARY,
        dictionary_entry=entry,
        action=action,
        notes=notes,
        status_before=before,
        status_after=entry.status,
    )
    return entry, override


@transaction.atomic
def admin_override_folklore_entry(*, entry, admin_user, action, notes=""):
    """
    Apply admin override to folklore entry under re-review.
    """

    _require_admin_with_notes(admin_user=admin_user, notes=notes)
    if entry.status != FolkloreEntry.Status.APPROVED_UNDER_REVIEW:
        raise ValidationError("Folklore entry must be under review for override.")

    before = entry.status
    if action == ReviewAdminOverride.Action.FORCE_REJECT:
        entry.status = FolkloreEntry.Status.REJECTED
        entry.save(update_fields=["status"])
    elif action == ReviewAdminOverride.Action.RESTORE_APPROVED:
        entry.status = FolkloreEntry.Status.APPROVED
        entry.archived_at = None
        entry.save(update_fields=["status", "archived_at"])
    elif action == ReviewAdminOverride.Action.ARCHIVE:
        entry.status = FolkloreEntry.Status.ARCHIVED
        entry.archived_at = timezone.now()
        entry.save(update_fields=["status", "archived_at"])
    else:
        raise ValidationError("Unsupported admin override action.")

    override = ReviewAdminOverride.objects.create(
        admin=admin_user,
        target_type=ReviewAdminOverride.TargetType.FOLKLORE,
        folklore_entry=entry,
        action=action,
        notes=notes,
        status_before=before,
        status_after=entry.status,
    )
    return entry, override


@transaction.atomic
def submit_folklore_review(
    *,
    revision: FolkloreRevision = None,
    entry: FolkloreEntry = None,
    reviewer,
    decision,
    notes="",
):
    """
    Submit review for folklore entries.

    Mirrors dictionary review governance:
    - immediate rejection
    - quorum approval
    - explicit re-review rounds after a flag
    """

    if revision is None:
        if entry is None:
            raise ValidationError("Folklore review requires revision or entry.")

        # Backward compatibility: if caller only sends entry,
        # derive the latest target revision for the requested workflow.
        if decision == FolkloreReview.Decision.FLAG:
            revision = (
                FolkloreRevision.objects.filter(
                    entry=entry,
                    status=FolkloreRevision.Status.APPROVED,
                )
                .order_by("-approved_at", "-created_at")
                .first()
            )
        elif entry.status == FolkloreEntry.Status.APPROVED_UNDER_REVIEW:
            revision = (
                FolkloreRevision.objects.filter(
                    entry=entry,
                    status=FolkloreRevision.Status.APPROVED,
                )
                .order_by("-approved_at", "-created_at")
                .first()
            )
        else:
            revision = (
                FolkloreRevision.objects.filter(
                    entry=entry,
                    status=FolkloreRevision.Status.PENDING,
                )
                .order_by("-created_at")
                .first()
            )

        if not revision:
            # Compatibility path for legacy entries that were submitted
            # before folklore revision rows existed.
            if entry.status in {
                FolkloreEntry.Status.PENDING,
                FolkloreEntry.Status.APPROVED,
                FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
            }:
                fallback_status = (
                    FolkloreRevision.Status.APPROVED
                    if entry.status in {
                        FolkloreEntry.Status.APPROVED,
                        FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
                    }
                    else FolkloreRevision.Status.PENDING
                )
                revision = FolkloreRevision.objects.create(
                    entry=entry,
                    contributor=entry.contributor,
                    status=fallback_status,
                    proposed_data={
                        "title": entry.title,
                        "content": entry.content,
                        "category": entry.category,
                        "municipality_source": entry.municipality_source,
                        "source": entry.source,
                        "self_knowledge": entry.self_knowledge,
                        "media_url": entry.media_url,
                        "media_source": entry.media_source,
                        "self_produced_media": entry.self_produced_media,
                        "copyright_usage": entry.copyright_usage,
                    },
                    approved_at=timezone.now() if fallback_status == FolkloreRevision.Status.APPROVED else None,
                )
            else:
                raise ValidationError("No folklore revision found for this entry.")

    entry = revision.entry
    latest_flag = _latest_folklore_flag_review(revision)
    is_rereview = bool(
        entry
        and entry.status == FolkloreEntry.Status.APPROVED_UNDER_REVIEW
        and revision.status == FolkloreRevision.Status.APPROVED
    )

    if decision == FolkloreReview.Decision.FLAG:
        if revision.status != FolkloreRevision.Status.APPROVED:
            raise ValidationError("Only approved folklore revisions can be flagged.")
        if not entry or entry.status != FolkloreEntry.Status.APPROVED:
            raise ValidationError("Only approved folklore entries can be flagged.")
    elif not (
        revision.status == FolkloreRevision.Status.PENDING or is_rereview
    ):
        raise ValidationError("Only pending folklore revisions can be reviewed.")

    if not (is_reviewer(reviewer) or is_admin(reviewer)):
        raise ValidationError("Only reviewers or admins can submit reviews.")

    if revision.contributor_id == reviewer.id:
        raise ValidationError("You cannot review your own submission.")

    if decision == FolkloreReview.Decision.REJECT and not notes.strip():
        raise ValidationError("Rejection requires reviewer notes.")
    if decision == FolkloreReview.Decision.FLAG and not notes.strip():
        raise ValidationError("Flagging requires reviewer notes.")

    if decision == FolkloreReview.Decision.FLAG:
        max_round = (
            FolkloreReview.objects.filter(folklore_revision=revision)
            .aggregate(max_round=models.Max("review_round"))
            .get("max_round")
        )
        target_round = (max_round or 0) + 1
    elif is_rereview:
        target_round = latest_flag.review_round if latest_flag else 1
    else:
        target_round = 0

    if FolkloreReview.objects.filter(
        folklore_revision=revision,
        reviewer=reviewer,
        review_round=target_round,
    ).exists():
        raise ValidationError("You have already reviewed this folklore entry in this round.")

    FolkloreReview.objects.create(
        folklore_revision=revision,
        reviewer=reviewer,
        decision=decision,
        notes=notes,
        review_round=target_round,
    )

    if decision == FolkloreReview.Decision.FLAG:
        transition_folklore_status(
            entry=entry,
            to_status=FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
        )
        return revision

    if decision == FolkloreReview.Decision.REJECT:
        if is_rereview:
            transition_folklore_status(
                entry=entry,
                to_status=FolkloreEntry.Status.REJECTED,
            )
            return revision

        revision.status = FolkloreRevision.Status.REJECTED
        revision.save(update_fields=["status"])
        return revision

    approvals = FolkloreReview.objects.filter(
        folklore_revision=revision,
        decision=FolkloreReview.Decision.APPROVE,
    )
    if is_rereview and latest_flag:
        approvals = approvals.filter(review_round=latest_flag.review_round)
    elif not is_rereview:
        approvals = approvals.filter(review_round=0)

    reviewer_ids = set()
    admin_ids = set()
    for review in approvals:
        if is_admin(review.reviewer):
            admin_ids.add(review.reviewer_id)
        elif is_reviewer(review.reviewer):
            reviewer_ids.add(review.reviewer_id)

    quorum_met = len(reviewer_ids) >= 2 or (
        len(reviewer_ids) >= 1 and len(admin_ids) >= 1
    )
    if not quorum_met:
        return revision

    if is_rereview:
        transition_folklore_status(
            entry=entry,
            to_status=FolkloreEntry.Status.APPROVED,
        )
        return revision

    was_new_submission = revision.entry is None
    revision.status = FolkloreRevision.Status.APPROVED
    revision.approved_at = timezone.now()
    revision.save(update_fields=["status", "approved_at"])

    publish_folklore_revision(revision=revision)
    finalize_folklore_approved_revision(revision=revision)

    if was_new_submission:
        award_folklore_entry(
            user=revision.contributor,
            entry=revision.entry,
        )
    else:
        award_revision(
            user=revision.contributor,
            folklore_entry=revision.entry,
            folklore_revision=revision,
        )

    return revision


@transaction.atomic
def submit_review(*, revision: EntryRevision, reviewer, decision, notes=""):
    """
    Submit a review decision.

    Enforces:
    - Only PENDING revisions may be reviewed
    - No self-review
    - Rejection requires notes
    - First rejection immediately rejects
    - Approval quorum:
        * 2 reviewers OR
        * 1 reviewer + 1 admin
    - Publishing handled by publish_revision()
    - Re-review restores or rejects without republishing
    """

    entry = revision.entry  # May be None for new submissions
    latest_flag = _latest_flag_review(revision)
    is_rereview = bool(
        entry
        and entry.status == EntryStatus.APPROVED_UNDER_REVIEW
        and revision.status == EntryRevision.Status.APPROVED
    )

    # --------------------------------------------------------
    # 1. Validate reviewable state
    # --------------------------------------------------------

    if decision == Review.Decision.FLAG:
        if revision.status != EntryRevision.Status.APPROVED:
            raise ValidationError("Only approved revisions can be flagged.")
        if not entry or entry.status != EntryStatus.APPROVED:
            raise ValidationError("Only approved published entries can be flagged.")
    elif not (revision.status == EntryRevision.Status.PENDING or is_rereview):
        raise ValidationError("Only pending revisions can be reviewed.")

    # --------------------------------------------------------
    # 2. Reviewer role gate + prevent self-review
    # --------------------------------------------------------

    if not (is_reviewer(reviewer) or is_admin(reviewer)):
        raise ValidationError("Only reviewers or admins can submit reviews.")

    if revision.contributor_id == reviewer.id:
        raise ValidationError("You cannot review your own submission.")

    # --------------------------------------------------------
    # 3. Review content rules
    # --------------------------------------------------------

    if decision == Review.Decision.REJECT and not notes.strip():
        raise ValidationError("Rejection requires reviewer notes.")
    if decision == Review.Decision.FLAG and not notes.strip():
        raise ValidationError("Flagging requires reviewer notes.")

    if decision == Review.Decision.FLAG:
        max_round = (
            Review.objects.filter(revision=revision)
            .aggregate(max_round=models.Max("review_round"))
            .get("max_round")
        )
        target_round = (max_round or 0) + 1
    elif is_rereview:
        target_round = latest_flag.review_round if latest_flag else 1
    else:
        target_round = 0

    if Review.objects.filter(
        revision=revision,
        reviewer=reviewer,
        review_round=target_round,
    ).exists():
        raise ValidationError("You have already reviewed this revision in this round.")

    # --------------------------------------------------------
    # 4. Create review record
    # --------------------------------------------------------

    Review.objects.create(
        revision=revision,
        reviewer=reviewer,
        decision=decision,
        notes=notes,
        review_round=target_round,
    )

    # ========================================================
    # FLAG FOR RE-REVIEW
    # ========================================================

    if decision == Review.Decision.FLAG:
        validate_transition(
            entry.status,
            EntryStatus.APPROVED_UNDER_REVIEW,
            entity_name="DictionaryEntry",
        )
        entry.status = EntryStatus.APPROVED_UNDER_REVIEW
        entry.save(update_fields=["status"])
        return revision

    # ========================================================
    # IMMEDIATE REJECTION
    # ========================================================

    if decision == Review.Decision.REJECT:

        # Re-review rejection
        if is_rereview:
            validate_transition(
                entry.status,
                EntryStatus.REJECTED,
                entity_name="DictionaryEntry",
            )
            entry.status = EntryStatus.REJECTED
            entry.save(update_fields=["status"])
            return revision

        # Normal rejection
        revision.status = EntryRevision.Status.REJECTED
        revision.save(update_fields=["status"])
        return revision

    # ========================================================
    # QUORUM CHECK
    # ========================================================

    approvals = Review.objects.filter(
        revision=revision,
        decision=Review.Decision.APPROVE,
    )

    if is_rereview:
        if latest_flag:
            approvals = approvals.filter(review_round=latest_flag.review_round)

    reviewer_ids = set()
    admin_ids = set()

    for r in approvals:
        if is_admin(r.reviewer):
            admin_ids.add(r.reviewer_id)
        elif is_reviewer(r.reviewer):
            reviewer_ids.add(r.reviewer_id)

    quorum_met = (
        len(reviewer_ids) >= 2
        or (len(reviewer_ids) >= 1 and len(admin_ids) >= 1)
    )

    if not quorum_met:
        return revision

    # ========================================================
    # RE-REVIEW APPROVAL
    # ========================================================

    if is_rereview:
        validate_transition(
            entry.status,
            EntryStatus.APPROVED,
            entity_name="DictionaryEntry",
        )
        entry.status = EntryStatus.APPROVED
        entry.save(update_fields=["status"])
        return revision

    # ========================================================
    # NORMAL APPROVAL (FIRST PUBLISH OR UPDATE)
    # ========================================================

    was_new_submission = revision.entry is None
    revision.status = EntryRevision.Status.APPROVED
    revision.approved_at = timezone.now()
    revision.save(update_fields=["status", "approved_at"])

    approver_ids = reviewer_ids | admin_ids
    approvers = User.objects.filter(id__in=approver_ids)

    # Centralized publishing logic:
    # - Creates Entry if None
    # - Updates Entry if exists
    # - Sets Entry.status = APPROVED
    # - Updates metadata
    # - Updates contribution counts
    publish_revision(
        revision=revision,
        approvers=approvers,
    )
    finalize_approved_revision(revision=revision)

    # Contribution counters are historical and never decremented.
    # We only award at approval time.
    if was_new_submission and revision.entry and revision.entry.is_mother:
        award_dictionary_term(
            user=revision.contributor,
            entry=revision.entry,
            revision=revision,
        )
    elif revision.entry:
        award_revision(
            user=revision.contributor,
            entry=revision.entry,
            revision=revision,
        )

    return revision

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

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from dictionary.models import EntryRevision, EntryStatus
from dictionary.services import finalize_approved_revision, publish_revision
from dictionary.state_machine import validate_transition
from dictionary.variant_services import (
    handle_mother_removed_or_archived,
    recompute_mother_for_group,
)
from folklore.models import FolkloreEntry, FolkloreRevision
from folklore.services import (
    finalize_approved_revision as finalize_folklore_approved_revision,
)
from folklore.services import (
    publish_revision as publish_folklore_revision,
)
from folklore.services import (
    transition_folklore_status,
)
from users.contributions import award_dictionary_term, award_folklore_entry, award_revision
from users.models import Notification
from users.notifications import notify

from .models import CorrectionAssignment, FolkloreReview, Review, ReviewAdminOverride

User = get_user_model()

REVIEWER_GROUP = "Reviewer"
ADMIN_GROUP = "Admin"
FLAGGER_GROUPS = ("Contributor", "Reviewer", "Consultant", "Admin")


# ============================================================
# ROLE HELPERS
# ============================================================


def is_admin(user):
    """Return True if user is admin (superuser OR Admin group)."""
    return user.is_superuser or user.groups.filter(name=ADMIN_GROUP).exists()


def is_reviewer(user):
    """Return True for reviewer-level validation roles."""
    return user.groups.filter(name__in=[REVIEWER_GROUP, "Consultant"]).exists()


def can_flag_live_entry(user):
    return user.is_authenticated and (
        user.is_superuser or user.groups.filter(name__in=FLAGGER_GROUPS).exists()
    )


def _correction_assignee(username):
    user = User.objects.filter(username__iexact=str(username or "").strip(), is_active=True).first()
    if not user or not (
        user.is_superuser
        or user.groups.filter(
            name__in=["Contributor", REVIEWER_GROUP, "Consultant", ADMIN_GROUP]
        ).exists()
    ):
        raise ValidationError("Choose an active approved contributor.")
    return user


def _resolve_dictionary_correction(revision):
    assignment = getattr(revision, "correction_assignment", None)
    if assignment and assignment.status != CorrectionAssignment.Status.RESOLVED:
        assignment.status = CorrectionAssignment.Status.RESOLVED
        assignment.resolved_at = timezone.now()
        assignment.save(update_fields=["status", "resolved_at"])


def _resolve_folklore_correction(revision):
    assignment = getattr(revision, "correction_assignment", None)
    if assignment and assignment.status != CorrectionAssignment.Status.RESOLVED:
        assignment.status = CorrectionAssignment.Status.RESOLVED
        assignment.resolved_at = timezone.now()
        assignment.save(update_fields=["status", "resolved_at"])


def _return_dictionary_for_fixing(
    *, revision, reviewer, notes, assigned_to_username, source_revision_id
):
    entry = revision.entry
    source = EntryRevision.objects.filter(
        id=source_revision_id,
        entry=entry,
        status=EntryRevision.Status.APPROVED,
    ).first()
    if not source:
        raise ValidationError("Choose an approved dictionary snapshot to fix.")
    assignee = _correction_assignee(assigned_to_username)
    previous = (
        EntryRevision.objects.filter(
            entry=entry,
            status=EntryRevision.Status.APPROVED,
            created_at__lt=source.created_at,
        )
        .exclude(id=source.id)
        .order_by("-approved_at", "-created_at")
        .first()
    )
    scope = (
        CorrectionAssignment.Scope.ORIGINAL
        if source.is_base_snapshot or previous is None
        else CorrectionAssignment.Scope.REVISION
    )
    correction = EntryRevision.objects.create(
        entry=entry,
        contributor=assignee,
        proposed_data=dict(source.proposed_data or {}),
        status=EntryRevision.Status.DRAFT,
        reviewer_notes=notes,
    )
    assignment = CorrectionAssignment.objects.create(
        target_type=CorrectionAssignment.TargetType.DICTIONARY,
        scope=scope,
        assigned_to=assignee,
        returned_by=reviewer,
        notes=notes,
        source_snapshot=dict(source.proposed_data or {}),
        dictionary_source_revision=source,
        dictionary_correction_revision=correction,
    )

    if scope == CorrectionAssignment.Scope.ORIGINAL:
        entry.status = EntryStatus.REJECTED
        entry.save(update_fields=["status"])
    else:
        if previous:
            publish_revision(
                revision=previous,
                approvers=entry.last_approved_by.all(),
            )
        else:
            entry.status = EntryStatus.REJECTED
            entry.save(update_fields=["status"])
    return assignment


def _return_folklore_for_fixing(
    *, revision, reviewer, notes, assigned_to_username, source_revision_id
):
    entry = revision.entry
    source = FolkloreRevision.objects.filter(
        id=source_revision_id,
        entry=entry,
        status=FolkloreRevision.Status.APPROVED,
    ).first()
    if not source:
        raise ValidationError("Choose an approved folklore snapshot to fix.")
    assignee = _correction_assignee(assigned_to_username)
    previous = (
        FolkloreRevision.objects.filter(
            entry=entry,
            status=FolkloreRevision.Status.APPROVED,
            created_at__lt=source.created_at,
        )
        .exclude(id=source.id)
        .order_by("-approved_at", "-created_at")
        .first()
    )
    scope = (
        CorrectionAssignment.Scope.ORIGINAL
        if source.is_base_snapshot or previous is None
        else CorrectionAssignment.Scope.REVISION
    )
    correction = FolkloreRevision.objects.create(
        entry=entry,
        contributor=assignee,
        proposed_data=dict(source.proposed_data or {}),
        photo_upload=source.photo_upload,
        audio_upload=source.audio_upload,
        status=FolkloreRevision.Status.DRAFT,
        reviewer_notes=notes,
    )
    assignment = CorrectionAssignment.objects.create(
        target_type=CorrectionAssignment.TargetType.FOLKLORE,
        scope=scope,
        assigned_to=assignee,
        returned_by=reviewer,
        notes=notes,
        source_snapshot=dict(source.proposed_data or {}),
        folklore_source_revision=source,
        folklore_correction_revision=correction,
    )

    if scope == CorrectionAssignment.Scope.ORIGINAL:
        transition_folklore_status(entry=entry, to_status=FolkloreEntry.Status.REJECTED)
    else:
        if previous:
            publish_folklore_revision(revision=previous)
        else:
            transition_folklore_status(entry=entry, to_status=FolkloreEntry.Status.REJECTED)
    return assignment


# ============================================================
# MAIN REVIEW LOGIC
# ============================================================


def _latest_flag_review(revision: EntryRevision):
    # Re-review decisions are scoped to the latest flag round.
    return (
        Review.objects.filter(revision=revision, decision=Review.Decision.FLAG)
        .order_by("-review_round", "-created_at")
        .first()
    )


def _latest_folklore_flag_review(revision: FolkloreRevision):
    # Folklore equivalent of the dictionary flag lookup.
    return (
        FolkloreReview.objects.filter(
            folklore_revision=revision,
            decision=FolkloreReview.Decision.FLAG,
        )
        .order_by("-review_round", "-created_at")
        .first()
    )


def _dictionary_revision_title(revision):
    if revision.entry_id and revision.entry:
        return revision.entry.term
    return str((revision.proposed_data or {}).get("term") or "your entry")


def _folklore_revision_title(revision):
    if revision.entry_id and revision.entry:
        return revision.entry.title
    return str((revision.proposed_data or {}).get("title") or "your entry")


def _require_admin_with_notes(*, admin_user, notes: str):
    # Admin overrides are high-impact actions, so notes are mandatory for auditability.
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
    before = entry.status

    if action == ReviewAdminOverride.Action.FORCE_REJECT:
        if entry.status != EntryStatus.APPROVED_UNDER_REVIEW:
            raise ValidationError("Dictionary entry must be under review to force reject.")
        entry.status = EntryStatus.REJECTED
        entry.save(update_fields=["status"])
    elif action == ReviewAdminOverride.Action.RESTORE_APPROVED:
        if entry.status not in {EntryStatus.APPROVED_UNDER_REVIEW, EntryStatus.ARCHIVED}:
            raise ValidationError(
                "Only an archived or under-review dictionary entry can be restored."
            )
        entry.status = EntryStatus.APPROVED
        entry.archived_at = None
        entry.save(update_fields=["status", "archived_at"])
        if entry.variant_group_id:
            recompute_mother_for_group(group=entry.variant_group)
    elif action == ReviewAdminOverride.Action.ARCHIVE:
        if entry.status not in {
            EntryStatus.APPROVED,
            EntryStatus.APPROVED_UNDER_REVIEW,
            EntryStatus.REJECTED,
        }:
            raise ValidationError(
                "This dictionary entry cannot be archived from its current status."
            )
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
    before = entry.status
    if action == ReviewAdminOverride.Action.FORCE_REJECT:
        if entry.status != FolkloreEntry.Status.APPROVED_UNDER_REVIEW:
            raise ValidationError("Folklore entry must be under review to force reject.")
        entry.status = FolkloreEntry.Status.REJECTED
        entry.save(update_fields=["status"])
    elif action == ReviewAdminOverride.Action.RESTORE_APPROVED:
        if entry.status not in {
            FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
            FolkloreEntry.Status.ARCHIVED,
        }:
            raise ValidationError(
                "Only an archived or under-review folklore entry can be restored."
            )
        entry.status = FolkloreEntry.Status.APPROVED
        entry.archived_at = None
        entry.save(update_fields=["status", "archived_at"])
    elif action == ReviewAdminOverride.Action.ARCHIVE:
        if entry.status not in {
            FolkloreEntry.Status.APPROVED,
            FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
            FolkloreEntry.Status.REJECTED,
        }:
            raise ValidationError("This folklore entry cannot be archived from its current status.")
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
    assigned_to_username="",
    source_revision_id="",
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
                    if entry.status
                    in {
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
                        "subcategory": entry.subcategory,
                        "municipality_source": entry.municipality_source,
                        "source": entry.source,
                        "self_knowledge": entry.self_knowledge,
                        "media_url": entry.media_url,
                        "media_source": entry.media_source,
                        "self_produced_media": entry.self_produced_media,
                        "copyright_usage": entry.copyright_usage,
                    },
                    approved_at=(
                        timezone.now()
                        if fallback_status == FolkloreRevision.Status.APPROVED
                        else None
                    ),
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

    # Phase 1: validate state and role access.
    if decision == FolkloreReview.Decision.FLAG:
        if revision.status != FolkloreRevision.Status.APPROVED:
            raise ValidationError("Only approved folklore revisions can be flagged.")
        if not entry or entry.status != FolkloreEntry.Status.APPROVED:
            raise ValidationError("Only approved folklore entries can be flagged.")
    elif not (revision.status == FolkloreRevision.Status.PENDING or is_rereview):
        raise ValidationError("Only pending folklore revisions can be reviewed.")

    if decision == Review.Decision.FLAG:
        if not can_flag_live_entry(reviewer):
            raise ValidationError("Only approved platform members can flag entries.")
    else:
        if not (is_reviewer(reviewer) or is_admin(reviewer)):
            raise ValidationError("Only reviewers or admins can submit reviews.")
        if revision.contributor_id == reviewer.id:
            raise ValidationError("You cannot review your own submission.")

    if (
        decision in [FolkloreReview.Decision.REJECT, FolkloreReview.Decision.RETURN]
        and not notes.strip()
    ):
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

    # Phase 2: persist this review action for the current review round.
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

    if decision == FolkloreReview.Decision.RETURN:
        if not is_rereview:
            raise ValidationError("Only flagged entries can be returned for fixing.")
        _return_folklore_for_fixing(
            revision=revision,
            reviewer=reviewer,
            notes=notes,
            assigned_to_username=assigned_to_username,
            source_revision_id=source_revision_id,
        )
        return revision

    if decision == FolkloreReview.Decision.REJECT:
        if is_rereview:
            title = _folklore_revision_title(revision)
            transition_folklore_status(entry=entry, to_status=FolkloreEntry.Status.ARCHIVED)
            notes_fragment = f" Reviewer note: {notes}" if notes else ""
            notify(
                user=revision.contributor,
                notif_type=Notification.Type.REVISION_REJECTED,
                message=f'Your published entry "{title}" was rejected after re-review and removed from the public archive.{notes_fragment}',
                target_url="/admin-applications?tab=contributions",
            )
            return revision

        title = _folklore_revision_title(revision)
        revision.status = FolkloreRevision.Status.REJECTED
        revision.reviewer_notes = notes
        revision.save(update_fields=["status", "reviewer_notes"])
        notes_fragment = (
            f" Reviewer note: {revision.reviewer_notes}" if revision.reviewer_notes else ""
        )
        notify(
            user=revision.contributor,
            notif_type=Notification.Type.REVISION_REJECTED,
            message=f'Your submission "{title}" was not approved.{notes_fragment}',
            target_url=f"/folklore-draft?revision_id={revision.id}",
        )
        return revision

    # Phase 3: compute quorum using unique reviewer/admin actors.
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

    quorum_met = len(reviewer_ids) + len(admin_ids) >= 2
    if not quorum_met:
        return revision

    if is_rereview:
        transition_folklore_status(
            entry=entry,
            to_status=FolkloreEntry.Status.APPROVED,
        )
        notify(
            user=revision.contributor,
            notif_type=Notification.Type.REVISION_APPROVED,
            message=f'Your entry "{entry.title}" completed re-review and remains approved.',
            target_url=f"/folklore-view?entry_id={entry.id}",
        )
        return revision

    was_new_submission = revision.entry is None
    revision.status = FolkloreRevision.Status.APPROVED
    revision.approved_at = timezone.now()
    revision.save(update_fields=["status", "approved_at"])

    publish_folklore_revision(revision=revision)
    finalize_folklore_approved_revision(revision=revision)
    _resolve_folklore_correction(revision)
    notify(
        user=revision.contributor,
        notif_type=Notification.Type.REVISION_APPROVED,
        message=f'Your entry "{revision.entry.title}" has been approved and is now live.',
        target_url=f"/folklore-view?entry_id={revision.entry.id}",
    )

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
def submit_review(
    *,
    revision: EntryRevision,
    reviewer,
    decision,
    notes="",
    assigned_to_username="",
    source_revision_id="",
):
    """
    Submit a review decision.

    Enforces:
    - Only PENDING revisions may be reviewed
    - No self-review
    - Rejection requires notes
    - First rejection immediately rejects
    - Approval quorum: any two distinct reviewer/admin approvers
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

    if decision == FolkloreReview.Decision.FLAG:
        if not can_flag_live_entry(reviewer):
            raise ValidationError("Only approved platform members can flag entries.")
    else:
        if not (is_reviewer(reviewer) or is_admin(reviewer)):
            raise ValidationError("Only reviewers or admins can submit reviews.")
        if revision.contributor_id == reviewer.id:
            raise ValidationError("You cannot review your own submission.")

    # --------------------------------------------------------
    # 3. Review content rules
    # --------------------------------------------------------

    if decision in [Review.Decision.REJECT, Review.Decision.RETURN] and not notes.strip():
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

    if decision == Review.Decision.RETURN:
        if not is_rereview:
            raise ValidationError("Only flagged entries can be returned for fixing.")
        _return_dictionary_for_fixing(
            revision=revision,
            reviewer=reviewer,
            notes=notes,
            assigned_to_username=assigned_to_username,
            source_revision_id=source_revision_id,
        )
        return revision

    # ========================================================
    # IMMEDIATE REJECTION
    # ========================================================

    if decision == Review.Decision.REJECT:

        # Re-review rejection
        if is_rereview:
            title = _dictionary_revision_title(revision)
            entry.archive()
            notes_fragment = f" Reviewer note: {notes}" if notes else ""
            notify(
                user=revision.contributor,
                notif_type=Notification.Type.REVISION_REJECTED,
                message=f'Your published entry "{title}" was rejected after re-review and removed from the public archive.{notes_fragment}',
                target_url="/admin-applications?tab=contributions",
            )
            return revision

        # Normal rejection
        title = _dictionary_revision_title(revision)
        revision.status = EntryRevision.Status.REJECTED
        revision.reviewer_notes = notes
        revision.save(update_fields=["status", "reviewer_notes"])
        notes_fragment = (
            f" Reviewer note: {revision.reviewer_notes}" if revision.reviewer_notes else ""
        )
        notify(
            user=revision.contributor,
            notif_type=Notification.Type.REVISION_REJECTED,
            message=f'Your submission "{title}" was not approved.{notes_fragment}',
            target_url=f"/dictionary-draft?revision_id={revision.id}",
        )
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

    quorum_met = len(reviewer_ids) + len(admin_ids) >= 2

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
        notify(
            user=revision.contributor,
            notif_type=Notification.Type.REVISION_APPROVED,
            message=f'Your entry "{entry.term}" completed re-review and remains approved.',
            target_url=f"/dictionary-view?entry_id={entry.id}",
        )
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
    _resolve_dictionary_correction(revision)
    notify(
        user=revision.contributor,
        notif_type=Notification.Type.REVISION_APPROVED,
        message=f'Your entry "{revision.entry.term}" has been approved and is now live.',
        target_url=f"/dictionary-view?entry_id={revision.entry.id}",
    )

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

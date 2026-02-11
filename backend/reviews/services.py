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
from django.db import transaction
from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import Review
from dictionary.models import EntryRevision, EntryStatus
from dictionary.services import publish_revision

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

    # --------------------------------------------------------
    # 1. Only pending revisions may be reviewed
    # --------------------------------------------------------

    if revision.status != EntryRevision.Status.PENDING:
        raise ValidationError("Only pending revisions can be reviewed.")

    # --------------------------------------------------------
    # 2. Prevent self-review
    # --------------------------------------------------------

    if revision.contributor_id == reviewer.id:
        raise ValidationError("You cannot review your own submission.")

    # --------------------------------------------------------
    # 3. Rejection must include notes
    # --------------------------------------------------------

    if decision == Review.Decision.REJECT and not notes.strip():
        raise ValidationError("Rejection requires reviewer notes.")

    # --------------------------------------------------------
    # 4. Create review record
    # --------------------------------------------------------

    Review.objects.create(
        revision=revision,
        reviewer=reviewer,
        decision=decision,
        notes=notes,
    )

    # ========================================================
    # IMMEDIATE REJECTION
    # ========================================================

    if decision == Review.Decision.REJECT:

        # Re-review rejection (entry exists)
        if entry and entry.status == EntryStatus.APPROVED_UNDER_REVIEW:
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

    if entry and entry.status == EntryStatus.APPROVED_UNDER_REVIEW:
        entry.status = EntryStatus.APPROVED
        entry.save(update_fields=["status"])
        return revision

    # ========================================================
    # NORMAL APPROVAL (FIRST PUBLISH OR UPDATE)
    # ========================================================

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

    return revision

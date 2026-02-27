"""
users/role_onboarding.py

Role onboarding domain service.

Handles:
- application creation
- screening decisions and quorum checks
- direct invitation path
- accountability-label formatting for profile display
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from users.models import RoleApplication, RoleApplicationDecision, RoleOnboardingRecord


User = get_user_model()
REVIEWER_GROUP = "Reviewer"
ADMIN_GROUP = "Admin"


# Role onboarding service:
# - Handles applications, screening decisions, and direct invites.
# - Keeps approval quorum rules in backend so frontend cannot bypass them.
def is_admin(user):
    return user.is_superuser or user.groups.filter(name=ADMIN_GROUP).exists()


def is_reviewer(user):
    return user.groups.filter(name=REVIEWER_GROUP).exists()


def can_screen_roles(user):
    return is_admin(user) or is_reviewer(user)


def _role_of_decider(user):
    if is_admin(user):
        return "admin"
    if is_reviewer(user):
        return "reviewer"
    return "none"


def _ensure_reviewer_group():
    group, _ = Group.objects.get_or_create(name=REVIEWER_GROUP)
    return group


def _activate_role(*, user, role):
    # Contributor is baseline access.
    # Reviewer requires explicit group membership.
    # Troubleshooting: if reviewer permissions fail, verify Reviewer group membership.
    if role == RoleApplication.TargetRole.REVIEWER:
        reviewer_group = _ensure_reviewer_group()
        user.groups.add(reviewer_group)


@transaction.atomic
def create_role_application(*, applicant, target_role):
    if target_role not in set(RoleApplication.TargetRole.values):
        raise ValidationError("Invalid target role.")

    return RoleApplication.objects.create(
        applicant=applicant,
        target_role=target_role,
        status=RoleApplication.Status.PENDING,
    )


def _build_approval_set(application):
    # Build unique approver sets by effective role at decision time.
    approvals = application.decisions.filter(decision=RoleApplicationDecision.Decision.APPROVE).select_related(
        "decided_by"
    )

    reviewer_user_ids = set()
    admin_user_ids = set()

    for item in approvals:
        actor = item.decided_by
        if is_admin(actor):
            admin_user_ids.add(actor.id)
        elif is_reviewer(actor):
            reviewer_user_ids.add(actor.id)

    return reviewer_user_ids, admin_user_ids


def _has_quorum_for_target_role(*, application):
    # Quorum rules are locked by governance spec.
    reviewer_ids, admin_ids = _build_approval_set(application)

    if application.target_role == RoleApplication.TargetRole.CONTRIBUTOR:
        # Locked rule: contributor activation requires at least one reviewer OR one admin.
        return bool(reviewer_ids or admin_ids)

    # Locked rule update:
    # reviewer activation requires (1 reviewer + 1 admin) OR (2 reviewers).
    return (len(reviewer_ids) >= 1 and len(admin_ids) >= 1) or (len(reviewer_ids) >= 2)


def _create_onboarding_record_for_approved_application(*, application, accountability_notes=""):
    # Public accountability depends on this record:
    # profiles can show exactly who approved someone into a role.
    reviewer_ids, admin_ids = _build_approval_set(application)

    record = RoleOnboardingRecord.objects.create(
        user=application.applicant,
        role=application.target_role,
        method=RoleOnboardingRecord.Method.APPROVED_APPLICATION,
        source_application=application,
        accountability_notes=accountability_notes,
    )
    if reviewer_ids:
        record.approved_by_reviewers.add(*User.objects.filter(id__in=reviewer_ids))
    if admin_ids:
        record.approved_by_admins.add(*User.objects.filter(id__in=admin_ids))
    return record


@transaction.atomic
def decide_role_application(*, application, decided_by, decision, notes=""):
    # Decision workflow:
    # - reject is immediate
    # - approve waits until quorum
    # - self-decision and duplicate decisions are blocked
    if not can_screen_roles(decided_by):
        raise ValidationError("Only reviewer/admin can decide role applications.")
    if application.status != RoleApplication.Status.PENDING:
        raise ValidationError("Application is no longer pending.")
    if application.applicant_id == decided_by.id:
        raise ValidationError("Self-decision is not allowed.")
    if decision not in set(RoleApplicationDecision.Decision.values):
        raise ValidationError("Invalid decision.")

    actor_role = _role_of_decider(decided_by)
    if actor_role == "none":
        raise ValidationError("Only reviewer/admin can decide role applications.")

    if RoleApplicationDecision.objects.filter(application=application, decided_by=decided_by).exists():
        raise ValidationError("You already decided this application.")

    row = RoleApplicationDecision.objects.create(
        application=application,
        decided_by=decided_by,
        decision=decision,
        notes=notes or "",
    )

    if decision == RoleApplicationDecision.Decision.REJECT:
        application.status = RoleApplication.Status.REJECTED
        application.decided_at = timezone.now()
        application.save(update_fields=["status", "decided_at", "updated_at"])
        return row, None

    if _has_quorum_for_target_role(application=application):
        application.status = RoleApplication.Status.APPROVED
        application.decided_at = timezone.now()
        application.save(update_fields=["status", "decided_at", "updated_at"])

        _activate_role(user=application.applicant, role=application.target_role)
        record = _create_onboarding_record_for_approved_application(
            application=application,
            accountability_notes=notes or "",
        )
        return row, record

    return row, None


@transaction.atomic
def invite_user_to_role(*, inviter, invitee, role, notes=""):
    # Invitation path bypasses application quorum by design.
    # Accountability is preserved through RoleOnboardingRecord.
    if not can_screen_roles(inviter):
        raise ValidationError("Only reviewer/admin can invite users into roles.")
    if inviter.id == invitee.id:
        raise ValidationError("Self-invitation is not allowed.")
    if role not in set(RoleOnboardingRecord.Role.values):
        raise ValidationError("Invalid role.")

    _activate_role(user=invitee, role=role)

    return RoleOnboardingRecord.objects.create(
        user=invitee,
        role=role,
        method=RoleOnboardingRecord.Method.INVITED,
        invited_by=inviter,
        accountability_notes=notes or "",
    )


def format_accountability_label(record):
    # Human-readable text shown on public profile.
    if not record:
        return ""

    if record.method == RoleOnboardingRecord.Method.INVITED and record.invited_by:
        return f"Invited as {record.role.title()} by {record.invited_by.username}"

    reviewer_names = list(
        record.approved_by_reviewers.order_by("username").values_list("username", flat=True)
    )
    admin_names = list(
        record.approved_by_admins.order_by("username").values_list("username", flat=True)
    )
    approvers = reviewer_names + admin_names
    if approvers:
        return f"Approved as {record.role.title()} by {' and '.join(approvers)}"

    return f"Approved as {record.role.title()}"

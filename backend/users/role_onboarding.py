"""
users/role_onboarding.py

Role onboarding domain service.

Handles:
- application creation
- screening decisions and quorum checks
- direct invitation path
- accountability-label formatting for profile display
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from datetime import timedelta

from users.models import (
    RoleApplication,
    RoleApplicationDecision,
    RoleInvitation,
    RoleOnboardingRecord,
    UserProfile,
)


User = get_user_model()
CONTRIBUTOR_GROUP = "Contributor"
REVIEWER_GROUP = "Reviewer"
CONSULTANT_GROUP = "Consultant"
ADMIN_GROUP = "Admin"


def _clean_email(value, *, required=True):
    email = str(value or "").strip().lower()
    if not email:
        if required:
            raise ValidationError("Email address is required.")
        return ""
    validate_email(email)
    domain = email.rsplit("@", 1)[-1]
    if "." not in domain or domain.startswith(".") or domain.endswith(".") or ".." in domain:
        raise ValidationError("Enter a valid email domain.")
    return email


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


def _ensure_group(name):
    group, _ = Group.objects.get_or_create(name=name)
    return group


def _activate_role(*, user, role):
    # Contributor and Reviewer are explicit groups so the UI, profile,
    # and admin screens can show the same role state the backend enforces.
    contributor_group = _ensure_group(CONTRIBUTOR_GROUP)
    user.groups.add(contributor_group)

    if role in [
        RoleApplication.TargetRole.REVIEWER,
        RoleOnboardingRecord.Role.CONSULTANT,
        RoleOnboardingRecord.Role.ADMIN,
    ]:
        reviewer_group = _ensure_group(REVIEWER_GROUP)
        user.groups.add(reviewer_group)
    if role == RoleOnboardingRecord.Role.CONSULTANT:
        consultant_group = _ensure_group(CONSULTANT_GROUP)
        user.groups.add(consultant_group)
    if role == RoleOnboardingRecord.Role.ADMIN:
        admin_group = _ensure_group(ADMIN_GROUP)
        user.groups.add(admin_group)
        if not user.is_staff:
            user.is_staff = True
            user.save(update_fields=["is_staff"])


def _user_already_has_role(*, user, target_role):
    if target_role == RoleApplication.TargetRole.CONTRIBUTOR:
        return user.is_superuser or user.groups.filter(
            name__in=[CONTRIBUTOR_GROUP, REVIEWER_GROUP, CONSULTANT_GROUP, ADMIN_GROUP]
        ).exists()
    if target_role == RoleApplication.TargetRole.REVIEWER:
        return user.is_superuser or user.groups.filter(
            name__in=[REVIEWER_GROUP, ADMIN_GROUP]
        ).exists()
    if target_role == RoleOnboardingRecord.Role.CONSULTANT:
        return user.is_superuser or user.groups.filter(
            name__in=[CONSULTANT_GROUP, ADMIN_GROUP]
        ).exists()
    if target_role == RoleOnboardingRecord.Role.ADMIN:
        return user.is_superuser or user.groups.filter(name=ADMIN_GROUP).exists()
    return False


@transaction.atomic
def create_role_application(*, applicant, target_role, reviewer_reason=""):
    if target_role not in set(RoleApplication.TargetRole.values):
        raise ValidationError("Invalid target role.")
    reviewer_reason = str(reviewer_reason or "").strip()
    if target_role == RoleApplication.TargetRole.REVIEWER and not reviewer_reason:
        raise ValidationError("Reason for applying as reviewer is required.")
    if _user_already_has_role(user=applicant, target_role=target_role):
        raise ValidationError(f"This email is already connected to active {target_role} access. Please log in instead.")
    if RoleApplication.objects.filter(
        applicant=applicant,
        target_role=target_role,
        status=RoleApplication.Status.PENDING,
    ).exists():
        raise ValidationError(f"This email already has a pending {target_role} application. Please check your email or use the status checker.")

    return RoleApplication.objects.create(
        applicant=applicant,
        target_role=target_role,
        reviewer_reason=reviewer_reason,
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
    if decision == RoleApplicationDecision.Decision.REJECT and not notes.strip():
        raise ValidationError("Rejection requires notes.")

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
    if role in [RoleOnboardingRecord.Role.CONSULTANT, RoleOnboardingRecord.Role.ADMIN] and not is_admin(inviter):
        role_name = "administrators" if role == RoleOnboardingRecord.Role.ADMIN else "consultants"
        raise ValidationError(f"Only admin users can invite {role_name}.")

    _activate_role(user=invitee, role=role)

    return RoleOnboardingRecord.objects.create(
        user=invitee,
        role=role,
        method=RoleOnboardingRecord.Method.INVITED,
        invited_by=inviter,
        accountability_notes=notes or "",
    )


@transaction.atomic
def create_email_role_invitation(
    *,
    inviter,
    email,
    role,
    first_name="",
    last_name="",
    municipality="",
    notes="",
):
    # Email invitation is limited to role screeners because it bypasses approval quorum.
    if not can_screen_roles(inviter):
        raise ValidationError("Only reviewer/admin users can send email role invitations.")
    if role not in set(RoleOnboardingRecord.Role.values):
        raise ValidationError("Invalid role.")
    if role in [RoleOnboardingRecord.Role.CONSULTANT, RoleOnboardingRecord.Role.ADMIN] and not is_admin(inviter):
        role_name = "administrators" if role == RoleOnboardingRecord.Role.ADMIN else "consultants"
        raise ValidationError(f"Only admin users can invite {role_name}.")
    normalized_email = _clean_email(email)

    existing_user = User.objects.filter(email__iexact=normalized_email).first()
    if existing_user and _user_already_has_role(user=existing_user, target_role=role):
        raise ValidationError(f"This email already has {role} access.")

    RoleInvitation.objects.filter(
        email__iexact=normalized_email,
        role=role,
        status=RoleInvitation.Status.PENDING,
    ).update(status=RoleInvitation.Status.REVOKED)

    return RoleInvitation.objects.create(
        email=normalized_email,
        role=role,
        invited_by=inviter,
        first_name=str(first_name or "").strip(),
        last_name=str(last_name or "").strip(),
        municipality=str(municipality or "").strip(),
        notes=notes or "",
        expires_at=timezone.now() + timedelta(days=getattr(settings, "ROLE_INVITATION_EXPIRY_DAYS", 14)),
    )


@transaction.atomic
def create_consultant_profile(
    *,
    created_by,
    first_name,
    last_name,
    email="",
    municipality="",
    post_nominals="",
    affiliation="",
    occupation="",
    bio="",
    notes="",
):
    if not is_admin(created_by):
        raise ValidationError("Only admin users can create consultant profiles.")

    first_name = str(first_name or "").strip()
    last_name = str(last_name or "").strip()
    email = _clean_email(email, required=False)
    if not first_name or not last_name:
        raise ValidationError("First name and last name are required.")
    if email and User.objects.filter(email__iexact=email).exists():
        raise ValidationError("A user with this email already exists.")

    username_seed = email.split("@")[0] if email else f"{first_name}.{last_name}"
    user = User.objects.create_user(
        username=_unique_username_for_user(username_seed),
        email=email,
        first_name=first_name,
        last_name=last_name,
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])

    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.municipality = str(municipality or "").strip()
    profile.post_nominals = str(post_nominals or "").strip()
    profile.affiliation = str(affiliation or "").strip()
    profile.occupation = str(occupation or "").strip()
    profile.bio = str(bio or "").strip()
    profile.include_in_leaderboard = False
    profile.save()

    _activate_role(user=user, role=RoleOnboardingRecord.Role.CONSULTANT)
    record = RoleOnboardingRecord.objects.create(
        user=user,
        role=RoleOnboardingRecord.Role.CONSULTANT,
        method=RoleOnboardingRecord.Method.ADMIN_CREATED,
        invited_by=created_by,
        accountability_notes=notes or "",
    )
    return user, record


def _unique_username_for_user(seed):
    base = str(seed or "consultant").strip().lower().replace("@", ".")
    base = "".join(char if char.isalnum() or char in "._-" else "." for char in base)
    base = ".".join(chunk for chunk in base.split(".") if chunk)[:24].strip(".") or "consultant"
    candidate = base
    suffix = 2
    while User.objects.filter(username__iexact=candidate).exists():
        candidate = f"{base}.{suffix}"
        suffix += 1
    return candidate


@transaction.atomic
def accept_email_role_invitation(
    *,
    token,
    username,
    password,
):
    invitation = RoleInvitation.objects.select_for_update().filter(token=token).first()
    if not invitation:
        raise ValidationError("Invitation was not found.")
    if invitation.status != RoleInvitation.Status.PENDING:
        raise ValidationError("Invitation is no longer pending.")
    if invitation.expires_at and invitation.expires_at < timezone.now():
        invitation.status = RoleInvitation.Status.REVOKED
        invitation.save(update_fields=["status"])
        raise ValidationError("Invitation has expired.")

    normalized_email = str(invitation.email or "").strip().lower()
    user = User.objects.select_for_update().filter(email__iexact=normalized_email).first()
    username_taken = User.objects.filter(username__iexact=username)
    if user:
        username_taken = username_taken.exclude(id=user.id)
    if username_taken.exists():
        raise ValidationError("That username is already taken.")

    if not user:
        user = User.objects.create_user(
            username=username,
            email=normalized_email,
            first_name=invitation.first_name,
            last_name=invitation.last_name,
        )
    else:
        if user.has_usable_password():
            raise ValidationError("This email already has login credentials. Please log in instead.")
        user.username = username
        if invitation.first_name and not user.first_name:
            user.first_name = invitation.first_name
        if invitation.last_name and not user.last_name:
            user.last_name = invitation.last_name

    user.set_password(password)
    user.save(update_fields=["username", "email", "first_name", "last_name", "password"])

    if invitation.municipality:
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if not profile.municipality:
            profile.municipality = invitation.municipality
            profile.save(update_fields=["municipality"])

    _activate_role(user=user, role=invitation.role)
    record = RoleOnboardingRecord.objects.create(
        user=user,
        role=invitation.role,
        method=RoleOnboardingRecord.Method.INVITED,
        invited_by=invitation.invited_by,
        accountability_notes=invitation.notes or "",
    )

    invitation.status = RoleInvitation.Status.ACCEPTED
    invitation.accepted_by = user
    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["status", "accepted_by", "accepted_at"])

    return invitation, record


def format_accountability_label(record):
    # Human-readable text shown on public profile.
    if not record:
        return ""

    def actor_display_name(user):
        first = str(user.first_name or "").strip()
        last = str(user.last_name or "").strip()
        try:
            profile = user.profile
        except Exception:
            profile = None
        post_nominals = str(getattr(profile, "post_nominals", "") or "").strip()
        if first and last:
            name = f"{first[0].upper()}. {last}"
            return f"{name}, {post_nominals}" if post_nominals else name
        if first:
            return f"{first}, {post_nominals}" if post_nominals else first
        if last:
            return f"{last}, {post_nominals}" if post_nominals else last
        username = str(user.username or "").strip()
        parts = [chunk for chunk in username.replace("_", ".").replace("-", ".").split(".") if chunk]
        if len(parts) >= 2:
            name = f"{parts[0][0].upper()}. {parts[-1].title()}"
            return f"{name}, {post_nominals}" if post_nominals else name
        return f"{username}, {post_nominals}" if post_nominals else username

    if record.method == RoleOnboardingRecord.Method.INVITED and record.invited_by:
        return f"Invited as {record.role.title()} by {actor_display_name(record.invited_by)}"

    if record.method == RoleOnboardingRecord.Method.ADMIN_CREATED and record.invited_by:
        return f"Created as {record.role.title()} profile by {actor_display_name(record.invited_by)}"

    reviewer_names = [
        actor_display_name(user)
        for user in record.approved_by_reviewers.order_by("username")
    ]
    admin_names = [
        actor_display_name(user)
        for user in record.approved_by_admins.order_by("username")
    ]
    approvers = reviewer_names + admin_names
    if approvers:
        return f"Approved as {record.role.title()} by {' and '.join(approvers)}"

    return f"Approved as {record.role.title()}"

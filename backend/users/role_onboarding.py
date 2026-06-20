"""
users/role_onboarding.py

Role onboarding domain service.

Handles:
- application creation
- screening decisions and quorum checks
- direct invitation path
- accountability-label formatting for profile display
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from users.models import (
    RoleApplication,
    RoleApplicationDecision,
    RoleInvitation,
    RoleOnboardingRecord,
    UserProfile,
)
from users.names import (
    display_name as formatted_display_name,
)
from users.names import (
    normalize_affiliation_text,
    normalize_person_name,
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


def activate_role_for_approved_application(application):
    _activate_role(user=application.applicant, role=application.target_role)


def _user_already_has_role(*, user, target_role):
    if target_role == RoleApplication.TargetRole.CONTRIBUTOR:
        return (
            user.is_superuser
            or user.groups.filter(
                name__in=[CONTRIBUTOR_GROUP, REVIEWER_GROUP, CONSULTANT_GROUP, ADMIN_GROUP]
            ).exists()
        )
    if target_role == RoleApplication.TargetRole.REVIEWER:
        return (
            user.is_superuser or user.groups.filter(name__in=[REVIEWER_GROUP, ADMIN_GROUP]).exists()
        )
    if target_role == RoleOnboardingRecord.Role.CONSULTANT:
        return (
            user.is_superuser
            or user.groups.filter(name__in=[CONSULTANT_GROUP, ADMIN_GROUP]).exists()
        )
    if target_role == RoleOnboardingRecord.Role.ADMIN:
        return user.is_superuser or user.groups.filter(name=ADMIN_GROUP).exists()
    return False


@transaction.atomic
def create_role_application(*, applicant, target_role, reviewer_reason=""):
    if target_role not in set(RoleApplication.TargetRole.values):
        raise ValidationError("Invalid target role.")
    reviewer_reason = str(reviewer_reason or "").strip()
    is_contributor_upgrade = (
        target_role == RoleApplication.TargetRole.REVIEWER
        and applicant.groups.filter(name=CONTRIBUTOR_GROUP).exists()
    )
    if is_contributor_upgrade and not reviewer_reason:
        raise ValidationError("Reason for applying as reviewer is required.")
    if _user_already_has_role(user=applicant, target_role=target_role):
        raise ValidationError(
            f"This email is already connected to active {target_role} access. Please log in instead."
        )
    if RoleApplication.objects.filter(
        applicant=applicant,
        target_role=target_role,
        status=RoleApplication.Status.PENDING,
    ).exists():
        raise ValidationError(
            f"This email already has a pending {target_role} application. Please check your email or use the status checker."
        )

    return RoleApplication.objects.create(
        applicant=applicant,
        target_role=target_role,
        reviewer_reason=reviewer_reason,
        status=RoleApplication.Status.PENDING,
    )


def _build_approval_set(application):
    # Build unique approver sets by effective role at decision time.
    approvals = application.decisions.filter(
        decision=RoleApplicationDecision.Decision.APPROVE
    ).select_related("decided_by")

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
    # Any two distinct reviewer/admin approvers satisfy quorum for every role.
    reviewer_ids, admin_ids = _build_approval_set(application)
    return len(reviewer_ids) + len(admin_ids) >= 2


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

    if RoleApplicationDecision.objects.filter(
        application=application, decided_by=decided_by
    ).exists():
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

        if application.applicant.has_usable_password():
            _activate_role(user=application.applicant, role=application.target_role)
        elif application.applicant.is_active:
            application.applicant.is_active = False
            application.applicant.save(update_fields=["is_active"])
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
    if role in [
        RoleOnboardingRecord.Role.CONSULTANT,
        RoleOnboardingRecord.Role.ADMIN,
    ] and not is_admin(inviter):
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
    name_extension="",
    municipality="",
    notes="",
):
    # Email invitation is limited to role screeners because it bypasses approval quorum.
    if not can_screen_roles(inviter):
        raise ValidationError("Only reviewer/admin users can send email role invitations.")
    if role not in set(RoleOnboardingRecord.Role.values):
        raise ValidationError("Invalid role.")
    if role in [
        RoleOnboardingRecord.Role.CONSULTANT,
        RoleOnboardingRecord.Role.ADMIN,
    ] and not is_admin(inviter):
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
    ).update(status=RoleInvitation.Status.REPLACED)

    return RoleInvitation.objects.create(
        email=normalized_email,
        role=role,
        invited_by=inviter,
        first_name=normalize_person_name(first_name),
        last_name=normalize_person_name(last_name),
        name_extension=str(name_extension or "").strip(),
        municipality=str(municipality or "").strip(),
        notes=notes or "",
        expires_at=timezone.now()
        + timedelta(days=getattr(settings, "ROLE_INVITATION_EXPIRY_DAYS", 14)),
    )


@transaction.atomic
def create_consultant_profile(
    *,
    created_by,
    first_name,
    last_name,
    name_extension="",
    email="",
    municipality="",
    post_nominals="",
    affiliation="",
    occupation="",
    cultural_affiliations=None,
    other_affiliations=None,
    bio="",
    profile_photo=None,
    notes="",
):
    if not is_admin(created_by):
        raise ValidationError("Only admin users can create consultant profiles.")

    first_name = normalize_person_name(first_name)
    last_name = normalize_person_name(last_name)
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
    profile.name_extension = str(name_extension or "").strip()
    profile.municipality = str(municipality or "").strip()
    profile.post_nominals = str(post_nominals or "").strip()
    profile.cultural_affiliations = [
        {
            "role": normalize_affiliation_text(row.get("role", "")),
            "organization": normalize_affiliation_text(row.get("organization", "")),
        }
        for row in (cultural_affiliations or [])
        if isinstance(row, dict)
    ]
    profile.other_affiliations = [
        {
            "designation": normalize_affiliation_text(row.get("designation", "")),
            "institution": normalize_affiliation_text(row.get("institution", "")),
        }
        for row in (other_affiliations or [])
        if isinstance(row, dict)
    ]
    cultural_organizations = [
        row.get("organization", "")
        for row in profile.cultural_affiliations
        if row.get("organization")
    ]
    other_institutions = [
        row.get("institution", "") for row in profile.other_affiliations if row.get("institution")
    ]
    cultural_roles = [
        row.get("role", "") for row in profile.cultural_affiliations if row.get("role")
    ]
    other_designations = [
        row.get("designation", "") for row in profile.other_affiliations if row.get("designation")
    ]
    profile.affiliation = ", ".join(cultural_organizations + other_institutions)[
        :255
    ] or normalize_affiliation_text(affiliation)
    profile.occupation = ", ".join(cultural_roles + other_designations)[
        :255
    ] or normalize_affiliation_text(occupation)
    profile.bio = str(bio or "").strip()
    if profile_photo:
        profile.profile_photo = profile_photo
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


@transaction.atomic
def update_managed_consultant_profile(
    *,
    updated_by,
    user,
    first_name,
    last_name,
    name_extension="",
    email="",
    municipality="",
    post_nominals="",
    affiliation="",
    occupation="",
    cultural_affiliations=None,
    other_affiliations=None,
    bio="",
    profile_photo=None,
    notes=None,
):
    if not is_admin(updated_by):
        raise ValidationError("Only admin users can edit managed consultant profiles.")

    record = (
        user.role_onboarding_records.filter(
            role=RoleOnboardingRecord.Role.CONSULTANT,
            method=RoleOnboardingRecord.Method.ADMIN_CREATED,
        )
        .order_by("-created_at")
        .first()
    )
    if not record:
        raise ValidationError("This is not an admin-managed consultant profile.")

    first_name = normalize_person_name(first_name)
    last_name = normalize_person_name(last_name)
    email = _clean_email(email, required=False)
    if not first_name or not last_name:
        raise ValidationError("First name and last name are required.")
    if email and User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
        raise ValidationError("A user with this email already exists.")

    user.first_name = first_name
    user.last_name = last_name
    user.email = email
    user.save(update_fields=["first_name", "last_name", "email"])

    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.name_extension = str(name_extension or "").strip()
    profile.municipality = str(municipality or "").strip()
    profile.post_nominals = str(post_nominals or "").strip()
    profile.cultural_affiliations = [
        {
            "role": normalize_affiliation_text(row.get("role", "")),
            "organization": normalize_affiliation_text(row.get("organization", "")),
        }
        for row in (cultural_affiliations or [])
        if isinstance(row, dict)
    ]
    profile.other_affiliations = [
        {
            "designation": normalize_affiliation_text(row.get("designation", "")),
            "institution": normalize_affiliation_text(row.get("institution", "")),
        }
        for row in (other_affiliations or [])
        if isinstance(row, dict)
    ]
    cultural_organizations = [
        row.get("organization", "")
        for row in profile.cultural_affiliations
        if row.get("organization")
    ]
    other_institutions = [
        row.get("institution", "") for row in profile.other_affiliations if row.get("institution")
    ]
    cultural_roles = [
        row.get("role", "") for row in profile.cultural_affiliations if row.get("role")
    ]
    other_designations = [
        row.get("designation", "") for row in profile.other_affiliations if row.get("designation")
    ]
    profile.affiliation = ", ".join(cultural_organizations + other_institutions)[
        :255
    ] or normalize_affiliation_text(affiliation)
    profile.occupation = ", ".join(cultural_roles + other_designations)[
        :255
    ] or normalize_affiliation_text(occupation)
    profile.bio = str(bio or "").strip()
    if profile_photo:
        profile.profile_photo = profile_photo
    profile.save()

    if notes is not None:
        record.accountability_notes = str(notes or "").strip()
        record.save(update_fields=["accountability_notes"])

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
    first_name="",
    last_name="",
    name_extension="",
    municipality="",
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
    existing_municipality = ""
    existing_name_extension = ""
    if user:
        existing_profile = UserProfile.objects.filter(user=user).first()
        existing_municipality = existing_profile.municipality if existing_profile else ""
        existing_name_extension = existing_profile.name_extension if existing_profile else ""
    first_name = normalize_person_name(
        first_name or invitation.first_name or (user.first_name if user else "")
    )
    last_name = normalize_person_name(
        last_name or invitation.last_name or (user.last_name if user else "")
    )
    name_extension = str(
        name_extension or invitation.name_extension or existing_name_extension
    ).strip()
    municipality = str(municipality or invitation.municipality or existing_municipality).strip()
    username = str(username or "").strip().lower()
    if not first_name or not last_name or not municipality:
        raise ValidationError("First name, last name, and municipality are required.")

    username_taken = User.objects.filter(username__iexact=username)
    if user:
        username_taken = username_taken.exclude(id=user.id)
    if username_taken.exists():
        raise ValidationError("That username is already taken.")

    if not user:
        user = User.objects.create_user(
            username=username,
            email=normalized_email,
            first_name=first_name,
            last_name=last_name,
        )
    else:
        if user.has_usable_password():
            raise ValidationError(
                "This email already has login credentials. Please log in instead."
            )
        user.username = username
        user.first_name = first_name
        user.last_name = last_name

    user.set_password(password)
    user.save(update_fields=["username", "email", "first_name", "last_name", "password"])

    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.name_extension = name_extension
    profile.municipality = municipality
    profile.onboarding_prompt_pending = True
    profile.onboarding_prompt_dismissed = False
    profile.save(
        update_fields=[
            "municipality",
            "name_extension",
            "onboarding_prompt_pending",
            "onboarding_prompt_dismissed",
        ]
    )

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
        first = normalize_person_name(user.first_name)
        last = normalize_person_name(user.last_name)
        try:
            profile = user.profile
        except Exception:
            profile = None
        extension = str(getattr(profile, "name_extension", "") or "").strip()
        post_nominals = str(getattr(profile, "post_nominals", "") or "").strip()
        if first and last:
            name = f"{first[0].upper()}. {last}"
            if extension:
                name = f"{name} {extension}"
            return f"{name}, {post_nominals}" if post_nominals else name
        if first:
            name = f"{first} {extension}".strip()
            return f"{name}, {post_nominals}" if post_nominals else name
        if last:
            name = f"{last} {extension}".strip()
            return f"{name}, {post_nominals}" if post_nominals else name
        username = str(user.username or "").strip()
        parts = [
            chunk for chunk in username.replace("_", ".").replace("-", ".").split(".") if chunk
        ]
        if len(parts) >= 2:
            name = f"{parts[0][0].upper()}. {parts[-1].title()}"
            return f"{name}, {post_nominals}" if post_nominals else name
        return formatted_display_name(user, profile)

    if record.method == RoleOnboardingRecord.Method.INVITED and record.invited_by:
        return f"Invited as {record.role.title()} by {actor_display_name(record.invited_by)}"

    if record.method == RoleOnboardingRecord.Method.ADMIN_CREATED and record.invited_by:
        return (
            f"Created as {record.role.title()} profile by {actor_display_name(record.invited_by)}"
        )

    reviewer_names = [
        actor_display_name(user) for user in record.approved_by_reviewers.order_by("username")
    ]
    admin_names = [
        actor_display_name(user) for user in record.approved_by_admins.order_by("username")
    ]
    approvers = reviewer_names + admin_names
    if approvers:
        return f"Approved as {record.role.title()} by {' and '.join(approvers)}"

    return f"Approved as {record.role.title()}"

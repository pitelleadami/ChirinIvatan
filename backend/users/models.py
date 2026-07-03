import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

"""
users/models.py

Beginner map:
1) UserProfile: profile fields shown in public/private UI.
2) ContributionEvent: authoritative credit ledger for achievements.
3) RoleApplication / RoleApplicationDecision / RoleOnboardingRecord:
   role onboarding and accountability trail.
4) UserContributionStats / MunicipalityStats:
   cached counters for fast APIs.
5) RecognitionEvent + Gamification* models:
   level/badge events and configurable thresholds.

If you are extending this for another indigenous language:
- keep governance structure intact
- adjust labels/threshold config, not audit logic
- keep ContributionEvent uniqueness rules
"""


class UserProfile(models.Model):
    """
    Public profile information that does not belong in auth user model.

    Why separate model:
    - Keeps authentication table clean.
    - Lets us evolve profile fields without touching auth internals.
    """

    # One-to-one: each user has one profile row.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    # These are all optional and can be safely blank.
    municipality = models.CharField(max_length=255, blank=True, default="")
    name_extension = models.CharField(max_length=30, blank=True, default="")
    post_nominals = models.CharField(max_length=120, blank=True, default="")
    affiliation = models.CharField(max_length=255, blank=True, default="")
    occupation = models.CharField(max_length=255, blank=True, default="")
    cultural_affiliations = models.JSONField(default=list, blank=True)
    other_affiliations = models.JSONField(default=list, blank=True)
    bio = models.TextField(blank=True, default="")
    include_in_leaderboard = models.BooleanField(default=True)
    show_on_yaru_chart = models.BooleanField(default=True)
    show_live_contributions = models.BooleanField(default=True)
    onboarding_prompt_pending = models.BooleanField(default=False)
    onboarding_prompt_dismissed = models.BooleanField(default=False)
    # Optional profile photo path. Frontend should use fallback avatar when empty.
    profile_photo = models.ImageField(
        upload_to="users/profile_photos/",
        null=True,
        blank=True,
    )

    def __str__(self):
        return f"Profile<{self.user_id}>"


class SiteContentSettings(models.Model):
    """
    Admin-editable public page copy and lightweight relationship content.

    Keep this as a single row named "default". Empty arrays mean the public
    section should be hidden; the API supplies defaults only before an admin
    has saved custom content.
    """

    key = models.CharField(max_length=32, unique=True, default="default")
    brand_name = models.CharField(max_length=160, blank=True, default="Chirin Ivatan")
    brand_logo_url = models.URLField(blank=True, default="")
    landing_intro_text = models.TextField(blank=True, default="")
    landing_body_text = models.TextField(blank=True, default="")
    footer_left_text = models.CharField(max_length=255, blank=True, default="")
    footer_center_text = models.CharField(max_length=255, blank=True, default="")
    footer_right_text = models.CharField(max_length=255, blank=True, default="")
    about_heading = models.CharField(max_length=160, blank=True, default="")
    about_intro_paragraphs = models.JSONField(default=list, blank=True)
    about_body_paragraphs = models.JSONField(default=list, blank=True)
    about_rationale_paragraphs = models.JSONField(default=list, blank=True)
    about_future_paragraphs = models.JSONField(default=list, blank=True)
    about_final_quote = models.TextField(blank=True, default="")

    yaru_heading = models.CharField(max_length=160, blank=True, default="")
    yaru_intro_paragraphs = models.JSONField(default=list, blank=True)

    support_statements = models.JSONField(default=list, blank=True)
    partner_details = models.JSONField(default=list, blank=True)
    faq_sections = models.JSONField(default=list, blank=True)
    terms_conditions_paragraphs = models.JSONField(default=list, blank=True)
    privacy_notice_paragraphs = models.JSONField(default=list, blank=True)
    media_upload_policy_paragraphs = models.JSONField(default=list, blank=True)
    contributor_agreement_paragraphs = models.JSONField(default=list, blank=True)
    information_security_policy_paragraphs = models.JSONField(default=list, blank=True)
    beta_locked = models.BooleanField(default=True)
    maintenance_enabled = models.BooleanField(default=False)
    maintenance_message = models.TextField(
        blank=True,
        default=("Chirin Ivatan is temporarily paused for maintenance. " "Please check back soon."),
    )

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="site_content_updates",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Site content settings"
        verbose_name_plural = "Site content settings"

    def __str__(self):
        return f"SiteContentSettings<{self.key}>"


class ContributionEvent(models.Model):
    """
    Credit ledger for contribution counting.

    Golden rule:
    If something should increase leaderboard/recognition, create a row here.

    Troubleshooting:
    - Wrong totals? Inspect this table first.
    - Duplicate scores? Check unique constraints below.
    """

    class Type(models.TextChoices):
        # First approved dictionary mother contribution.
        DICTIONARY_TERM = "dictionary_term", "Dictionary Term"
        # First approved folklore contribution.
        FOLKLORE_ENTRY = "folklore_entry", "Folklore Entry"
        # Approved revision credit (one-per-user-per-entry lifetime).
        REVISION = "revision", "Revision"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # User receiving contribution credit.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contribution_events",
    )

    contribution_type = models.CharField(max_length=32, choices=Type.choices)

    # Optional dictionary entry link for dictionary/revision contributions.
    dictionary_entry = models.ForeignKey(
        "dictionary.Entry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contribution_events",
    )
    # Optional folklore entry link for folklore/revision contributions.
    folklore_entry = models.ForeignKey(
        "folklore.FolkloreEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contribution_events",
    )
    # Optional direct revision pointers for auditability.
    entry_revision = models.ForeignKey(
        "dictionary.EntryRevision",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contribution_events",
    )
    folklore_revision = models.ForeignKey(
        "folklore.FolkloreRevision",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contribution_events",
    )

    awarded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Anti-inflation constraints:
        # prevent repeated awards for same actor+entry+credit type.
        constraints = [
            models.UniqueConstraint(
                fields=("user", "dictionary_entry", "contribution_type"),
                condition=models.Q(contribution_type="revision"),
                name="uniq_revision_credit_per_user_entry",
            ),
            models.UniqueConstraint(
                fields=("user", "folklore_entry", "contribution_type"),
                condition=models.Q(contribution_type="revision"),
                name="uniq_revision_credit_per_user_folklore_entry",
            ),
            models.UniqueConstraint(
                fields=("user", "dictionary_entry", "contribution_type"),
                condition=models.Q(contribution_type="dictionary_term"),
                name="uniq_dictionary_term_credit_per_user_entry",
            ),
            models.UniqueConstraint(
                fields=("user", "folklore_entry", "contribution_type"),
                condition=models.Q(contribution_type="folklore_entry"),
                name="uniq_folklore_credit_per_user_entry",
            ),
        ]
        ordering = ["-awarded_at"]

    def __str__(self):
        return f"{self.user_id}:{self.contribution_type}"


class UserSessionEvent(models.Model):
    """
    Minimal login/logout audit trail for admin account activity review.

    This intentionally stores only coarse request metadata. It should answer
    "when did this account log in/out?" without turning session history into a
    sensitive tracking ledger.
    """

    class Type(models.TextChoices):
        LOGIN = "login", "Login"
        LOGOUT = "logout", "Logout"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="session_events",
    )
    event_type = models.CharField(max_length=16, choices=Type.choices)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["event_type", "created_at"]),
        ]

    def __str__(self):
        return f"{self.user_id}:{self.event_type}:{self.created_at}"


class AdminAccountAction(models.Model):
    """
    Audit trail for high-impact account administration.

    Suspicious-account flags intentionally stay as rows with a review status,
    mirroring content re-review: the account is not forgotten after the first
    flag, and another admin can later clear or confirm the concern with notes.
    """

    class Action(models.TextChoices):
        DEACTIVATE = "deactivate", "Deactivate"
        REACTIVATE = "reactivate", "Reactivate"
        SEND_PASSWORD_RESET = "send_password_reset", "Send Password Reset"
        SEND_APPROVAL_REMINDER = "send_approval_reminder", "Send Approval Reminder"
        REVOKE_ROLE = "revoke_role", "Revoke Role"
        FLAG_SUSPICIOUS = "flag_suspicious", "Flag Suspicious"
        CLEAR_SUSPICIOUS_FLAG = "clear_suspicious_flag", "Clear Suspicious Flag"
        CONFIRM_SUSPICIOUS_FLAG = "confirm_suspicious_flag", "Confirm Suspicious Flag"
        SCHEDULE_ACCOUNT_DELETION = "schedule_account_deletion", "Schedule Account Deletion"
        CANCEL_ACCOUNT_DELETION = "cancel_account_deletion", "Cancel Account Deletion"
        COMPLETE_ACCOUNT_DELETION = "complete_account_deletion", "Complete Account Deletion"

    class FlagStatus(models.TextChoices):
        NONE = "none", "None"
        PENDING = "pending", "Pending"
        CLEARED = "cleared", "Cleared"
        CONFIRMED = "confirmed", "Confirmed"

    class DeletionStatus(models.TextChoices):
        NONE = "none", "None"
        PENDING = "pending", "Pending"
        CANCELED = "canceled", "Canceled"
        COMPLETED = "completed", "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="admin_account_actions",
    )
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="admin_account_actions_taken",
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    role = models.CharField(max_length=24, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    status_before = models.CharField(max_length=80, blank=True, default="")
    status_after = models.CharField(max_length=80, blank=True, default="")
    flag_status = models.CharField(
        max_length=16,
        choices=FlagStatus.choices,
        default=FlagStatus.NONE,
    )
    deletion_status = models.CharField(
        max_length=16,
        choices=DeletionStatus.choices,
        default=DeletionStatus.NONE,
    )
    deletion_reason = models.CharField(max_length=64, blank=True, default="")
    scheduled_for = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="admin_account_flags_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["target_user", "created_at"]),
            models.Index(fields=["action", "flag_status", "created_at"]),
            models.Index(fields=["action", "deletion_status", "scheduled_for"]),
        ]

    def __str__(self):
        return f"{self.target_user_id}:{self.action}:{self.created_at}"


class RoleApplication(models.Model):
    """
    Pending request from user to become contributor or reviewer.

    Quorum/decision rules are enforced in service layer.
    This model stores the lifecycle state of the request.
    """

    class TargetRole(models.TextChoices):
        CONTRIBUTOR = "contributor", "Contributor"
        REVIEWER = "reviewer", "Reviewer"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    applicant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="role_applications",
    )
    target_role = models.CharField(max_length=24, choices=TargetRole.choices)
    reviewer_reason = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.applicant_id}:{self.target_role}:{self.status}"


class RoleApplicationDecision(models.Model):
    """
    Individual approval/rejection record by a screening actor.

    Audit value:
    - tells who decided
    - stores notes
    - supports accountability on final onboarding record
    """

    class Decision(models.TextChoices):
        APPROVE = "approve", "Approve"
        REJECT = "reject", "Reject"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        RoleApplication,
        on_delete=models.CASCADE,
        related_name="decisions",
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="role_application_decisions",
    )
    decision = models.CharField(max_length=24, choices=Decision.choices)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Prevent same actor from voting twice on same application.
        constraints = [
            models.UniqueConstraint(
                fields=("application", "decided_by"),
                name="uniq_role_application_decision_per_actor",
            ),
        ]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.application_id}:{self.decided_by_id}:{self.decision}"


class RoleOnboardingRecord(models.Model):
    """
    Final accountability trail after onboarding is granted.

    Methods:
    - invited: direct invite by reviewer/admin
    - approved_application: approved through quorum path
    """

    class Role(models.TextChoices):
        CONTRIBUTOR = "contributor", "Contributor"
        REVIEWER = "reviewer", "Reviewer"
        CONSULTANT = "consultant", "Consultant"
        ADMIN = "admin", "Admin"

    class Method(models.TextChoices):
        INVITED = "invited", "Invited"
        APPROVED_APPLICATION = "approved_application", "Approved Application"
        ADMIN_CREATED = "admin_created", "Admin Created"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="role_onboarding_records",
    )
    role = models.CharField(max_length=24, choices=Role.choices)
    method = models.CharField(max_length=40, choices=Method.choices)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="role_invitations_sent",
        null=True,
        blank=True,
    )
    approved_by_reviewers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="reviewer_role_approvals",
    )
    approved_by_admins = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="admin_role_approvals",
    )
    source_application = models.ForeignKey(
        RoleApplication,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="onboarding_records",
    )
    accountability_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user_id}:{self.role}:{self.method}"


class RoleInvitation(models.Model):
    """
    Email invitation that lets an admin-vetted person claim role access.

    This is separate from RoleApplication on purpose:
    - applications use community approval quorum
    - invitations are an admin accountability path that bypasses quorum
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REPLACED = "replaced", "Replaced"
        REVOKED = "revoked", "Revoked"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    email = models.EmailField()
    role = models.CharField(max_length=24, choices=RoleOnboardingRecord.Role.choices)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="email_role_invitations_sent",
    )
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="accepted_role_invitations",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.PENDING,
    )
    first_name = models.CharField(max_length=150, blank=True, default="")
    last_name = models.CharField(max_length=150, blank=True, default="")
    name_extension = models.CharField(max_length=30, blank=True, default="")
    municipality = models.CharField(max_length=255, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email", "status"]),
            models.Index(fields=["token"]),
        ]

    def __str__(self):
        return f"{self.email}:{self.role}:{self.status}"


class UserContributionStats(models.Model):
    """
    Precomputed counters used for deterministic gamification and fast APIs.

    Why cache this:
    - avoids expensive re-aggregation on every request
    - keeps profile/leaderboard pages responsive
    - provides stable values for level/badge decisions
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contribution_stats",
    )

    # All-time totals (historical, not visibility-dependent).
    combined_total = models.PositiveIntegerField(default=0)  # originals + revisions
    dictionary_original_total = models.PositiveIntegerField(default=0)
    folklore_original_total = models.PositiveIntegerField(default=0)
    total_rejections = models.PositiveIntegerField(default=0)
    review_completed_total = models.PositiveIntegerField(default=0)

    # Monthly totals (lazy reset pattern handled in recognition service).
    dictionary_month = models.PositiveIntegerField(default=0)
    folklore_month = models.PositiveIntegerField(default=0)
    combined_month = models.PositiveIntegerField(default=0)
    last_month_calculated = models.CharField(max_length=7, blank=True, default="")

    # Snapshot of last computed recognition status for this user.
    contributor_level = models.PositiveSmallIntegerField(default=0)
    reviewer_level = models.PositiveSmallIntegerField(default=0)
    unlocked_badges = models.JSONField(default=list, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["combined_total"]),
            models.Index(fields=["dictionary_original_total"]),
            models.Index(fields=["folklore_original_total"]),
            models.Index(fields=["review_completed_total"]),
            models.Index(fields=["last_month_calculated"]),
        ]

    def __str__(self):
        return f"Stats<{self.user_id}>"


class MunicipalityStats(models.Model):
    """
    Cached municipality aggregates for civic leaderboard views.

    This is municipality-level equivalent of UserContributionStats.
    """

    municipality = models.CharField(max_length=100, primary_key=True)

    dictionary_all_time = models.PositiveIntegerField(default=0)
    folklore_all_time = models.PositiveIntegerField(default=0)
    combined_all_time = models.PositiveIntegerField(default=0)

    dictionary_month = models.PositiveIntegerField(default=0)
    folklore_month = models.PositiveIntegerField(default=0)
    combined_month = models.PositiveIntegerField(default=0)
    last_month_calculated = models.CharField(max_length=7, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["municipality"]

    def __str__(self):
        return f"MunicipalityStats<{self.municipality}>"


class RecognitionEvent(models.Model):
    """
    Immutable recognition feed.

    Example events:
    - contributor level up
    - reviewer level up
    - badge unlock
    - municipality monthly winner
    """

    class EventType(models.TextChoices):
        LEVEL_UP = "level_up", "Level Up"
        BADGE_UNLOCK = "badge_unlock", "Badge Unlock"
        MUNICIPALITY_WIN = "municipality_win", "Municipality Win"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recognition_events",
    )
    municipality = models.CharField(max_length=100, blank=True, default="")
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    reference_id = models.CharField(max_length=120, blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event_type", "created_at"]),
            models.Index(fields=["municipality", "created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type}:{self.reference_id}"


class GamificationConfig(models.Model):
    """
    Admin-editable thresholds and titles for levels/badges.

    Operational guidance:
    - keep one row named "default"
    - do not remove required keys from JSON fields
    - validate in admin before publishing changes
    """

    name = models.CharField(max_length=50, unique=True, default="default")

    contributor_levels = models.JSONField(default=list, blank=True)
    reviewer_levels = models.JSONField(default=list, blank=True)
    dictionary_badges = models.JSONField(default=list, blank=True)
    folklore_badges = models.JSONField(default=list, blank=True)
    quality_badge = models.JSONField(default=dict, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"GamificationConfig<{self.name}>"

    @staticmethod
    def _validate_level_rows(rows, field_name):
        # Strong schema checks prevent runtime crashes in recognition logic.
        if not isinstance(rows, list) or not rows:
            raise ValidationError({field_name: "Must be a non-empty list."})
        for item in rows:
            if not isinstance(item, dict):
                raise ValidationError({field_name: "Each level row must be an object."})
            if "number" not in item or "title" not in item or "threshold" not in item:
                raise ValidationError(
                    {field_name: "Each row requires number, title, and threshold."}
                )
            try:
                number = int(item["number"])
                threshold = int(item["threshold"])
            except (TypeError, ValueError):
                raise ValidationError({field_name: "number and threshold must be integers."})
            if number < 0 or threshold < 0:
                raise ValidationError({field_name: "number and threshold must be >= 0."})
            if not str(item["title"]).strip():
                raise ValidationError({field_name: "title must be non-empty."})

    @staticmethod
    def _validate_badge_rows(rows, field_name):
        # Badge rows must have key/name/threshold in every object.
        if not isinstance(rows, list) or not rows:
            raise ValidationError({field_name: "Must be a non-empty list."})
        for item in rows:
            if not isinstance(item, dict):
                raise ValidationError({field_name: "Each badge row must be an object."})
            if "key" not in item or "name" not in item or "threshold" not in item:
                raise ValidationError({field_name: "Each row requires key, name, and threshold."})
            if not str(item["key"]).strip() or not str(item["name"]).strip():
                raise ValidationError({field_name: "key and name must be non-empty."})
            try:
                threshold = int(item["threshold"])
            except (TypeError, ValueError):
                raise ValidationError({field_name: "threshold must be an integer."})
            if threshold < 0:
                raise ValidationError({field_name: "threshold must be >= 0."})

    def clean(self):
        # This runs on model validation and protects config integrity.
        self._validate_level_rows(self.contributor_levels, "contributor_levels")
        self._validate_level_rows(self.reviewer_levels, "reviewer_levels")
        self._validate_badge_rows(self.dictionary_badges, "dictionary_badges")
        self._validate_badge_rows(self.folklore_badges, "folklore_badges")

        if not isinstance(self.quality_badge, dict):
            raise ValidationError({"quality_badge": "Must be an object."})
        required_quality = ["key", "name", "threshold", "max_rejections"]
        missing = [key for key in required_quality if key not in self.quality_badge]
        if missing:
            raise ValidationError({"quality_badge": f"Missing required keys: {', '.join(missing)}"})
        if (
            not str(self.quality_badge["key"]).strip()
            or not str(self.quality_badge["name"]).strip()
        ):
            raise ValidationError({"quality_badge": "key and name must be non-empty."})
        try:
            threshold = int(self.quality_badge["threshold"])
            max_rejections = int(self.quality_badge["max_rejections"])
        except (TypeError, ValueError):
            raise ValidationError(
                {"quality_badge": "threshold and max_rejections must be integers."}
            )
        if threshold < 0 or max_rejections < 0:
            raise ValidationError({"quality_badge": "threshold and max_rejections must be >= 0."})


class GamificationRuntimeState(models.Model):
    """
    Internal marker used by monthly winner rollover logic.

    Prevents duplicate winner creation when recomputation runs multiple times.
    """

    key = models.CharField(max_length=32, primary_key=True, default="global")
    last_winner_processed_month = models.CharField(max_length=7, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"GamificationRuntimeState<{self.key}>"


class MunicipalityMonthlyWinner(models.Model):
    """
    Stores one winning municipality per month and metric.

    Metric options:
    - dictionary
    - folklore
    - combined
    """

    class Metric(models.TextChoices):
        DICTIONARY = "dictionary", "Dictionary"
        FOLKLORE = "folklore", "Folklore"
        COMBINED = "combined", "Combined"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    month_key = models.CharField(max_length=7)
    metric = models.CharField(max_length=16, choices=Metric.choices)
    municipality = models.CharField(max_length=100)
    score = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("month_key", "metric"),
                name="uniq_municipality_winner_per_month_metric",
            )
        ]
        ordering = ["-month_key", "metric"]

    def __str__(self):
        return f"{self.month_key}:{self.metric}:{self.municipality}"


class Notification(models.Model):
    class Type(models.TextChoices):
        SUBMISSION_RECEIVED = "submission_received", "Submission received"
        REVISION_APPROVED = "revision_approved", "Revision approved"
        REVISION_REJECTED = "revision_rejected", "Revision rejected"
        MILESTONE = "milestone", "Milestone"
        COMMENT_RECEIVED = "comment_received", "Comment on your entry"
        ROLE_DECIDED = "role_decided", "Role application decided"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notif_type = models.CharField(max_length=32, choices=Type.choices)
    message = models.TextField()
    target_url = models.CharField(max_length=500, blank=True, default="")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

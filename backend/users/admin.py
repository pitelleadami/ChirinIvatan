from django.contrib import admin
from users.models import (
    ContributionEvent,
    GamificationConfig,
    GamificationRuntimeState,
    MunicipalityStats,
    MunicipalityMonthlyWinner,
    RecognitionEvent,
    RoleApplication,
    RoleApplicationDecision,
    RoleOnboardingRecord,
    UserContributionStats,
    UserProfile,
)

"""
users/admin.py

Admin site intent:
- expose governance and gamification models in a manageable way
- make operational debugging easier (search + filters + list columns)

If you add a new user-facing model in users app:
- register it here
- add list_display and search_fields for admin usability
"""


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """Manage user profile metadata shown in public profile pages."""

    list_display = ("user", "municipality", "affiliation", "occupation")
    search_fields = ("user__username", "municipality", "affiliation", "occupation")


@admin.register(ContributionEvent)
class ContributionEventAdmin(admin.ModelAdmin):
    """View contribution credit ledger rows (authoritative counting events)."""

    list_display = ("user", "contribution_type", "awarded_at")
    list_filter = ("contribution_type",)
    search_fields = ("user__username",)


@admin.register(RoleApplication)
class RoleApplicationAdmin(admin.ModelAdmin):
    """Track pending/approved/rejected role applications."""

    list_display = ("applicant", "target_role", "status", "created_at", "decided_at")
    list_filter = ("target_role", "status")
    search_fields = ("applicant__username",)


@admin.register(RoleApplicationDecision)
class RoleApplicationDecisionAdmin(admin.ModelAdmin):
    """Inspect who approved/rejected each role application."""

    list_display = ("application", "decided_by", "decision", "created_at")
    list_filter = ("decision",)
    search_fields = ("decided_by__username", "application__applicant__username")


@admin.register(RoleOnboardingRecord)
class RoleOnboardingRecordAdmin(admin.ModelAdmin):
    """Final accountability records for invite/approval onboarding outcomes."""

    list_display = ("user", "role", "method", "invited_by", "created_at")
    list_filter = ("role", "method")
    search_fields = ("user__username", "invited_by__username")


@admin.register(UserContributionStats)
class UserContributionStatsAdmin(admin.ModelAdmin):
    """Cached per-user counters used by profile/gamification/leaderboards."""

    list_display = (
        "user",
        "combined_total",
        "dictionary_original_total",
        "folklore_original_total",
        "review_completed_total",
        "contributor_level",
        "reviewer_level",
        "updated_at",
    )
    search_fields = ("user__username",)


@admin.register(MunicipalityStats)
class MunicipalityStatsAdmin(admin.ModelAdmin):
    """Cached municipality totals for all-time and monthly leaderboard views."""

    list_display = (
        "municipality",
        "dictionary_all_time",
        "folklore_all_time",
        "combined_all_time",
        "dictionary_month",
        "folklore_month",
        "combined_month",
        "last_month_calculated",
    )
    search_fields = ("municipality",)


@admin.register(RecognitionEvent)
class RecognitionEventAdmin(admin.ModelAdmin):
    """Immutable log of level-up, badge unlock, and municipality-win events."""

    list_display = ("event_type", "user", "municipality", "reference_id", "created_at")
    list_filter = ("event_type",)
    search_fields = ("user__username", "municipality", "reference_id")


@admin.register(GamificationConfig)
class GamificationConfigAdmin(admin.ModelAdmin):
    """Editable threshold configuration (usually maintain one 'default' row)."""

    list_display = ("name", "updated_at")


@admin.register(GamificationRuntimeState)
class GamificationRuntimeStateAdmin(admin.ModelAdmin):
    """Operational state used during monthly winner rollover processing."""

    list_display = ("key", "last_winner_processed_month", "updated_at")
    readonly_fields = ("updated_at",)


@admin.register(MunicipalityMonthlyWinner)
class MunicipalityMonthlyWinnerAdmin(admin.ModelAdmin):
    """Monthly winners table by metric (dictionary / folklore / combined)."""

    list_display = ("month_key", "metric", "municipality", "score", "created_at")
    list_filter = ("metric", "month_key")
    search_fields = ("municipality",)

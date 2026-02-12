from django.contrib import admin
from .models import FolkloreReview, Review, ReviewAdminOverride


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    """
    Admin inspection only.
    Review creation will later be done via controlled flows.
    """

    list_display = (
        "revision",
        "review_round",
        "reviewer",
        "decision",
        "created_at",
    )

    readonly_fields = (
        "revision",
        "review_round",
        "reviewer",
        "decision",
        "notes",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ReviewAdminOverride)
class ReviewAdminOverrideAdmin(admin.ModelAdmin):
    """
    Read-only audit log for admin override actions.
    """

    list_display = (
        "target_type",
        "action",
        "status_before",
        "status_after",
        "admin",
        "created_at",
    )
    readonly_fields = (
        "target_type",
        "dictionary_entry",
        "folklore_entry",
        "action",
        "notes",
        "status_before",
        "status_after",
        "admin",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(FolkloreReview)
class FolkloreReviewAdmin(admin.ModelAdmin):
    """
    Read-only audit log for folklore review decisions.
    """

    list_display = (
        "folklore_revision",
        "review_round",
        "reviewer",
        "decision",
        "created_at",
    )
    readonly_fields = (
        "folklore_revision",
        "review_round",
        "reviewer",
        "decision",
        "notes",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

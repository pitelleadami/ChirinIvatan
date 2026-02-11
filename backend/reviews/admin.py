from django.contrib import admin
from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    """
    Admin inspection only.
    Review creation will later be done via controlled flows.
    """

    list_display = (
        "revision",
        "reviewer",
        "decision",
        "created_at",
    )

    readonly_fields = (
        "revision",
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

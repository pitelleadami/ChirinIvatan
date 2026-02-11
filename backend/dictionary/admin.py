from django.contrib import admin, messages
from django.core.exceptions import ValidationError

from dictionary.models import Entry, EntryRevision
from reviews.models import Review
from reviews.services import submit_review


# =========================
# ENTRY (READ-ONLY)
# =========================

@admin.register(Entry)
class EntryAdmin(admin.ModelAdmin):
    list_display = (
        "term",
        "part_of_speech",
        "initial_contributor",
        "last_revised_by",
        "last_approved_at",
    )

    readonly_fields = (
        "term",
        "meaning",
        "part_of_speech",
        "initial_contributor",
        "last_revised_by",
        "last_approved_at",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(EntryRevision)
class EntryRevisionAdmin(admin.ModelAdmin):
    """
    Admin interface for EntryRevision.

    EntryRevision does NOT store the term directly.
    The term lives inside Entry or inside proposed_data (for new submissions).
    """

    # --------------------------------------------------------
    # Admin List View
    # --------------------------------------------------------

    list_display = (
        "get_term",
        "status",
        "contributor",
        "created_at",
        "approved_at",
    )

    readonly_fields = (
        "contributor",
        "created_at",
        "approved_at",
    )

    actions = ["approve_revisions", "reject_revisions"]

    # --------------------------------------------------------
    # Show term safely
    # --------------------------------------------------------

    def get_term(self, obj):
        """
        If revision is for an existing entry,
        show the entry term.

        If this is a new submission (entry is None),
        show the proposed term from proposed_data JSON.
        """
        if obj.entry:
            return obj.entry.term

        # For new submissions
        if obj.proposed_data and "term" in obj.proposed_data:
            return obj.proposed_data.get("term")

        return "New Submission"

    get_term.short_description = "Term"

    # --------------------------------------------------------
    # Auto-assign contributor
    # --------------------------------------------------------

    def save_model(self, request, obj, form, change):
        """
        Automatically assign contributor
        to the logged-in user when creating a revision.
        """
        if not change:
            obj.contributor = request.user

        super().save_model(request, obj, form, change)

    # --------------------------------------------------------
    # APPROVE ACTION
    # --------------------------------------------------------

    def approve_revisions(self, request, queryset):
        from reviews.services import submit_review
        from reviews.models import Review
        from django.core.exceptions import ValidationError
        from django.contrib import messages

        success = 0

        for revision in queryset:
            try:
                submit_review(
                    revision=revision,
                    reviewer=request.user,
                    decision=Review.Decision.APPROVE,
                    notes="Approved via admin",
                )
                success += 1
            except ValidationError as e:
                self.message_user(
                    request,
                    f"{revision.id}: {e.messages[0]}",
                    messages.ERROR,
                )

        if success:
            self.message_user(
                request,
                f"{success} revision(s) processed for approval.",
                messages.SUCCESS,
            )

    approve_revisions.short_description = "Approve selected revisions"

    # --------------------------------------------------------
    # REJECT ACTION
    # --------------------------------------------------------

    def reject_revisions(self, request, queryset):
        from reviews.services import submit_review
        from reviews.models import Review
        from django.core.exceptions import ValidationError
        from django.contrib import messages

        success = 0

        for revision in queryset:
            try:
                submit_review(
                    revision=revision,
                    reviewer=request.user,
                    decision=Review.Decision.REJECT,
                    notes="Rejected via admin",
                )
                success += 1
            except ValidationError as e:
                self.message_user(
                    request,
                    f"{revision.id}: {e.messages[0]}",
                    messages.ERROR,
                )

        if success:
            self.message_user(
                request,
                f"{success} revision(s) rejected.",
                messages.WARNING,
            )

    reject_revisions.short_description = "Reject selected revisions"

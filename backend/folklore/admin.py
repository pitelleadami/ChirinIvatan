from django import forms
from django.contrib import admin, messages
from django.contrib.admin.helpers import ActionForm
from django.core.exceptions import ValidationError

from .models import FolkloreEntry, FolkloreRevision
from reviews.models import FolkloreReview
from reviews.services import submit_folklore_review


class FolkloreReviewActionForm(ActionForm):
    review_notes = forms.CharField(
        required=False,
        label="Review notes",
        widget=forms.Textarea(attrs={"rows": 2, "cols": 40}),
        help_text="Required for Reject and Flag actions.",
    )


@admin.register(FolkloreEntry)
class FolkloreEntryAdmin(admin.ModelAdmin):
    list_display = (
        'title',
        'category',
        'municipality_source',
        'status',
        'contributor',
        'created_at',
    )
    list_filter = ('status', 'category', 'municipality_source')
    search_fields = ('title', 'content')
    readonly_fields = ('created_at', 'updated_at', 'archived_at', 'contributor')


@admin.register(FolkloreRevision)
class FolkloreRevisionAdmin(admin.ModelAdmin):
    action_form = FolkloreReviewActionForm
    list_display = (
        'id',
        'entry',
        'status',
        'contributor',
        'created_at',
        'approved_at',
    )
    list_filter = ('status',)
    search_fields = ('id',)
    actions = ["approve_revisions", "reject_revisions", "flag_revisions"]
    readonly_fields = (
        'entry',
        'contributor',
        'proposed_data',
        'photo_upload',
        'audio_upload',
        'status',
        'reviewer_notes',
        'is_base_snapshot',
        'created_at',
        'approved_at',
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def _notes_from_action(self, request):
        return (request.POST.get("review_notes") or "").strip()

    def approve_revisions(self, request, queryset):
        success = 0
        notes = self._notes_from_action(request) or "Approved via admin"
        for revision in queryset:
            try:
                submit_folklore_review(
                    revision=revision,
                    reviewer=request.user,
                    decision=FolkloreReview.Decision.APPROVE,
                    notes=notes,
                )
                success += 1
            except ValidationError as exc:
                self.message_user(
                    request,
                    f"{revision.id}: {exc.messages[0]}",
                    messages.ERROR,
                )

        if success:
            self.message_user(
                request,
                f"{success} folklore revision(s) processed for approval.",
                messages.SUCCESS,
            )

    approve_revisions.short_description = "Approve selected revisions"

    def reject_revisions(self, request, queryset):
        notes = self._notes_from_action(request)
        if not notes:
            self.message_user(
                request,
                "Reject action requires review notes in the 'Review notes' field.",
                messages.ERROR,
            )
            return

        success = 0
        for revision in queryset:
            try:
                submit_folklore_review(
                    revision=revision,
                    reviewer=request.user,
                    decision=FolkloreReview.Decision.REJECT,
                    notes=notes,
                )
                success += 1
            except ValidationError as exc:
                self.message_user(
                    request,
                    f"{revision.id}: {exc.messages[0]}",
                    messages.ERROR,
                )

        if success:
            self.message_user(
                request,
                f"{success} folklore revision(s) rejected.",
                messages.WARNING,
            )

    reject_revisions.short_description = "Reject selected revisions"

    def flag_revisions(self, request, queryset):
        notes = self._notes_from_action(request)
        if not notes:
            self.message_user(
                request,
                "Flag action requires review notes in the 'Review notes' field.",
                messages.ERROR,
            )
            return

        success = 0
        for revision in queryset:
            try:
                submit_folklore_review(
                    revision=revision,
                    reviewer=request.user,
                    decision=FolkloreReview.Decision.FLAG,
                    notes=notes,
                )
                success += 1
            except ValidationError as exc:
                self.message_user(
                    request,
                    f"{revision.id}: {exc.messages[0]}",
                    messages.ERROR,
                )

        if success:
            self.message_user(
                request,
                f"{success} folklore revision(s) flagged for re-review.",
                messages.INFO,
            )

    flag_revisions.short_description = "Flag selected revisions for re-review"

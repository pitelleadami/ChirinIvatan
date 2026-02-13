from django import forms
from django.contrib import admin, messages
from django.contrib.admin.helpers import ActionForm
from django.core.exceptions import ValidationError

from dictionary.models import Entry, EntryRevision
from reviews.models import Review
from reviews.services import submit_review


class ReviewActionForm(ActionForm):
    review_notes = forms.CharField(
        required=False,
        label="Review notes",
        widget=forms.Textarea(attrs={"rows": 2, "cols": 40}),
        help_text="Required for Reject and Flag actions.",
    )


class EntryRevisionAdminForm(forms.ModelForm):
    term = forms.CharField(required=True)
    meaning = forms.CharField(required=False, widget=forms.Textarea)
    part_of_speech = forms.CharField(required=False)
    pronunciation_text = forms.CharField(required=False)
    audio_pronunciation = forms.FileField(required=False)
    audio_source = forms.CharField(required=False, widget=forms.Textarea)
    audio_source_is_self_recorded = forms.BooleanField(required=False)
    variant_type = forms.CharField(required=False)
    usage_notes = forms.CharField(required=False, widget=forms.Textarea)
    etymology = forms.CharField(required=False, widget=forms.Textarea)
    example_sentence = forms.CharField(required=False, widget=forms.Textarea)
    example_translation = forms.CharField(required=False, widget=forms.Textarea)
    source_text = forms.CharField(required=False, widget=forms.Textarea)
    term_source_is_self_knowledge = forms.BooleanField(required=False)
    inflected_forms = forms.JSONField(required=False)
    photo = forms.ImageField(required=False)
    photo_source = forms.CharField(required=False, widget=forms.Textarea)
    photo_source_is_contributor_owned = forms.BooleanField(required=False)
    english_synonym = forms.CharField(required=False)
    ivatan_synonym = forms.CharField(required=False)
    english_antonym = forms.CharField(required=False)
    ivatan_antonym = forms.CharField(required=False)

    class Meta:
        model = EntryRevision
        fields = ("entry", "status", "reviewer_notes")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        snapshot = dict(self.instance.proposed_data or {})

        if self.instance.entry_id and not snapshot:
            entry = self.instance.entry
            snapshot = {
                "term": entry.term,
                "meaning": entry.meaning,
                "part_of_speech": entry.part_of_speech,
                "pronunciation_text": entry.pronunciation_text,
                "audio_source": entry.audio_source,
                "audio_source_is_self_recorded": entry.audio_source_is_self_recorded,
                "variant_type": entry.variant_type,
                "usage_notes": entry.usage_notes,
                "etymology": entry.etymology,
                "example_sentence": entry.example_sentence,
                "example_translation": entry.example_translation,
                "source_text": entry.source_text,
                "term_source_is_self_knowledge": entry.term_source_is_self_knowledge,
                "inflected_forms": entry.inflected_forms,
                "photo_source": entry.photo_source,
                "photo_source_is_contributor_owned": entry.photo_source_is_contributor_owned,
                "english_synonym": entry.english_synonym,
                "ivatan_synonym": entry.ivatan_synonym,
                "english_antonym": entry.english_antonym,
                "ivatan_antonym": entry.ivatan_antonym,
                "audio_pronunciation": entry.audio_pronunciation.name
                if entry.audio_pronunciation
                else "",
                "photo": entry.photo.name if entry.photo else "",
            }

        for field_name in (
            "term",
            "meaning",
            "part_of_speech",
            "pronunciation_text",
            "audio_source",
            "variant_type",
            "usage_notes",
            "etymology",
            "example_sentence",
            "example_translation",
            "source_text",
            "inflected_forms",
            "photo_source",
            "english_synonym",
            "ivatan_synonym",
            "english_antonym",
            "ivatan_antonym",
        ):
            self.fields[field_name].initial = snapshot.get(field_name)

        self.fields["audio_source_is_self_recorded"].initial = snapshot.get(
            "audio_source_is_self_recorded",
            False,
        )
        self.fields["term_source_is_self_knowledge"].initial = snapshot.get(
            "term_source_is_self_knowledge",
            False,
        )
        self.fields["photo_source_is_contributor_owned"].initial = snapshot.get(
            "photo_source_is_contributor_owned",
            False,
        )

    def save(self, commit=True):
        instance = super().save(commit=False)
        proposed_data = dict(instance.proposed_data or {})

        for field_name in (
            "term",
            "meaning",
            "part_of_speech",
            "pronunciation_text",
            "audio_source",
            "variant_type",
            "usage_notes",
            "etymology",
            "example_sentence",
            "example_translation",
            "source_text",
            "inflected_forms",
            "photo_source",
            "english_synonym",
            "ivatan_synonym",
            "english_antonym",
            "ivatan_antonym",
        ):
            proposed_data[field_name] = self.cleaned_data.get(field_name)

        proposed_data["audio_source_is_self_recorded"] = bool(
            self.cleaned_data.get("audio_source_is_self_recorded")
        )
        proposed_data["term_source_is_self_knowledge"] = bool(
            self.cleaned_data.get("term_source_is_self_knowledge")
        )
        proposed_data["photo_source_is_contributor_owned"] = bool(
            self.cleaned_data.get("photo_source_is_contributor_owned")
        )

        audio_file = self.cleaned_data.get("audio_pronunciation")
        photo_file = self.cleaned_data.get("photo")
        if audio_file:
            proposed_data["audio_pronunciation"] = audio_file.name
        if photo_file:
            proposed_data["photo"] = photo_file.name

        instance.proposed_data = proposed_data
        if commit:
            instance.save()
            self.save_m2m()
        return instance


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
    action_form = ReviewActionForm
    form = EntryRevisionAdminForm
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
    fields = (
        "entry",
        "status",
        "reviewer_notes",
        "term",
        "meaning",
        "part_of_speech",
        "pronunciation_text",
        "audio_pronunciation",
        "audio_source",
        "audio_source_is_self_recorded",
        "variant_type",
        "usage_notes",
        "etymology",
        "example_sentence",
        "example_translation",
        "source_text",
        "term_source_is_self_knowledge",
        "inflected_forms",
        "photo",
        "photo_source",
        "photo_source_is_contributor_owned",
        "english_synonym",
        "ivatan_synonym",
        "english_antonym",
        "ivatan_antonym",
        "contributor",
        "created_at",
        "approved_at",
    )
    actions = ["approve_revisions", "reject_revisions", "flag_revisions"]

    def get_term(self, obj):
        if obj.proposed_data and obj.proposed_data.get("term"):
            return obj.proposed_data.get("term")
        if obj.entry:
            return obj.entry.term
        return "New Submission"

    get_term.short_description = "Term"

    def save_model(self, request, obj, form, change):
        if not change and not obj.contributor_id:
            obj.contributor = request.user
        super().save_model(request, obj, form, change)

    def _notes_from_action(self, request):
        return (request.POST.get("review_notes") or "").strip()

    def approve_revisions(self, request, queryset):
        success = 0
        notes = self._notes_from_action(request) or "Approved via admin"
        for revision in queryset:
            try:
                submit_review(
                    revision=revision,
                    reviewer=request.user,
                    decision=Review.Decision.APPROVE,
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
                f"{success} revision(s) processed for approval.",
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
                submit_review(
                    revision=revision,
                    reviewer=request.user,
                    decision=Review.Decision.REJECT,
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
                f"{success} revision(s) rejected.",
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
                submit_review(
                    revision=revision,
                    reviewer=request.user,
                    decision=Review.Decision.FLAG,
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
                f"{success} revision(s) flagged for re-review.",
                messages.INFO,
            )

    flag_revisions.short_description = "Flag selected revisions for re-review"

from django.contrib import admin
from .models import DictionaryEntry, AudioPronunciation, DictionaryRevision
from reviews.models import Review


# =========================
# VARIANT INLINE
# =========================
class VariantInline(admin.TabularInline):
    model = DictionaryEntry
    fk_name = 'parent_term'
    extra = 0
    verbose_name = "Variant"
    verbose_name_plural = "Variants"

    def get_formset(self, request, obj=None, **kwargs):
        formset = super().get_formset(request, obj, **kwargs)
        # Prevent creating GENERAL inside variants
        formset.form.base_fields['variant'].choices = [
            c for c in formset.form.base_fields['variant'].choices
            if c[0] != DictionaryEntry.Variant.GENERAL
        ]
        return formset


# =========================
# DICTIONARY ENTRY ADMIN
# =========================
@admin.register(DictionaryEntry)
class DictionaryEntryAdmin(admin.ModelAdmin):
    list_display = (
        'ivatan_term',
        'variant',
        'part_of_speech',
        'status',
        'contributor',
        'created_at',
    )

    list_filter = ('status', 'variant', 'part_of_speech')
    search_fields = ('ivatan_term', 'english_meaning')

    readonly_fields = ('created_at', 'updated_at', 'last_revised_by')

    actions = ('approve_entries', 'reject_entries')

    def get_inlines(self, request, obj):
        # ONLY show variants under GENERAL Ivatan
        if obj and obj.variant == DictionaryEntry.Variant.GENERAL:
            return [VariantInline]
        return []

    def get_readonly_fields(self, request, obj=None):
        ro = list(self.readonly_fields)
        # Variants cannot redefine meaning or POS
        if obj and obj.parent_term:
            ro.extend(['english_meaning', 'part_of_speech'])
        return ro

    def approve_entries(self, request, queryset):
        for entry in queryset.filter(status=DictionaryEntry.Status.PENDING):
            entry.status = DictionaryEntry.Status.APPROVED
            entry.save(update_fields=['status'])
            Review.objects.create(
                reviewer=request.user,
                content_type='dictionary_entry',
                object_id=entry.id,
                decision='approved',
                comments='Approved via admin'
            )

    def reject_entries(self, request, queryset):
        for entry in queryset.filter(status=DictionaryEntry.Status.PENDING):
            entry.status = DictionaryEntry.Status.REJECTED
            entry.save(update_fields=['status'])
            Review.objects.create(
                reviewer=request.user,
                content_type='dictionary_entry',
                object_id=entry.id,
                decision='rejected',
                comments='Rejected via admin'
            )


# =========================
# AUDIO PRONUNCIATION ADMIN
# =========================
@admin.register(AudioPronunciation)
class AudioPronunciationAdmin(admin.ModelAdmin):
    list_display = ('dictionary_entry', 'status', 'contributor', 'created_at')
    list_filter = ('status',)
    readonly_fields = ('created_at',)
    actions = ('approve_audio', 'reject_audio')

    def approve_audio(self, request, queryset):
        for audio in queryset.filter(status=AudioPronunciation.Status.PENDING):
            audio.status = AudioPronunciation.Status.APPROVED
            audio.save(update_fields=['status'])
            Review.objects.create(
                reviewer=request.user,
                content_type='audio_pronunciation',
                object_id=audio.id,
                decision='approved',
                comments='Audio approved'
            )

    def reject_audio(self, request, queryset):
        for audio in queryset.filter(status=AudioPronunciation.Status.PENDING):
            audio.status = AudioPronunciation.Status.REJECTED
            audio.save(update_fields=['status'])
            Review.objects.create(
                reviewer=request.user,
                content_type='audio_pronunciation',
                object_id=audio.id,
                decision='rejected',
                comments='Audio rejected'
            )


# =========================
# DICTIONARY REVISION ADMIN
# =========================
@admin.register(DictionaryRevision)
class DictionaryRevisionAdmin(admin.ModelAdmin):
    list_display = ('dictionary_entry', 'revised_by', 'status', 'created_at')
    list_filter = ('status',)
    readonly_fields = ('created_at',)
    actions = ('approve_revisions', 'reject_revisions')

    def approve_revisions(self, request, queryset):
        for rev in queryset.filter(status=DictionaryRevision.Status.PENDING):
            entry = rev.dictionary_entry
            for field in [
                'english_meaning',
                'example_sentence',
                'example_translation',
                'usage_notes',
                'synonyms',
                'antonyms',
                'etymology',
            ]:
                val = getattr(rev, field)
                if val:
                    setattr(entry, field, val)

            entry.last_revised_by = rev.revised_by
            entry.save()
            rev.status = DictionaryRevision.Status.APPROVED
            rev.save()

    def reject_revisions(self, request, queryset):
        queryset.update(status=DictionaryRevision.Status.REJECTED)

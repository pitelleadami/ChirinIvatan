from django.contrib import admin
from .models import DictionaryEntry, AudioPronunciation, DictionaryRevision
from reviews.models import Review


@admin.register(DictionaryEntry)
class DictionaryEntryAdmin(admin.ModelAdmin):
    list_display = (
        'ivatan_term',
        'part_of_speech',
        'variant',
        'status',
        'contributor',
        'created_at',
    )
    list_filter = ('status', 'variant', 'part_of_speech')
    search_fields = ('ivatan_term', 'english_meaning')
    readonly_fields = ('created_at', 'updated_at')
    actions = ['approve_entries', 'reject_entries']

    def approve_entries(self, request, queryset):
        for entry in queryset.filter(status='pending'):
            entry.status = 'approved'
            entry.save(update_fields=['status'])
            Review.objects.create(
                reviewer=request.user,
                content_type='dictionary_entry',
                object_id=entry.id,
                decision='approved',
                comments='Approved via admin review'
            )
    approve_entries.short_description = "Approve selected dictionary entries"

    def reject_entries(self, request, queryset):
        for entry in queryset.filter(status='pending'):
            entry.status = 'rejected'
            entry.save(update_fields=['status'])
            Review.objects.create(
                reviewer=request.user,
                content_type='dictionary_entry',
                object_id=entry.id,
                decision='rejected',
                comments='Rejected via admin review'
            )
    reject_entries.short_description = "Reject selected dictionary entries"


@admin.register(AudioPronunciation)
class AudioPronunciationAdmin(admin.ModelAdmin):
    list_display = (
        'dictionary_entry',
        'status',
        'contributor',
        'created_at',
    )
    list_filter = ('status',)
    readonly_fields = ('created_at',)
    actions = ['approve_audio', 'reject_audio']

    def approve_audio(self, request, queryset):
        for audio in queryset.filter(status='pending'):
            audio.status = 'approved'
            audio.save(update_fields=['status'])
            Review.objects.create(
                reviewer=request.user,
                content_type='audio_pronunciation',
                object_id=audio.id,
                decision='approved',
                comments='Audio approved via admin review'
            )
    approve_audio.short_description = "Approve selected audio pronunciations"

    def reject_audio(self, request, queryset):
        for audio in queryset.filter(status='pending'):
            audio.status = 'rejected'
            audio.save(update_fields=['status'])
            Review.objects.create(
                reviewer=request.user,
                content_type='audio_pronunciation',
                object_id=audio.id,
                decision='rejected',
                comments='Audio rejected via admin review'
            )
    reject_audio.short_description = "Reject selected audio pronunciations"


@admin.register(DictionaryRevision)
class DictionaryRevisionAdmin(admin.ModelAdmin):
    list_display = (
        'dictionary_entry',
        'revised_by',
        'status',
        'created_at',
    )
    list_filter = ('status',)
    readonly_fields = ('created_at',)
    actions = ['approve_revisions', 'reject_revisions']

    def approve_revisions(self, request, queryset):
        for rev in queryset.filter(status='pending'):
            entry = rev.dictionary_entry

            # Apply only fields that were provided
            for field in [
                'english_meaning',
                'example_sentence',
                'usage_notes',
                'synonyms',
                'antonyms',
                'etymology',
            ]:
                value = getattr(rev, field)
                if value:
                    setattr(entry, field, value)

            entry.last_revised_by = rev.revised_by
            entry.save()

            rev.status = 'approved'
            rev.save()

            Review.objects.create(
                reviewer=request.user,
                content_type='dictionary_revision',
                object_id=rev.id,
                decision='approved',
                comments='Revision approved and applied'
            )

    approve_revisions.short_description = "Approve selected dictionary revisions"

    def reject_revisions(self, request, queryset):
        for rev in queryset.filter(status='pending'):
            rev.status = 'rejected'
            rev.save()

            Review.objects.create(
                reviewer=request.user,
                content_type='dictionary_revision',
                object_id=rev.id,
                decision='rejected',
                comments='Revision rejected'
            )

    reject_revisions.short_description = "Reject selected dictionary revisions"

from django.contrib import admin
from .models import DictionaryEntry, AudioPronunciation


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

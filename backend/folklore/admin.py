from django.contrib import admin
from .models import FolkloreEntry


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
    readonly_fields = ('created_at', 'updated_at')

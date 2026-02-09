from django.contrib import admin
from .models import FolkloreEntry
from reviews.models import Review


@admin.register(FolkloreEntry)
class FolkloreEntryAdmin(admin.ModelAdmin):
    list_display = (
        'title',
        'category',
        'variant',
        'status',
        'contributor',
        'created_at',
    )
    list_filter = ('status', 'category', 'variant')
    search_fields = ('title', 'content')
    readonly_fields = ('created_at', 'updated_at')
    actions = ['approve_entries', 'reject_entries']

    def approve_entries(self, request, queryset):
        for entry in queryset.filter(status='pending'):
            entry.status = 'approved'
            entry.save(update_fields=['status'])
            Review.objects.create(
                reviewer=request.user,
                content_type='folklore_entry',
                object_id=entry.id,
                decision='approved',
                comments='Approved via admin review'
            )
    approve_entries.short_description = "Approve selected folklore entries"

    def reject_entries(self, request, queryset):
        for entry in queryset.filter(status='pending'):
            entry.status = 'rejected'
            entry.save(update_fields=['status'])
            Review.objects.create(
                reviewer=request.user,
                content_type='folklore_entry',
                object_id=entry.id,
                decision='rejected',
                comments='Rejected via admin review'
            )
    reject_entries.short_description = "Reject selected folklore entries"

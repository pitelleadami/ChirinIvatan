from django.contrib import admin
from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = (
        'content_type',
        'decision',
        'reviewer',
        'reviewed_at',
    )
    list_filter = ('content_type', 'decision')
    readonly_fields = ('reviewed_at',)

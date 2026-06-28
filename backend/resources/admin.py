from django.contrib import admin

from resources.models import ResourceDocument


@admin.register(ResourceDocument)
class ResourceDocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "visibility", "is_published", "updated_at")
    list_filter = ("visibility", "is_published", "category")
    search_fields = ("title", "description", "category")
    readonly_fields = ("created_at", "updated_at", "uploaded_by")

    def save_model(self, request, obj, form, change):
        if not obj.uploaded_by_id:
            obj.uploaded_by = request.user
        super().save_model(request, obj, form, change)

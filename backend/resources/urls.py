from django.urls import path

from resources.views import (
    admin_resource_detail_view,
    admin_resources_view,
    resource_download_view,
    resources_list_view,
)

urlpatterns = [
    path("api/admin/resources", admin_resources_view, name="admin_resources"),
    path(
        "api/admin/resources/<uuid:resource_id>",
        admin_resource_detail_view,
        name="admin_resource_detail",
    ),
    path("api/resources", resources_list_view, name="resources_list"),
    path(
        "api/resources/<slug:slug>/download",
        resource_download_view,
        name="resource_download",
    ),
]

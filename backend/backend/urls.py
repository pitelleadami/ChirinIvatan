"""
URL configuration for backend project.
"""

from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static
from django.shortcuts import redirect

from dictionary.views import public_dictionary


def frontend_redirect(request, route=""):
    suffix = f"/{route}" if route else ""
    query = f"?{request.META.get('QUERY_STRING')}" if request.META.get("QUERY_STRING") else ""
    return redirect(f"{settings.FRONTEND_BASE_URL}{suffix}{query}")


urlpatterns = [
    path('', public_dictionary, name='public_dictionary'),
    path("login", frontend_redirect, {"route": "login"}, name="frontend_login"),
    path("about", frontend_redirect, {"route": "about"}, name="frontend_about"),
    path("yaru", frontend_redirect, {"route": "yaru"}, name="frontend_yaru"),
    path("faqs", frontend_redirect, {"route": "faqs"}, name="frontend_faqs"),
    path("manual", frontend_redirect, {"route": "faqs"}, name="frontend_manual"),
    path("dashboard", frontend_redirect, {"route": "dashboard"}, name="frontend_dashboard"),
    path("admin-applications", frontend_redirect, {"route": "admin-applications"}, name="frontend_admin_applications"),
    path("dictionary-view", frontend_redirect, {"route": "dictionary-view"}, name="frontend_dictionary_view"),
    path("dictionary-draft", frontend_redirect, {"route": "dictionary-draft"}, name="frontend_dictionary_draft"),
    path("folklore-view", frontend_redirect, {"route": "folklore-view"}, name="frontend_folklore_view"),
    path("folklore-draft", frontend_redirect, {"route": "folklore-draft"}, name="frontend_folklore_draft"),
    path("profile-view", frontend_redirect, {"route": "profile-view"}, name="frontend_profile_view"),
    path("profile-edit", frontend_redirect, {"route": "profile-edit"}, name="frontend_profile_edit"),
    path("leaderboards", frontend_redirect, {"route": "leaderboards"}, name="frontend_leaderboards"),
    path("roles", frontend_redirect, {"route": "roles"}, name="frontend_roles"),
    path("", include("users.urls")),
    path("", include("dictionary.urls")),
    path("", include("folklore.urls")),
    path("", include("reviews.urls")),
    path('admin/', admin.site.urls),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT
    )

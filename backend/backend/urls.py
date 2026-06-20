"""
URL configuration for backend project.
"""

from urllib.parse import urlparse

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.http import HttpResponse
from django.shortcuts import redirect
from django.urls import include, path
from django.utils.html import escape

from dictionary.views import public_dictionary


def frontend_redirect(request, route=""):
    suffix = f"/{route}" if route else ""
    query = f"?{request.META.get('QUERY_STRING')}" if request.META.get("QUERY_STRING") else ""
    return redirect(f"{settings.FRONTEND_BASE_URL}{suffix}{query}")


def share_preview(request):
    site_url = settings.FRONTEND_BASE_URL.rstrip("/")
    raw_target = request.GET.get("target") or site_url
    raw_image = request.GET.get("image") or f"{site_url}/og-image.jpg"

    def same_site_url(value, fallback):
        parsed = urlparse(value)
        if not parsed.netloc:
            path = value if value.startswith("/") else f"/{value}"
            return f"{site_url}{path}"
        if parsed.scheme in {"http", "https"} and parsed.netloc in {
            "chirinivatan.com",
            "www.chirinivatan.com",
        }:
            return value
        return fallback

    target_url = same_site_url(raw_target, site_url)
    image_url = same_site_url(raw_image, f"{site_url}/og-image.jpg")
    preview_url = request.build_absolute_uri()
    title = (request.GET.get("title") or "Chirin Ivatan").strip()[:180]
    description = (
        request.GET.get("description")
        or "Ivatan Cultural Digital Archive - preserving the language, folklore, and traditions of Batanes."
    ).strip()[:300]

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape(title)}</title>
  <meta name="description" content="{escape(description)}" />
  <link rel="canonical" href="{escape(target_url)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Chirin Ivatan" />
  <meta property="og:url" content="{escape(preview_url)}" />
  <meta property="og:title" content="{escape(title)}" />
  <meta property="og:description" content="{escape(description)}" />
  <meta property="og:image" content="{escape(image_url)}" />
  <meta property="og:image:secure_url" content="{escape(image_url)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{escape(title)}" />
  <meta name="twitter:description" content="{escape(description)}" />
  <meta name="twitter:image" content="{escape(image_url)}" />
  <meta http-equiv="refresh" content="1;url={escape(target_url)}" />
</head>
<body>
  <p>Opening <a href="{escape(target_url)}">Chirin Ivatan</a>...</p>
  <script>window.location.replace({target_url!r});</script>
</body>
</html>"""
    return HttpResponse(html)


urlpatterns = [
    path("", public_dictionary, name="public_dictionary"),
    path("share/preview", share_preview, name="share_preview"),
    path("login", frontend_redirect, {"route": "login"}, name="frontend_login"),
    path("about", frontend_redirect, {"route": "about"}, name="frontend_about"),
    path("yaru", frontend_redirect, {"route": "yaru"}, name="frontend_yaru"),
    path("faqs", frontend_redirect, {"route": "faqs"}, name="frontend_faqs"),
    path("manual", frontend_redirect, {"route": "faqs"}, name="frontend_manual"),
    path("dashboard", frontend_redirect, {"route": "dashboard"}, name="frontend_dashboard"),
    path(
        "admin-applications",
        frontend_redirect,
        {"route": "admin-applications"},
        name="frontend_admin_applications",
    ),
    path(
        "dictionary-view",
        frontend_redirect,
        {"route": "dictionary-view"},
        name="frontend_dictionary_view",
    ),
    path(
        "dictionary-draft",
        frontend_redirect,
        {"route": "dictionary-draft"},
        name="frontend_dictionary_draft",
    ),
    path(
        "folklore-view",
        frontend_redirect,
        {"route": "folklore-view"},
        name="frontend_folklore_view",
    ),
    path(
        "folklore-draft",
        frontend_redirect,
        {"route": "folklore-draft"},
        name="frontend_folklore_draft",
    ),
    path(
        "profile-view", frontend_redirect, {"route": "profile-view"}, name="frontend_profile_view"
    ),
    path(
        "profile-edit", frontend_redirect, {"route": "profile-edit"}, name="frontend_profile_edit"
    ),
    path(
        "leaderboards", frontend_redirect, {"route": "leaderboards"}, name="frontend_leaderboards"
    ),
    path("roles", frontend_redirect, {"route": "roles"}, name="frontend_roles"),
    path("", include("users.urls")),
    path("", include("dictionary.urls")),
    path("", include("folklore.urls")),
    path("", include("reviews.urls")),
    path(
        "accounts/reset/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(),
        name="password_reset_confirm",
    ),
    path(
        "accounts/reset/done/",
        auth_views.PasswordResetCompleteView.as_view(),
        name="password_reset_complete",
    ),
    path("admin/", admin.site.urls),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

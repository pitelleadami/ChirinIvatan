"""
URL configuration for backend project.
"""

from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static

from dictionary.views import public_dictionary

urlpatterns = [
    path('', public_dictionary, name='public_dictionary'),
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

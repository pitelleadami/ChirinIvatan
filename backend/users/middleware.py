from django.db import OperationalError, ProgrammingError
from django.http import JsonResponse

from users.models import SiteContentSettings


class MaintenanceModeMiddleware:
    """
    Block non-admin API activity while the public site is paused.

    The React app also shows a visitor-facing maintenance page. This backend
    guard prevents old browser tabs from continuing write/read workflows during
    maintenance while keeping login, admin, and the site-content status API open.
    """

    ALLOWED_PREFIXES = (
        "/admin/",
        "/api/auth/csrf",
        "/api/auth/login",
        "/api/auth/logout",
        "/api/auth/me",
        "/api/site-content",
        "/static/",
        "/media/",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._is_allowed_path(request.path):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if user and user.is_authenticated and (
            user.is_superuser or user.groups.filter(name="Admin").exists()
        ):
            return self.get_response(request)

        try:
            settings = SiteContentSettings.objects.filter(key="default").only(
                "maintenance_enabled",
                "maintenance_message",
            ).first()
        except (OperationalError, ProgrammingError):
            return self.get_response(request)

        if not settings or not settings.maintenance_enabled:
            return self.get_response(request)

        response = JsonResponse(
            {
                "detail": settings.maintenance_message
                or "Chirin Ivatan is temporarily paused for maintenance.",
                "maintenance_enabled": True,
            },
            status=503,
        )
        response["Retry-After"] = "300"
        return response

    def _is_allowed_path(self, path):
        return any(path.startswith(prefix) for prefix in self.ALLOWED_PREFIXES)

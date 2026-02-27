from django.apps import AppConfig


class UsersConfig(AppConfig):
    """
    Django app configuration for `users`.

    Why `ready()` matters:
    - Django does not auto-import signal modules.
    - importing `users.signals` here registers signal handlers at startup.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = 'users'

    def ready(self):
        # Side-effect import:
        # registers signal receivers (post_save hooks).
        # Without this line, event-driven gamification recompute will not trigger.
        from users import signals  # noqa: F401

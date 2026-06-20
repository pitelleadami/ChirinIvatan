from users.models import Notification


def notify(*, user, notif_type, message, target_url=""):
    return Notification.objects.create(
        user=user,
        notif_type=notif_type,
        message=message,
        target_url=target_url,
    )

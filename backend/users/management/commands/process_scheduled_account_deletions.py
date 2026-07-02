from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from users.models import AdminAccountAction, UserProfile

User = get_user_model()


def anonymized_username(user):
    return f"deleted-account-{str(user.id)[:8]}"


def anonymize_user(user):
    username = anonymized_username(user)
    suffix = 2
    candidate = username
    while User.objects.filter(username=candidate).exclude(id=user.id).exists():
        candidate = f"{username}-{suffix}"
        suffix += 1

    user.username = candidate
    user.email = ""
    user.first_name = "Former"
    user.last_name = "Contributor"
    user.is_active = False
    user.is_staff = False
    user.is_superuser = False
    user.set_unusable_password()
    user.save(
        update_fields=[
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "password",
        ]
    )
    user.groups.clear()

    profile = UserProfile.objects.filter(user=user).first()
    if profile:
        profile.name_extension = ""
        profile.post_nominals = ""
        profile.affiliation = ""
        profile.occupation = ""
        profile.bio = ""
        profile.cultural_affiliations = []
        profile.other_affiliations = []
        profile.include_in_leaderboard = False
        profile.show_on_yaru_chart = False
        profile.show_live_contributions = False
        profile.save(
            update_fields=[
                "name_extension",
                "post_nominals",
                "affiliation",
                "occupation",
                "bio",
                "cultural_affiliations",
                "other_affiliations",
                "include_in_leaderboard",
                "show_on_yaru_chart",
                "show_live_contributions",
            ]
        )

    return user


class Command(BaseCommand):
    help = "Anonymize accounts whose 30-day scheduled deletion appeal window has expired."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List due accounts without changing them.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        now = timezone.now()
        due_actions = (
            AdminAccountAction.objects.select_related("target_user", "admin")
            .filter(
                action=AdminAccountAction.Action.SCHEDULE_ACCOUNT_DELETION,
                deletion_status=AdminAccountAction.DeletionStatus.PENDING,
                scheduled_for__lte=now,
            )
            .order_by("scheduled_for", "created_at")
        )

        count = 0
        for action in due_actions:
            user = action.target_user
            self.stdout.write(f"{user.username} due since {action.scheduled_for}")
            if dry_run:
                continue
            with transaction.atomic():
                action = AdminAccountAction.objects.select_for_update().get(id=action.id)
                if action.deletion_status != AdminAccountAction.DeletionStatus.PENDING:
                    continue
                user = User.objects.select_for_update().get(id=action.target_user_id)
                before_username = user.username
                anonymize_user(user)
                action.deletion_status = AdminAccountAction.DeletionStatus.COMPLETED
                action.completed_at = now
                action.status_after = "account_anonymized"
                action.save(update_fields=["deletion_status", "completed_at", "status_after"])
                AdminAccountAction.objects.create(
                    target_user=user,
                    admin=action.admin,
                    action=AdminAccountAction.Action.COMPLETE_ACCOUNT_DELETION,
                    notes=f"Scheduled deletion completed for @{before_username}.",
                    status_before=before_username,
                    status_after=user.username,
                    deletion_status=AdminAccountAction.DeletionStatus.COMPLETED,
                    deletion_reason=action.deletion_reason,
                    scheduled_for=action.scheduled_for,
                    completed_at=now,
                )
                count += 1

        verb = "would process" if dry_run else "processed"
        self.stdout.write(self.style.SUCCESS(f"{verb} {count} scheduled account deletion(s)."))

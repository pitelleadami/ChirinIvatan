"""
Management command: recompute_gamification

Use when:
- you changed rules/config and need fresh stats
- you imported historical data and want consistent levels/badges
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from users.recognition import recompute_user_gamification


class Command(BaseCommand):
    help = "Recompute gamification stats, levels, badges, and municipality aggregates for all users."

    def handle(self, *args, **options):
        User = get_user_model()
        count = 0
        for user in User.objects.all().iterator():
            recompute_user_gamification(user)
            count += 1

        self.stdout.write(self.style.SUCCESS(f"Gamification recompute complete for {count} users."))

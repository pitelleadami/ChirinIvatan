"""
Management command: audit_gamification_integrity

Compares pre-recompute and post-recompute user stats to detect mismatches.
Useful for integrity checks after migrations or rule updates.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from users.recognition import recompute_user_gamification


class Command(BaseCommand):
    help = (
        "Audit gamification aggregates by recomputing expected values and reporting mismatches "
        "for user contribution stats."
    )

    def handle(self, *args, **options):
        User = get_user_model()
        mismatches = []
        checked = 0

        for user in User.objects.select_related("contribution_stats").iterator():
            checked += 1
            existing = getattr(user, "contribution_stats", None)
            if not existing:
                recompute_user_gamification(user)
                existing = user.contribution_stats

            before = {
                "combined_total": existing.combined_total,
                "dictionary_original_total": existing.dictionary_original_total,
                "folklore_original_total": existing.folklore_original_total,
                "total_rejections": existing.total_rejections,
                "review_completed_total": existing.review_completed_total,
                "dictionary_month": existing.dictionary_month,
                "folklore_month": existing.folklore_month,
                "combined_month": existing.combined_month,
            }

            recompute_user_gamification(user)
            existing.refresh_from_db()

            after = {
                "combined_total": existing.combined_total,
                "dictionary_original_total": existing.dictionary_original_total,
                "folklore_original_total": existing.folklore_original_total,
                "total_rejections": existing.total_rejections,
                "review_completed_total": existing.review_completed_total,
                "dictionary_month": existing.dictionary_month,
                "folklore_month": existing.folklore_month,
                "combined_month": existing.combined_month,
            }

            if before != after:
                mismatches.append(
                    {
                        "username": user.username,
                        "before": before,
                        "after": after,
                    }
                )

        self.stdout.write(f"Checked users: {checked}")
        if mismatches:
            self.stdout.write(self.style.WARNING(f"Mismatches found: {len(mismatches)}"))
            for item in mismatches:
                self.stdout.write(f"- {item['username']}: {item['before']} -> {item['after']}")
        else:
            self.stdout.write(self.style.SUCCESS("No mismatches detected."))

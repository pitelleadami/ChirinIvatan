"""
seed_e2e_testdata

Creates dedicated, throwaway accounts and one pending dictionary submission for
the Playwright end-to-end suite (visitor / contributor / reviewer flows).

SAFETY
------
- Only ever touches accounts whose username starts with ``e2e_``. It never
  modifies, reads passwords of, or deletes any pre-existing real account.
- Refuses to run unless the active database is SQLite *and* DEBUG is True.
  Production runs on Postgres with DEBUG off, so this command aborts there.
- Idempotent: safe to run repeatedly.

Usage:
    python manage.py seed_e2e_testdata
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from dictionary.models import EntryRevision
from folklore.models import FolkloreRevision

User = get_user_model()

# Single shared password for all throwaway accounts. These accounts only exist
# in a local SQLite dev database; they are never created in production.
E2E_PASSWORD = "e2e-test-pass-1234"

# username -> (group name or None, is_staff, is_superuser)
E2E_ACCOUNTS = {
    "e2e_contributor": ("Contributor", False, False),
    "e2e_reviewer1": ("Reviewer", False, False),
    "e2e_reviewer2": ("Reviewer", False, False),
    "e2e_admin": ("Admin", True, False),
}

PENDING_TERM = "e2e_pending_term"
PENDING_FOLKLORE_TITLE = "e2e_pending_folklore"
# A deterministic, already-published dictionary entry the visitor tests search
# for (so they don't depend on incidental local data or list pagination).
PUBLISHED_TERM = "Ekspublistest"
PUBLISHED_MEANING = "A seeded published dictionary entry for end-to-end tests."


class Command(BaseCommand):
    help = "Seed throwaway accounts + a pending submission for the local Playwright E2E suite."

    def handle(self, *args, **options):
        self._abort_if_production()

        with transaction.atomic():
            self._seed_accounts()
            self._unlock_beta_gate()
            self._seed_pending_dictionary_revision()
            self._seed_pending_folklore_revision()
            self._seed_published_dictionary_entry()

        self.stdout.write(self.style.SUCCESS("E2E test data seeded (local SQLite only)."))
        self.stdout.write(
            "Accounts (password for all): "
            + E2E_PASSWORD
            + "\n  "
            + "\n  ".join(sorted(E2E_ACCOUNTS))
        )

    # ── safety ────────────────────────────────────────────────────────────
    def _abort_if_production(self):
        engine = connection.settings_dict.get("ENGINE", "")
        if "sqlite" not in engine:
            raise CommandError(
                f"Refusing to run: database engine is '{engine}', not SQLite. "
                "This command is for the local dev database only."
            )
        if not settings.DEBUG:
            raise CommandError(
                "Refusing to run: DEBUG is False. This command is for local development only."
            )

    # ── accounts ──────────────────────────────────────────────────────────
    def _seed_accounts(self):
        for username, (group_name, is_staff, is_superuser) in E2E_ACCOUNTS.items():
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": f"{username}@example.test",
                    "first_name": username.replace("e2e_", "E2E ").title(),
                    "is_staff": is_staff,
                    "is_superuser": is_superuser,
                },
            )
            # Always reset to a known good state (these are throwaway accounts).
            user.is_active = True
            user.is_staff = is_staff
            user.is_superuser = is_superuser
            user.set_password(E2E_PASSWORD)
            user.save()

            user.groups.clear()
            if group_name:
                group, _ = Group.objects.get_or_create(name=group_name)
                user.groups.add(group)

            # Suppress the "Set up your public profile?" onboarding modal so it
            # doesn't block automated interaction. (Real flow is covered by the
            # frontend; tests dismiss defensively too.)
            from users.models import UserProfile

            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.onboarding_prompt_pending = False
            profile.onboarding_prompt_dismissed = True
            profile.save(update_fields=["onboarding_prompt_pending", "onboarding_prompt_dismissed"])

            verb = "Created" if created else "Updated"
            self.stdout.write(f"  {verb} {username} ({group_name or 'no group'})")

    # ── beta gate (local convenience; gate is normally enforced by nginx) ──
    def _unlock_beta_gate(self):
        try:
            from users.models import SiteContentSettings
        except ImportError:
            return
        row, _ = SiteContentSettings.objects.get_or_create(key="default")
        if getattr(row, "beta_locked", False):
            row.beta_locked = False
            row.save(update_fields=["beta_locked"])
            self.stdout.write("  Unlocked beta gate (beta_locked=False)")

    # ── pending submission for the reviewer flow ────────────────────────────
    def _seed_pending_dictionary_revision(self):
        contributor = User.objects.get(username="e2e_contributor")
        proposed_data = {
            "term": PENDING_TERM,
            "meaning": "An automated end-to-end test headword.",
            "part_of_speech": "noun",
            "term_source_is_self_knowledge": True,
        }
        revision = (
            EntryRevision.objects.filter(
                contributor=contributor,
                entry__isnull=True,
                proposed_data__term=PENDING_TERM,
            )
            .order_by("created_at")
            .first()
        )
        created = revision is None
        if created:
            revision = EntryRevision.objects.create(
                contributor=contributor,
                entry=None,
                proposed_data=proposed_data,
                status=EntryRevision.Status.PENDING,
            )
        else:
            # Reset it back to PENDING so the reviewer flow can run again.
            revision.proposed_data = proposed_data
            revision.status = EntryRevision.Status.PENDING
            revision.entry = None
            revision.save(update_fields=["proposed_data", "status", "entry"])
        self.stdout.write(
            f"  {'Created' if created else 'Reset'} pending dictionary revision '{PENDING_TERM}'"
        )

    def _seed_pending_folklore_revision(self):
        contributor = User.objects.get(username="e2e_contributor")
        proposed_data = {
            "title": PENDING_FOLKLORE_TITLE,
            "content": "<p>An automated end-to-end folklore test entry.</p>",
            "category": "oral_narratives",
            "subcategory": "myths",
            "self_knowledge": True,
            "source": "",
        }
        revision = (
            FolkloreRevision.objects.filter(
                contributor=contributor,
                entry__isnull=True,
                proposed_data__title=PENDING_FOLKLORE_TITLE,
            )
            .order_by("created_at")
            .first()
        )
        created = revision is None
        if created:
            revision = FolkloreRevision.objects.create(
                contributor=contributor,
                entry=None,
                proposed_data=proposed_data,
                status=FolkloreRevision.Status.PENDING,
            )
        else:
            revision.proposed_data = proposed_data
            revision.status = FolkloreRevision.Status.PENDING
            revision.entry = None
            revision.save(update_fields=["proposed_data", "status", "entry"])
        self.stdout.write(
            f"  {'Created' if created else 'Reset'} pending folklore revision '{PENDING_FOLKLORE_TITLE}'"
        )

    def _seed_published_dictionary_entry(self):
        from django.utils import timezone

        from dictionary.models import Entry
        from dictionary.services import publish_revision

        if Entry.objects.filter(term__iexact=PUBLISHED_TERM).exists():
            self.stdout.write(f"  Published dictionary entry '{PUBLISHED_TERM}' already exists")
            return

        contributor = User.objects.get(username="e2e_contributor")
        approvers = list(User.objects.filter(username__in=["e2e_reviewer1", "e2e_reviewer2"]))
        revision = EntryRevision.objects.create(
            contributor=contributor,
            proposed_data={
                "term": PUBLISHED_TERM,
                "meaning": PUBLISHED_MEANING,
                "part_of_speech": "noun",
                "term_source_is_self_knowledge": True,
            },
            status=EntryRevision.Status.APPROVED,
            approved_at=timezone.now(),
        )
        publish_revision(revision=revision, approvers=approvers)
        self.stdout.write(f"  Published dictionary entry '{PUBLISHED_TERM}'")

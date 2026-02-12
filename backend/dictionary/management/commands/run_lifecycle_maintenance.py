from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from dictionary.models import Entry, EntryStatus
from dictionary.state_machine import validate_transition
from dictionary.variant_services import handle_mother_removed_or_archived
from folklore.models import FolkloreEntry
from folklore.state_machine import validate_transition as validate_folklore_transition


class Command(BaseCommand):
    help = "Apply SPEC lifecycle maintenance for archive/delete windows."

    def handle(self, *args, **options):
        now = timezone.now()
        archive_cutoff = now - timedelta(days=365)
        # "Archived entries after 1 additional year are auto-deleted."
        delete_cutoff = now - timedelta(days=365)

        archived_dictionary = self._archive_rejected_dictionary_entries(
            cutoff=archive_cutoff,
            now=now,
        )
        deleted_dictionary = self._delete_old_archived_dictionary_entries(
            cutoff=delete_cutoff,
        )
        archived_folklore = self._archive_rejected_folklore_entries(
            cutoff=archive_cutoff,
        )
        deleted_folklore = self._delete_old_archived_folklore_entries(
            cutoff=delete_cutoff,
        )

        self.stdout.write(
            self.style.SUCCESS(
                "Lifecycle maintenance complete: "
                f"dictionary_archived={archived_dictionary}, "
                f"dictionary_deleted={deleted_dictionary}, "
                f"folklore_archived={archived_folklore}, "
                f"folklore_deleted={deleted_folklore}"
            )
        )

    def _archive_rejected_dictionary_entries(self, *, cutoff, now):
        count = 0
        for entry in Entry.objects.filter(status=EntryStatus.REJECTED):
            # "Auto-archive: rejected entries with no revision for 1 year."
            last_revision_at = (
                entry.revisions.order_by("-created_at")
                .values_list("created_at", flat=True)
                .first()
            )
            last_activity = last_revision_at or entry.created_at
            if last_activity > cutoff:
                continue

            validate_transition(
                entry.status,
                EntryStatus.ARCHIVED,
                entity_name="DictionaryEntry",
            )
            entry.status = EntryStatus.ARCHIVED
            entry.archived_at = now
            entry.save(update_fields=["status", "archived_at"])
            handle_mother_removed_or_archived(entry=entry, removed=False)
            count += 1
        return count

    def _delete_old_archived_dictionary_entries(self, *, cutoff):
        count = 0
        for entry in Entry.objects.filter(
            status=EntryStatus.ARCHIVED,
            archived_at__isnull=False,
            archived_at__lte=cutoff,
        ):
            validate_transition(
                entry.status,
                EntryStatus.DELETED,
                entity_name="DictionaryEntry",
            )

            # Keep contribution history (ledger rows use SET_NULL),
            # but remove content records and media files.
            handle_mother_removed_or_archived(entry=entry, removed=True)
            if entry.audio_pronunciation:
                entry.audio_pronunciation.delete(save=False)
            if entry.photo:
                entry.photo.delete(save=False)
            entry.delete()
            count += 1
        return count

    def _archive_rejected_folklore_entries(self, *, cutoff):
        count = 0
        for entry in FolkloreEntry.objects.filter(status=FolkloreEntry.Status.REJECTED):
            if entry.updated_at > cutoff:
                continue

            validate_folklore_transition(
                entry.status,
                FolkloreEntry.Status.ARCHIVED,
                entity_name="FolkloreEntry",
            )
            entry.status = FolkloreEntry.Status.ARCHIVED
            entry.archived_at = timezone.now()
            entry.save(update_fields=["status", "archived_at"])
            count += 1
        return count

    def _delete_old_archived_folklore_entries(self, *, cutoff):
        count = 0
        for entry in FolkloreEntry.objects.filter(
            status=FolkloreEntry.Status.ARCHIVED,
            archived_at__isnull=False,
            archived_at__lte=cutoff,
        ):
            validate_folklore_transition(
                entry.status,
                FolkloreEntry.Status.DELETED,
                entity_name="FolkloreEntry",
            )
            entry.delete()
            count += 1
        return count

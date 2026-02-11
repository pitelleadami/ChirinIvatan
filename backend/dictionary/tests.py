from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from dictionary.models import Entry, EntryRevision, EntryStatus
from dictionary.state_machine import validate_transition
from dictionary.services import (
    create_revision_from_entry,
    finalize_approved_revision,
    publish_revision,
)


User = get_user_model()


class DictionaryServicesTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create_user(
            username="contrib",
            password="testpass123",
        )
        self.approver = User.objects.create_user(
            username="approver",
            password="testpass123",
        )

    def test_create_revision_from_entry_builds_proposed_data_snapshot(self):
        entry = Entry.objects.create(
            term="rakuh",
            meaning="to move",
            part_of_speech="verb",
            pronunciation_text="ra-kuh",
            inflected_forms={"present": "rakuh"},
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )

        revision = create_revision_from_entry(
            entry=entry,
            contributor=self.contributor,
        )

        self.assertEqual(revision.status, EntryRevision.Status.DRAFT)
        self.assertEqual(revision.proposed_data["term"], "rakuh")
        self.assertEqual(revision.proposed_data["meaning"], "to move")
        self.assertEqual(revision.proposed_data["part_of_speech"], "verb")
        self.assertEqual(
            revision.proposed_data["inflected_forms"],
            {"present": "rakuh"},
        )

    def test_publish_revision_creates_entry_and_applies_snapshot_fields(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "term": "vahay",
                "meaning": "house",
                "part_of_speech": "noun",
                "variant_type": "general",
                "usage_notes": "common noun",
            },
            status=EntryRevision.Status.APPROVED,
        )

        entry = publish_revision(
            revision=revision,
            approvers=[self.approver],
        )

        self.assertEqual(entry.status, EntryStatus.APPROVED)
        self.assertEqual(entry.term, "vahay")
        self.assertEqual(entry.meaning, "house")
        self.assertEqual(entry.part_of_speech, "noun")
        self.assertEqual(entry.variant_type, "general")
        self.assertEqual(entry.usage_notes, "common noun")
        self.assertEqual(entry.last_revised_by, self.contributor)
        self.assertEqual(entry.last_approved_by.count(), 1)
        self.assertEqual(entry.last_approved_by.first(), self.approver)

    def test_publish_revision_rejects_invalid_entry_state_transition(self):
        entry = Entry.objects.create(
            term="vakul",
            status=EntryStatus.REJECTED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        revision = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "vakul"},
            status=EntryRevision.Status.APPROVED,
        )

        with self.assertRaises(ValidationError):
            publish_revision(
                revision=revision,
                approvers=[self.approver],
            )

    def test_deleted_transition_rules(self):
        validate_transition(
            EntryStatus.ARCHIVED,
            EntryStatus.DELETED,
            entity_name="DictionaryEntry",
        )
        with self.assertRaises(ValidationError):
            validate_transition(
                EntryStatus.APPROVED,
                EntryStatus.DELETED,
                entity_name="DictionaryEntry",
            )

    def test_finalize_first_approved_revision_marks_base_snapshot(self):
        entry = Entry.objects.create(
            term="mayuh",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        revision = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "mayuh"},
            status=EntryRevision.Status.APPROVED,
            approved_at=timezone.now(),
        )

        finalize_approved_revision(revision=revision)
        revision.refresh_from_db()
        self.assertTrue(revision.is_base_snapshot)

    def test_finalize_prunes_oldest_approved_non_base_revisions(self):
        entry = Entry.objects.create(
            term="tumnu",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )

        base = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "tumnu"},
            status=EntryRevision.Status.APPROVED,
            approved_at=timezone.now(),
        )
        finalize_approved_revision(revision=base)

        first_non_base_id = None
        for i in range(21):
            rev = EntryRevision.objects.create(
                entry=entry,
                contributor=self.contributor,
                proposed_data={"term": f"tumnu-{i}"},
                status=EntryRevision.Status.APPROVED,
                approved_at=timezone.now(),
            )
            finalize_approved_revision(revision=rev)
            if i == 0:
                first_non_base_id = rev.id

        kept_non_base = EntryRevision.objects.filter(
            entry=entry,
            status=EntryRevision.Status.APPROVED,
            is_base_snapshot=False,
        ).count()
        self.assertEqual(kept_non_base, 20)
        self.assertTrue(
            EntryRevision.objects.filter(id=base.id, is_base_snapshot=True).exists()
        )
        self.assertFalse(EntryRevision.objects.filter(id=first_non_base_id).exists())

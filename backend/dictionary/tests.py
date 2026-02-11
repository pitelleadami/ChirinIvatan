from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from dictionary.models import Entry, EntryRevision, EntryStatus
from dictionary.state_machine import validate_transition
from dictionary.services import (
    create_revision_from_entry,
    finalize_approved_revision,
    get_visible_revision_history,
    publish_revision,
)
from django.contrib.auth.models import Group


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

    def test_public_revision_history_shows_base_plus_last_five(self):
        entry = Entry.objects.create(
            term="kanayi",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        base = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "kanayi"},
            status=EntryRevision.Status.APPROVED,
            approved_at=timezone.now(),
        )
        finalize_approved_revision(revision=base)

        created_ids = []
        for i in range(7):
            rev = EntryRevision.objects.create(
                entry=entry,
                contributor=self.contributor,
                proposed_data={"term": f"kanayi-{i}"},
                status=EntryRevision.Status.APPROVED,
                approved_at=timezone.now() + timedelta(seconds=i + 1),
            )
            finalize_approved_revision(revision=rev)
            created_ids.append(rev.id)

        visible = get_visible_revision_history(entry=entry, audience="public")
        recent_ids = [rev.id for rev in visible["recent_approved_revisions"]]

        self.assertEqual(visible["base_snapshot"].id, base.id)
        self.assertEqual(len(recent_ids), 5)
        self.assertEqual(recent_ids, list(reversed(created_ids[-5:])))

    def test_staff_revision_history_shows_base_plus_last_fifteen(self):
        entry = Entry.objects.create(
            term="taknu",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        base = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "taknu"},
            status=EntryRevision.Status.APPROVED,
            approved_at=timezone.now(),
        )
        finalize_approved_revision(revision=base)

        created_ids = []
        for i in range(16):
            rev = EntryRevision.objects.create(
                entry=entry,
                contributor=self.contributor,
                proposed_data={"term": f"taknu-{i}"},
                status=EntryRevision.Status.APPROVED,
                approved_at=timezone.now() + timedelta(seconds=i + 1),
            )
            finalize_approved_revision(revision=rev)
            created_ids.append(rev.id)

        visible = get_visible_revision_history(entry=entry, audience="staff")
        recent_ids = [rev.id for rev in visible["recent_approved_revisions"]]

        self.assertEqual(visible["base_snapshot"].id, base.id)
        self.assertEqual(len(recent_ids), 15)
        self.assertEqual(recent_ids, list(reversed(created_ids[-15:])))


class DictionaryEntryDetailApiTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create_user(
            username="api_contrib",
            password="testpass123",
        )
        self.reviewer = User.objects.create_user(
            username="api_reviewer",
            password="testpass123",
        )
        reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.reviewer.groups.add(reviewer_group)

    def _build_entry_with_history(self):
        entry = Entry.objects.create(
            term="api-term",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        base = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "api-term"},
            status=EntryRevision.Status.APPROVED,
            approved_at=timezone.now(),
        )
        finalize_approved_revision(revision=base)

        for i in range(16):
            rev = EntryRevision.objects.create(
                entry=entry,
                contributor=self.contributor,
                proposed_data={"term": f"api-term-{i}"},
                status=EntryRevision.Status.APPROVED,
                approved_at=timezone.now() + timedelta(seconds=i + 1),
            )
            finalize_approved_revision(revision=rev)
        return entry

    def test_public_entry_detail_limits_to_last_five_revisions(self):
        entry = self._build_entry_with_history()

        response = self.client.get(f"/api/dictionary/entries/{entry.id}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["revision_history"]["audience"], "public")
        self.assertEqual(
            len(payload["revision_history"]["recent_approved_revisions"]),
            5,
        )
        self.assertIsNotNone(payload["revision_history"]["base_snapshot"])

    def test_reviewer_entry_detail_limits_to_last_fifteen_revisions(self):
        entry = self._build_entry_with_history()
        self.client.force_login(self.reviewer)

        response = self.client.get(f"/api/dictionary/entries/{entry.id}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["revision_history"]["audience"], "staff")
        self.assertEqual(
            len(payload["revision_history"]["recent_approved_revisions"]),
            15,
        )

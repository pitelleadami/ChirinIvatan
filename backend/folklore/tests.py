from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from folklore.models import FolkloreEntry
from folklore.services import transition_folklore_status
from users.models import ContributionEvent


User = get_user_model()


class FolkloreEntryModelTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create_user(
            username="folk_contributor",
            password="testpass123",
        )

    def test_approval_sets_default_license_when_empty(self):
        entry = FolkloreEntry.objects.create(
            title="Kapayvanuvanua",
            content="Sample folklore text",
            category=FolkloreEntry.Category.MYTH,
            municipality_source="Basco",
            source="Oral account",
            contributor=self.contributor,
            status=FolkloreEntry.Status.APPROVED,
            copyright_usage="",
        )

        self.assertEqual(entry.copyright_usage, FolkloreEntry.DEFAULT_LICENSE)

    def test_license_is_immutable_after_approval(self):
        entry = FolkloreEntry.objects.create(
            title="Kapayvanuvanua",
            content="Sample folklore text",
            category=FolkloreEntry.Category.MYTH,
            municipality_source="Basco",
            source="Oral account",
            contributor=self.contributor,
            status=FolkloreEntry.Status.APPROVED,
            copyright_usage="CC BY-NC 4.0",
        )

        entry.copyright_usage = "All rights reserved"
        with self.assertRaises(ValidationError):
            entry.save()

    def test_status_enum_includes_under_review_and_deleted(self):
        self.assertIn(
            FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
            FolkloreEntry.Status.values,
        )
        self.assertIn(FolkloreEntry.Status.DELETED, FolkloreEntry.Status.values)

    def test_transition_service_blocks_invalid_transition(self):
        entry = FolkloreEntry.objects.create(
            title="Yaru",
            content="Sample text",
            category=FolkloreEntry.Category.LEGEND,
            source="Oral account",
            contributor=self.contributor,
            status=FolkloreEntry.Status.DRAFT,
        )

        with self.assertRaises(ValidationError):
            transition_folklore_status(
                entry=entry,
                to_status=FolkloreEntry.Status.APPROVED,
            )

    def test_transition_service_allows_valid_transition(self):
        entry = FolkloreEntry.objects.create(
            title="Yaru",
            content="Sample text",
            category=FolkloreEntry.Category.LEGEND,
            source="Oral account",
            contributor=self.contributor,
            status=FolkloreEntry.Status.DRAFT,
        )

        transition_folklore_status(
            entry=entry,
            to_status=FolkloreEntry.Status.PENDING,
        )
        entry.refresh_from_db()
        self.assertEqual(entry.status, FolkloreEntry.Status.PENDING)

    def test_approval_transition_awards_folklore_contribution(self):
        entry = FolkloreEntry.objects.create(
            title="Ariw",
            content="Sample text",
            category=FolkloreEntry.Category.PROVERB,
            source="Oral account",
            contributor=self.contributor,
            status=FolkloreEntry.Status.PENDING,
        )

        transition_folklore_status(
            entry=entry,
            to_status=FolkloreEntry.Status.APPROVED,
        )

        self.assertEqual(
            ContributionEvent.objects.filter(
                user=self.contributor,
                folklore_entry=entry,
                contribution_type=ContributionEvent.Type.FOLKLORE_ENTRY,
            ).count(),
            1,
        )

    def test_reapproval_does_not_duplicate_folklore_contribution(self):
        entry = FolkloreEntry.objects.create(
            title="Ariw",
            content="Sample text",
            category=FolkloreEntry.Category.PROVERB,
            source="Oral account",
            contributor=self.contributor,
            status=FolkloreEntry.Status.PENDING,
        )

        transition_folklore_status(
            entry=entry,
            to_status=FolkloreEntry.Status.APPROVED,
        )
        transition_folklore_status(
            entry=entry,
            to_status=FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
        )
        transition_folklore_status(
            entry=entry,
            to_status=FolkloreEntry.Status.APPROVED,
        )

        self.assertEqual(
            ContributionEvent.objects.filter(
                user=self.contributor,
                folklore_entry=entry,
                contribution_type=ContributionEvent.Type.FOLKLORE_ENTRY,
            ).count(),
            1,
        )

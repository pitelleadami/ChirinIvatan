from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.test import TestCase

from dictionary.models import Entry, EntryRevision, EntryStatus
from reviews.models import Review
from reviews.services import submit_review


User = get_user_model()


class ReviewServicesTests(TestCase):
    def setUp(self):
        self.reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.admin_group, _ = Group.objects.get_or_create(name="Admin")

        self.contributor = User.objects.create_user(
            username="contributor",
            password="testpass123",
        )
        self.reviewer1 = User.objects.create_user(
            username="reviewer1",
            password="testpass123",
        )
        self.reviewer1.groups.add(self.reviewer_group)

        self.reviewer2 = User.objects.create_user(
            username="reviewer2",
            password="testpass123",
        )
        self.reviewer2.groups.add(self.reviewer_group)

        self.admin = User.objects.create_user(
            username="admin1",
            password="testpass123",
        )
        self.admin.groups.add(self.admin_group)

    def _approved_entry_with_revision(self):
        entry = Entry.objects.create(
            term="vahay",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        revision = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "vahay"},
            status=EntryRevision.Status.APPROVED,
        )
        return entry, revision

    def test_flag_moves_entry_to_under_review(self):
        entry, revision = self._approved_entry_with_revision()

        submit_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=Review.Decision.FLAG,
            notes="Needs re-review due to source mismatch.",
        )

        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.APPROVED_UNDER_REVIEW)

    def test_rereview_reject_moves_entry_to_rejected(self):
        entry, revision = self._approved_entry_with_revision()

        submit_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=Review.Decision.FLAG,
            notes="Flag for dispute.",
        )
        submit_review(
            revision=revision,
            reviewer=self.reviewer2,
            decision=Review.Decision.REJECT,
            notes="Confirmed issue.",
        )

        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.REJECTED)

    def test_rereview_quorum_restores_entry_to_approved(self):
        entry, revision = self._approved_entry_with_revision()

        submit_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=Review.Decision.FLAG,
            notes="Needs re-check.",
        )
        submit_review(
            revision=revision,
            reviewer=self.reviewer2,
            decision=Review.Decision.APPROVE,
            notes="Looks valid.",
        )
        submit_review(
            revision=revision,
            reviewer=self.admin,
            decision=Review.Decision.APPROVE,
            notes="Approved after re-review.",
        )

        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.APPROVED)

    def test_flag_requires_notes(self):
        _, revision = self._approved_entry_with_revision()

        with self.assertRaises(ValidationError):
            submit_review(
                revision=revision,
                reviewer=self.reviewer1,
                decision=Review.Decision.FLAG,
                notes="",
            )

    def test_same_reviewer_can_review_again_in_new_round(self):
        entry, revision = self._approved_entry_with_revision()

        # Round 1
        submit_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=Review.Decision.FLAG,
            notes="Round 1 flag.",
        )
        submit_review(
            revision=revision,
            reviewer=self.reviewer2,
            decision=Review.Decision.APPROVE,
            notes="Round 1 approve.",
        )
        submit_review(
            revision=revision,
            reviewer=self.admin,
            decision=Review.Decision.APPROVE,
            notes="Round 1 admin approve.",
        )

        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.APPROVED)

        # Round 2: reviewer2 should be allowed to vote again.
        submit_review(
            revision=revision,
            reviewer=self.admin,
            decision=Review.Decision.FLAG,
            notes="Round 2 flag.",
        )
        submit_review(
            revision=revision,
            reviewer=self.reviewer2,
            decision=Review.Decision.APPROVE,
            notes="Round 2 approve.",
        )

        round1 = Review.objects.filter(revision=revision, review_round=1).count()
        round2 = Review.objects.filter(revision=revision, review_round=2).count()
        self.assertGreaterEqual(round1, 1)
        self.assertGreaterEqual(round2, 2)

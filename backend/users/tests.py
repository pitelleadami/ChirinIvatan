import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase

from dictionary.models import Entry, EntryRevision, EntryStatus
from folklore.models import FolkloreEntry
from reviews.models import Review
from reviews.services import submit_review
from users.contributions import contribution_summary_for_user, global_leaderboard
from users.models import ContributionEvent, UserProfile


User = get_user_model()


class ContributionLedgerTests(TestCase):
    def setUp(self):
        reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")

        self.reviewer1 = User.objects.create_user(
            username="rev1",
            password="testpass123",
        )
        self.reviewer1.groups.add(reviewer_group)

        self.reviewer2 = User.objects.create_user(
            username="rev2",
            password="testpass123",
        )
        self.reviewer2.groups.add(reviewer_group)

        self.contributor1 = User.objects.create_user(
            username="contrib1",
            password="testpass123",
        )
        self.contributor2 = User.objects.create_user(
            username="contrib2",
            password="testpass123",
        )

    def _approve_revision(self, revision):
        submit_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=Review.Decision.APPROVE,
            notes="approve 1",
        )
        submit_review(
            revision=revision,
            reviewer=self.reviewer2,
            decision=Review.Decision.APPROVE,
            notes="approve 2",
        )
        revision.refresh_from_db()
        return revision

    def test_initial_approval_awards_dictionary_term(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor1,
            proposed_data={"term": "vahay"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(revision)

        self.assertEqual(
            ContributionEvent.objects.filter(
                user=self.contributor1,
                contribution_type=ContributionEvent.Type.DICTIONARY_TERM,
            ).count(),
            1,
        )
        self.assertEqual(
            ContributionEvent.objects.filter(
                user=self.contributor1,
                contribution_type=ContributionEvent.Type.REVISION,
            ).count(),
            0,
        )

    def test_revision_credit_is_once_per_entry_per_contributor(self):
        initial = EntryRevision.objects.create(
            contributor=self.contributor1,
            proposed_data={"term": "tumnu"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(initial)
        entry = initial.entry

        rev1 = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor1,
            proposed_data={"term": "tumnu", "usage_notes": "v1"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(rev1)

        rev2 = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor1,
            proposed_data={"term": "tumnu", "usage_notes": "v2"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(rev2)

        self.assertEqual(
            ContributionEvent.objects.filter(
                user=self.contributor1,
                dictionary_entry=entry,
                contribution_type=ContributionEvent.Type.REVISION,
            ).count(),
            1,
        )

    def test_different_contributors_each_get_revision_credit(self):
        initial = EntryRevision.objects.create(
            contributor=self.contributor1,
            proposed_data={"term": "aray"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(initial)
        entry = initial.entry

        rev_by_c1 = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor1,
            proposed_data={"term": "aray", "usage_notes": "c1"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(rev_by_c1)

        rev_by_c2 = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor2,
            proposed_data={"term": "aray", "usage_notes": "c2"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(rev_by_c2)

        self.assertEqual(
            ContributionEvent.objects.filter(
                user=self.contributor1,
                dictionary_entry=entry,
                contribution_type=ContributionEvent.Type.REVISION,
            ).count(),
            1,
        )
        self.assertEqual(
            ContributionEvent.objects.filter(
                user=self.contributor2,
                dictionary_entry=entry,
                contribution_type=ContributionEvent.Type.REVISION,
            ).count(),
            1,
        )

        summary = contribution_summary_for_user(user=self.contributor1)
        self.assertEqual(summary["dictionary_terms"], 1)
        self.assertEqual(summary["revisions"], 1)
        self.assertEqual(summary["total"], 2)

        board = list(global_leaderboard(limit=2))
        self.assertGreaterEqual(board[0].total, board[1].total)

    def test_global_leaderboard_endpoint_returns_rows(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor1,
            proposed_data={"term": "vakul"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(revision)

        response = self.client.get("/leaderboard/global")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        self.assertEqual(payload["leaderboard_type"], "global")
        self.assertGreaterEqual(len(payload["rows"]), 1)
        first = payload["rows"][0]
        self.assertIn("username", first)
        self.assertIn("total_contributions", first)

    def test_municipality_leaderboard_requires_query_param(self):
        response = self.client.get("/leaderboard/municipality")
        self.assertEqual(response.status_code, 400)

    def test_municipality_leaderboard_filters_rows(self):
        from users.models import UserProfile

        UserProfile.objects.create(user=self.contributor1, municipality="Basco")
        UserProfile.objects.create(user=self.contributor2, municipality="Mahatao")

        rev1 = EntryRevision.objects.create(
            contributor=self.contributor1,
            proposed_data={"term": "sudi"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(rev1)

        rev2 = EntryRevision.objects.create(
            contributor=self.contributor2,
            proposed_data={"term": "kuyat"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(rev2)

        response = self.client.get("/leaderboard/municipality?municipality=Basco")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        self.assertEqual(payload["leaderboard_type"], "municipality")
        self.assertEqual(payload["municipality"], "Basco")
        self.assertEqual(len(payload["rows"]), 1)
        self.assertEqual(payload["rows"][0]["username"], self.contributor1.username)


class PublicUserProfileApiTests(TestCase):
    def setUp(self):
        reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.reviewer1 = User.objects.create_user(
            username="r1",
            password="testpass123",
        )
        self.reviewer1.groups.add(reviewer_group)
        self.reviewer2 = User.objects.create_user(
            username="r2",
            password="testpass123",
        )
        self.reviewer2.groups.add(reviewer_group)

        self.user = User.objects.create_user(
            username="profile_user",
            password="testpass123",
        )
        UserProfile.objects.create(
            user=self.user,
            municipality="Basco",
            affiliation="Ivatan Org",
            occupation="Teacher",
            bio="Helps document language.",
        )

    def _approve_revision(self, revision):
        submit_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=Review.Decision.APPROVE,
            notes="approve 1",
        )
        submit_review(
            revision=revision,
            reviewer=self.reviewer2,
            decision=Review.Decision.APPROVE,
            notes="approve 2",
        )
        revision.refresh_from_db()
        return revision

    def test_public_profile_endpoint_returns_summary_and_lists(self):
        # Approved mother term
        initial = EntryRevision.objects.create(
            contributor=self.user,
            proposed_data={"term": "vahay"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(initial)
        entry = initial.entry

        # Approved revision contribution on same entry
        rev = EntryRevision.objects.create(
            entry=entry,
            contributor=self.user,
            proposed_data={"term": "vahay", "usage_notes": "updated"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(rev)

        # Approved folklore entry
        folklore = FolkloreEntry.objects.create(
            title="Ariw",
            content="Sample",
            category=FolkloreEntry.Category.PROVERB,
            source="Oral account",
            contributor=self.user,
            status=FolkloreEntry.Status.PENDING,
        )
        from folklore.services import transition_folklore_status
        transition_folklore_status(
            entry=folklore,
            to_status=FolkloreEntry.Status.APPROVED,
        )

        response = self.client.get(f"/api/users/{self.user.username}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["header"]["username"], self.user.username)
        self.assertEqual(payload["header"]["municipality"], "Basco")
        self.assertEqual(payload["header"]["affiliation"], "Ivatan Org")
        self.assertEqual(payload["contribution_summary"]["dictionary_terms"], 1)
        self.assertEqual(payload["contribution_summary"]["folklore_entries"], 1)
        self.assertEqual(payload["contribution_summary"]["revisions"], 1)
        self.assertEqual(payload["contribution_summary"]["total_contributions"], 3)
        self.assertEqual(len(payload["lists"]["approved_mother_terms"]), 1)
        self.assertEqual(len(payload["lists"]["approved_folklore_entries"]), 1)
        self.assertEqual(len(payload["lists"]["entries_revised"]), 1)

    def test_public_profile_hides_non_public_status_entries(self):
        draft_entry = Entry.objects.create(
            term="draft-term",
            status=EntryStatus.DRAFT,
            is_mother=True,
            initial_contributor=self.user,
            last_revised_by=self.user,
        )
        EntryRevision.objects.create(
            entry=draft_entry,
            contributor=self.user,
            proposed_data={"term": "draft-term"},
            status=EntryRevision.Status.DRAFT,
        )

        FolkloreEntry.objects.create(
            title="Rejected item",
            content="Sample",
            category=FolkloreEntry.Category.MYTH,
            source="Oral account",
            contributor=self.user,
            status=FolkloreEntry.Status.REJECTED,
        )

        response = self.client.get(f"/api/users/{self.user.username}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lists"]["approved_mother_terms"], [])
        self.assertEqual(payload["lists"]["approved_folklore_entries"], [])

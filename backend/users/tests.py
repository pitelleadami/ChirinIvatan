import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.test import TestCase

from dictionary.models import Entry, EntryRevision, EntryStatus
from folklore.models import FolkloreEntry
from reviews.models import Review
from reviews.services import submit_review
from users.contributions import contribution_summary_for_user, global_leaderboard
from users.models import (
    ContributionEvent,
    GamificationConfig,
    MunicipalityMonthlyWinner,
    MunicipalityStats,
    RecognitionEvent,
    RoleApplication,
    RoleOnboardingRecord,
    UserContributionStats,
    UserProfile,
)
from users.recognition import (
    build_gamification_profile_payload,
    contributor_level_for_user,
    recompute_user_gamification,
)


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


class RoleOnboardingFlowTests(TestCase):
    def setUp(self):
        self.reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.admin_group, _ = Group.objects.get_or_create(name="Admin")

        self.reviewer_a = User.objects.create_user(username="reviewer_a", password="testpass123")
        self.reviewer_a.groups.add(self.reviewer_group)

        self.reviewer_b = User.objects.create_user(username="reviewer_b", password="testpass123")
        self.reviewer_b.groups.add(self.reviewer_group)

        self.admin_user = User.objects.create_user(username="admin_user", password="testpass123")
        self.admin_user.groups.add(self.admin_group)

        self.applicant = User.objects.create_user(username="applicant", password="testpass123")
        self.invitee = User.objects.create_user(username="invitee", password="testpass123")

    def test_contributor_application_activates_with_single_reviewer_approval(self):
        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "contributor"}),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201)
        application_id = create.json()["application_id"]

        self.client.force_login(self.reviewer_a)
        decide = self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "looks good"}),
            content_type="application/json",
        )
        self.assertEqual(decide.status_code, 200)
        self.assertEqual(decide.json()["application_status"], RoleApplication.Status.APPROVED)

        profile = self.client.get(f"/api/users/{self.applicant.username}").json()
        self.assertIn(
            "Approved as Contributor by reviewer_a",
            profile["header"]["onboarding_accountability"]["contributor"],
        )

    def test_reviewer_application_requires_two_reviewers(self):
        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "reviewer"}),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201)
        application_id = create.json()["application_id"]

        self.client.force_login(self.reviewer_a)
        decide_1 = self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "approve 1"}),
            content_type="application/json",
        )
        self.assertEqual(decide_1.status_code, 200)
        self.assertEqual(decide_1.json()["application_status"], RoleApplication.Status.PENDING)

        self.client.force_login(self.reviewer_b)
        decide_2 = self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "approve 2"}),
            content_type="application/json",
        )
        self.assertEqual(decide_2.status_code, 200)
        self.assertEqual(decide_2.json()["application_status"], RoleApplication.Status.APPROVED)

        self.applicant.refresh_from_db()
        self.assertTrue(self.applicant.groups.filter(name="Reviewer").exists())

    def test_reviewer_application_can_activate_via_reviewer_plus_admin(self):
        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "reviewer"}),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201)
        application_id = create.json()["application_id"]

        self.client.force_login(self.reviewer_a)
        self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "reviewer approval"}),
            content_type="application/json",
        )

        self.client.force_login(self.admin_user)
        decide_2 = self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "admin approval"}),
            content_type="application/json",
        )
        self.assertEqual(decide_2.status_code, 200)
        self.assertEqual(decide_2.json()["application_status"], RoleApplication.Status.APPROVED)

    def test_single_reviewer_can_directly_invite_reviewer(self):
        self.client.force_login(self.reviewer_a)
        invite = self.client.post(
            "/api/users/role-invitations",
            data=json.dumps({"username": self.invitee.username, "role": "reviewer"}),
            content_type="application/json",
        )
        self.assertEqual(invite.status_code, 201)
        self.assertEqual(invite.json()["method"], RoleOnboardingRecord.Method.INVITED)
        self.assertIn("Invited as Reviewer by reviewer_a", invite.json()["accountability_label"])

        self.invitee.refresh_from_db()
        self.assertTrue(self.invitee.groups.filter(name="Reviewer").exists())


class CulturalStewardshipTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="culture_user", password="testpass123")
        self.reviewer = User.objects.create_user(username="culture_reviewer", password="testpass123")
        reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.reviewer.groups.add(reviewer_group)

    def _approve_dictionary_submission(self, term, contributor=None):
        contributor = contributor or self.user
        revision = EntryRevision.objects.create(
            contributor=contributor,
            proposed_data={"term": term},
            status=EntryRevision.Status.PENDING,
        )
        submit_review(
            revision=revision,
            reviewer=self.reviewer,
            decision=Review.Decision.APPROVE,
            notes="approve one",
        )
        reviewer_two = User.objects.create_user(
            username=f"culture_reviewer_{term}",
            password="testpass123",
        )
        reviewer_two.groups.add(Group.objects.get(name="Reviewer"))
        submit_review(
            revision=revision,
            reviewer=reviewer_two,
            decision=Review.Decision.APPROVE,
            notes="approve two",
        )
        revision.refresh_from_db()
        return revision

    def test_level_uses_preserved_entries_language(self):
        for i in range(5):
            self._approve_dictionary_submission(term=f"term_{i}")

        level = contributor_level_for_user(self.user)
        self.assertEqual(level["current_level"]["title"], "Language Contributor")
        self.assertEqual(level["approved_entries"], 5)

        response = self.client.get(f"/api/users/{self.user.username}/cultural-stewardship")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("You preserved", payload["language"]["headline"])

    def test_profile_includes_gamification_block(self):
        response = self.client.get(f"/api/users/{self.user.username}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("gamification", payload)
        self.assertIn("contributor_level", payload["gamification"])
        self.assertIn("dictionary_badges", payload["gamification"])


class GamificationAdvancedFeaturesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="advanced_user", password="testpass123")

    def test_admin_config_can_override_level_titles_and_thresholds(self):
        GamificationConfig.objects.create(
            name="default",
            contributor_levels=[
                {"number": 0, "title": "Starter", "threshold": 0},
                {"number": 1, "title": "Custom Title", "threshold": 1},
            ],
            reviewer_levels=[
                {"number": 0, "title": "Reviewer", "threshold": 0},
            ],
            dictionary_badges=[
                {"key": "word_contributor", "name": "Word Contributor", "threshold": 1},
            ],
            folklore_badges=[
                {"key": "story_contributor", "name": "Story Contributor", "threshold": 1},
            ],
            quality_badge={
                "key": "accuracy_champion",
                "name": "Accuracy Champion",
                "threshold": 1,
                "max_rejections": 0,
            },
        )

        stats, _ = UserContributionStats.objects.get_or_create(user=self.user)
        stats.combined_total = 1
        stats.dictionary_original_total = 1
        stats.save()

        payload = build_gamification_profile_payload(self.user)
        self.assertEqual(payload["contributor_level"]["title"], "Custom Title")

    @patch("users.recognition._current_month_key", return_value="2026-03")
    def test_month_rollover_creates_municipality_winner_events(self, _mock_month):
        MunicipalityStats.objects.create(
            municipality="Basco",
            dictionary_month=5,
            folklore_month=2,
            combined_month=7,
            last_month_calculated="2026-02",
        )
        MunicipalityStats.objects.create(
            municipality="Ivana",
            dictionary_month=3,
            folklore_month=6,
            combined_month=9,
            last_month_calculated="2026-02",
        )

        recompute_user_gamification(self.user)

        winners = MunicipalityMonthlyWinner.objects.filter(month_key="2026-02")
        self.assertEqual(winners.count(), 3)
        self.assertTrue(
            RecognitionEvent.objects.filter(
                event_type=RecognitionEvent.EventType.MUNICIPALITY_WIN,
                reference_id="combined:2026-02",
            ).exists()
        )

    def test_gamification_config_validation_rejects_invalid_json_shape(self):
        config = GamificationConfig(
            name="broken",
            contributor_levels=[],
            reviewer_levels=[],
            dictionary_badges=[],
            folklore_badges=[],
            quality_badge={},
        )
        with self.assertRaises(ValidationError):
            config.full_clean()

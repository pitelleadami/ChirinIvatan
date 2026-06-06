import json
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

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
    RoleInvitation,
    RoleOnboardingRecord,
    SiteContentSettings,
    UserContributionStats,
    UserProfile,
    UserSessionEvent,
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
        self.contributor_group, _ = Group.objects.get_or_create(name="Contributor")

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

    def _mark_leaderboard_eligible(self, user, *, municipality="Basco", include_in_leaderboard=True):
        user.groups.add(self.contributor_group)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.municipality = municipality
        profile.include_in_leaderboard = include_in_leaderboard
        profile.save(update_fields=["municipality", "include_in_leaderboard"])
        if not user.role_onboarding_records.filter(role=RoleOnboardingRecord.Role.CONTRIBUTOR).exists():
            RoleOnboardingRecord.objects.create(
                user=user,
                role=RoleOnboardingRecord.Role.CONTRIBUTOR,
                method=RoleOnboardingRecord.Method.INVITED,
            )
        return profile

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
        self._mark_leaderboard_eligible(self.contributor1, municipality="Basco")
        self._mark_leaderboard_eligible(self.contributor2, municipality="Mahatao")

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
        self._mark_leaderboard_eligible(self.contributor1, municipality="Basco")

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

    def test_global_leaderboard_excludes_profile_without_role_group(self):
        UserProfile.objects.create(
            user=self.contributor1,
            municipality="Basco",
        )
        revision = EntryRevision.objects.create(
            contributor=self.contributor1,
            proposed_data={"term": "vakul"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(revision)

        response = self.client.get("/leaderboard/global")

        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        usernames = [row["username"] for row in payload["rows"]]
        self.assertNotIn(self.contributor1.username, usernames)

    def test_global_leaderboard_includes_role_group_test_account(self):
        self.contributor1.groups.add(self.contributor_group)
        UserProfile.objects.create(
            user=self.contributor1,
            municipality="Basco",
        )
        revision = EntryRevision.objects.create(
            contributor=self.contributor1,
            proposed_data={"term": "vakul"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(revision)

        response = self.client.get("/leaderboard/global")

        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        usernames = [row["username"] for row in payload["rows"]]
        self.assertIn(self.contributor1.username, usernames)

    def test_global_leaderboard_includes_role_group_account_with_zero_score(self):
        self.contributor1.groups.add(self.contributor_group)
        UserProfile.objects.create(
            user=self.contributor1,
            municipality="Basco",
        )

        response = self.client.get("/leaderboard/global")

        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        row = next(item for item in payload["rows"] if item["username"] == self.contributor1.username)
        self.assertEqual(row["value"], 0)
        self.assertEqual(row["total_contributions"], 0)

    def test_leaderboard_excludes_profiles_that_opt_out(self):
        self._mark_leaderboard_eligible(
            self.contributor1,
            municipality="Basco",
            include_in_leaderboard=False,
        )
        revision = EntryRevision.objects.create(
            contributor=self.contributor1,
            proposed_data={"term": "vakul"},
            status=EntryRevision.Status.PENDING,
        )
        self._approve_revision(revision)

        response = self.client.get("/leaderboard/global")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        usernames = [row["username"] for row in payload["rows"]]
        self.assertNotIn(self.contributor1.username, usernames)
        self.assertEqual(list(global_leaderboard()), [])

    def test_municipality_leaderboard_requires_query_param(self):
        response = self.client.get("/leaderboard/municipality")
        self.assertEqual(response.status_code, 400)

    def test_municipality_leaderboard_filters_rows(self):
        self._mark_leaderboard_eligible(self.contributor1, municipality="Basco")
        self._mark_leaderboard_eligible(self.contributor2, municipality="Mahatao")

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
            post_nominals="PhD",
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
        self.assertEqual(payload["header"]["post_nominals"], "PhD")
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

    def test_public_profile_works_without_user_profile_row(self):
        bare_user = User.objects.create_user(
            username="bare_user",
            password="testpass123",
        )

        response = self.client.get(f"/api/users/{bare_user.username}")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["header"]["username"], bare_user.username)
        self.assertEqual(payload["header"]["municipality"], "")
        self.assertEqual(payload["header"]["affiliation"], "")


class SiteContentApiTests(TestCase):
    def setUp(self):
        self.admin_group, _ = Group.objects.get_or_create(name="Admin")
        self.admin_user = User.objects.create_user(username="site_admin", password="testpass123")
        self.admin_user.groups.add(self.admin_group)
        self.regular_user = User.objects.create_user(username="regular_user", password="testpass123")

    def test_public_site_content_returns_defaults(self):
        response = self.client.get("/api/site-content")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["is_default"])
        self.assertEqual(payload["about_heading"], "About the project")
        self.assertEqual(payload["yaru_heading"], "The Digital Yaru")
        self.assertFalse(payload["maintenance_enabled"])
        self.assertIn("temporarily paused", payload["maintenance_message"])

    def test_admin_can_update_site_content(self):
        self.client.force_login(self.admin_user)
        response = self.client.post(
            "/api/site-content",
            data=json.dumps(
                {
                    "about_heading": "About Chirin",
                    "about_intro_paragraphs": ["Intro one", ""],
                    "about_body_paragraphs": ["Body"],
                    "about_rationale_paragraphs": [],
                    "about_future_paragraphs": [],
                    "about_final_quote": "Closing",
                    "yaru_heading": "Digital Yaru",
                    "yaru_intro_paragraphs": ["Yaru intro"],
                    "maintenance_enabled": True,
                    "maintenance_message": "We are updating the archive tonight.",
                    "support_statements": [
                        {"quote": "Important work", "name": "Supporter", "role": "Teacher"},
                        {"quote": "", "name": "", "role": ""},
                    ],
                    "partner_details": [
                        {"name": "Partner A", "description": "Helps preserve language", "url": "https://example.com"}
                    ],
                    "faq_sections": [
                        {
                            "id": "custom-help",
                            "title": "Custom Help",
                            "intro": "Intro",
                            "roles": ["visitor", "admin", "invalid"],
                            "items": [
                                {
                                    "q": "How?",
                                    "a": "Carefully.",
                                    "bullets": ["One", ""],
                                    "image_url": "https://example.com/graph.png",
                                    "image_alt": "Sample graph",
                                },
                                {"q": "", "a": "", "bullets": []},
                            ],
                        }
                    ],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["is_default"])
        self.assertEqual(payload["about_heading"], "About Chirin")
        self.assertEqual(payload["about_intro_paragraphs"], ["Intro one"])
        self.assertTrue(payload["maintenance_enabled"])
        self.assertEqual(payload["maintenance_message"], "We are updating the archive tonight.")
        self.assertEqual(payload["support_statements"][0]["name"], "Supporter")
        self.assertEqual(payload["faq_sections"][0]["roles"], ["visitor", "admin"])
        self.assertEqual(payload["faq_sections"][0]["items"][0]["bullets"], ["One"])
        self.assertEqual(payload["faq_sections"][0]["items"][0]["image_alt"], "Sample graph")
        self.assertEqual(SiteContentSettings.objects.get(key="default").updated_by, self.admin_user)

    def test_maintenance_mode_blocks_public_api_but_allows_admin(self):
        SiteContentSettings.objects.create(
            key="default",
            maintenance_enabled=True,
            maintenance_message="Maintenance window in progress.",
        )

        response = self.client.get("/api/leaderboard/global?metric=combined&period=monthly")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Maintenance window in progress.")

        response = self.client.get("/api/site-content")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["maintenance_enabled"])

        self.client.force_login(self.admin_user)
        response = self.client.get("/api/leaderboard/global?metric=combined&period=monthly")
        self.assertEqual(response.status_code, 200)

    def test_site_content_write_requires_admin(self):
        self.client.force_login(self.regular_user)
        response = self.client.post(
            "/api/site-content",
            data=json.dumps({"about_heading": "Nope"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)

    def test_admin_can_upload_faq_media(self):
        self.client.force_login(self.admin_user)
        upload = SimpleUploadedFile("graph.png", b"fake-image-bytes", content_type="image/png")
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                response = self.client.post("/api/site-content/faq-media", data={"image": upload})

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertIn("/media/site/faq/", payload["url"])
        self.assertTrue(payload["path"].startswith("site/faq/"))

    def test_faq_media_upload_requires_admin(self):
        self.client.force_login(self.regular_user)
        upload = SimpleUploadedFile("graph.png", b"fake-image-bytes", content_type="image/png")

        response = self.client.post("/api/site-content/faq-media", data={"image": upload})

        self.assertEqual(response.status_code, 403)

    def test_profile_endpoint_does_not_save_leaderboard_participation_flag(self):
        UserProfile.objects.create(user=self.regular_user)
        self.client.force_login(self.regular_user)
        response = self.client.post(
            "/api/profile/my",
            data=json.dumps({"include_in_leaderboard": False}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.regular_user.profile.refresh_from_db()
        self.assertTrue(self.regular_user.profile.include_in_leaderboard)

    def test_profile_owner_cannot_toggle_leaderboard_visibility_from_profile(self):
        UserProfile.objects.create(user=self.regular_user)
        self.client.force_login(self.regular_user)
        response = self.client.post(
            f"/api/users/{self.regular_user.username}/leaderboard-visibility",
            data=json.dumps({"include_in_leaderboard": False}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.regular_user.profile.refresh_from_db()
        self.assertTrue(self.regular_user.profile.include_in_leaderboard)

    def test_admin_can_toggle_another_users_leaderboard_visibility(self):
        self.client.force_login(self.admin_user)
        response = self.client.post(
            f"/api/users/{self.regular_user.username}/leaderboard-visibility",
            data=json.dumps({"include_in_leaderboard": False}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.regular_user.profile.refresh_from_db()
        self.assertFalse(self.regular_user.profile.include_in_leaderboard)

    def test_regular_user_cannot_toggle_another_users_leaderboard_visibility(self):
        other_user = User.objects.create_user(username="other_user", password="testpass123")
        self.client.force_login(self.regular_user)
        response = self.client.post(
            f"/api/users/{other_user.username}/leaderboard-visibility",
            data=json.dumps({"include_in_leaderboard": False}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)

    def test_admin_can_toggle_public_profile_visibility_flags(self):
        self.client.force_login(self.admin_user)
        response = self.client.post(
            f"/api/users/{self.regular_user.username}/public-visibility",
            data=json.dumps(
                {
                    "show_on_yaru_chart": False,
                    "show_live_contributions": False,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.regular_user.profile.refresh_from_db()
        self.assertFalse(self.regular_user.profile.show_on_yaru_chart)
        self.assertFalse(self.regular_user.profile.show_live_contributions)

    def test_yaru_members_groups_project_proponent_and_administrators(self):
        contributor_group, _ = Group.objects.get_or_create(name="Contributor")
        self.admin_user.first_name = "Apo"
        self.admin_user.last_name = "Lead"
        self.admin_user.save(update_fields=["first_name", "last_name"])
        UserProfile.objects.get_or_create(user=self.admin_user)

        second_admin = User.objects.create_user(
            username="admin_two",
            first_name="Admin",
            last_name="Two",
            password="testpass123",
        )
        second_admin.groups.add(self.admin_group)
        UserProfile.objects.get_or_create(user=second_admin)

        contributor = User.objects.create_user(
            username="visible_contributor",
            first_name="Visible",
            last_name="Contributor",
            password="testpass123",
        )
        contributor.groups.add(contributor_group)
        UserProfile.objects.get_or_create(user=contributor)

        hidden_admin = User.objects.create_user(username="hidden_admin", password="testpass123")
        hidden_admin.groups.add(self.admin_group)
        hidden_profile, _ = UserProfile.objects.get_or_create(user=hidden_admin)
        hidden_profile.show_on_yaru_chart = False
        hidden_profile.save(update_fields=["show_on_yaru_chart"])

        response = self.client.get("/api/yaru/members")

        self.assertEqual(response.status_code, 200)
        rows = {row["username"]: row for row in response.json()["rows"]}
        self.assertEqual(rows[self.admin_user.username]["org_chart_group"], "project_proponent")
        self.assertEqual(rows[self.admin_user.username]["role"], "Project Proponent")
        self.assertEqual(rows[second_admin.username]["org_chart_group"], "administrators")
        self.assertEqual(rows[second_admin.username]["role"], "Administrator")
        self.assertEqual(rows[contributor.username]["org_chart_group"], "contributors")
        self.assertNotIn(hidden_admin.username, rows)


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

        self.applicant.refresh_from_db()
        self.assertTrue(self.applicant.groups.filter(name="Contributor").exists())

        profile = self.client.get(f"/api/users/{self.applicant.username}").json()
        self.assertIn(
            "Approved as Contributor by R. A",
            profile["header"]["onboarding_accountability"]["contributor"],
        )

    def test_reviewer_application_requires_two_reviewers(self):
        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "reviewer", "reviewer_reason": "I can help validate submissions."}),
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
        self.assertTrue(self.applicant.groups.filter(name="Contributor").exists())
        self.assertTrue(self.applicant.groups.filter(name="Reviewer").exists())

    def test_reviewer_application_can_activate_via_reviewer_plus_admin(self):
        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "reviewer", "reviewer_reason": "I can help validate submissions."}),
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

    def test_reviewer_application_requires_reason(self):
        self.client.force_login(self.applicant)
        response = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "reviewer"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Reason for applying as reviewer is required", response.json()["detail"])

    def test_single_reviewer_can_directly_invite_reviewer(self):
        self.client.force_login(self.reviewer_a)
        invite = self.client.post(
            "/api/users/role-invitations",
            data=json.dumps({"username": self.invitee.username, "role": "reviewer"}),
            content_type="application/json",
        )
        self.assertEqual(invite.status_code, 201)
        self.assertEqual(invite.json()["method"], RoleOnboardingRecord.Method.INVITED)
        self.assertIn("Invited as Reviewer by R. A", invite.json()["accountability_label"])

        self.invitee.refresh_from_db()
        self.assertTrue(self.invitee.groups.filter(name="Contributor").exists())
        self.assertTrue(self.invitee.groups.filter(name="Reviewer").exists())

    def test_admin_can_create_managed_consultant_profile(self):
        self.client.force_login(self.admin_user)
        response = self.client.post(
            "/api/admin/consultant-profiles",
            data=json.dumps(
                {
                    "first_name": "Apo",
                    "last_name": "Consultant",
                    "municipality": "Sabtang",
                    "post_nominals": "Elder",
                    "affiliation": "Community knowledge holder",
                    "occupation": "Cultural consultant",
                    "bio": "Shares context without managing an account.",
                    "notes": "Created after verbal consent.",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        consultant = User.objects.get(username=payload["user"]["username"])
        self.assertFalse(consultant.has_usable_password())
        self.assertTrue(consultant.groups.filter(name="Contributor").exists())
        self.assertTrue(consultant.groups.filter(name="Reviewer").exists())
        self.assertTrue(consultant.groups.filter(name="Consultant").exists())
        self.assertFalse(consultant.profile.include_in_leaderboard)
        self.assertIn("Created as Consultant profile", payload["accountability_label"])

        public_profile = self.client.get(f"/api/users/{consultant.username}").json()
        self.assertEqual(public_profile["header"]["role"], "Consultant")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_admin_can_invite_by_email_and_invitee_accepts_without_application_quorum(self):
        self.client.force_login(self.admin_user)
        invite = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps(
                {
                    "email": "new.invitee@example.com",
                    "role": "reviewer",
                    "first_name": "New",
                    "last_name": "Invitee",
                    "municipality": "Uyugan",
                    "notes": "Vetted by admin.",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(invite.status_code, 201)
        payload = invite.json()
        self.assertIn("/roles?invite=", payload["accept_url"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(payload["accept_url"], mail.outbox[0].body)

        invitation = RoleInvitation.objects.get(email="new.invitee@example.com")
        accept = self.client.post(
            f"/api/users/role-invitations/{invitation.token}/accept",
            data=json.dumps(
                {
                    "username": "new.invitee",
                    "password": "StrongInvitePass123!",
                    "password_confirm": "StrongInvitePass123!",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(accept.status_code, 201)
        invited_user = User.objects.get(email="new.invitee@example.com")
        self.assertTrue(invited_user.groups.filter(name="Contributor").exists())
        self.assertTrue(invited_user.groups.filter(name="Reviewer").exists())
        self.assertEqual(invited_user.profile.municipality, "Uyugan")
        self.assertFalse(RoleApplication.objects.filter(applicant=invited_user).exists())
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, RoleInvitation.Status.ACCEPTED)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_admin_can_invite_consultant_by_email(self):
        self.client.force_login(self.admin_user)
        invite = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps(
                {
                    "email": "consultant@example.com",
                    "role": "consultant",
                    "first_name": "Email",
                    "last_name": "Consultant",
                    "municipality": "Basco",
                    "notes": "Recognized domain consultant.",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(invite.status_code, 201)
        invitation = RoleInvitation.objects.get(email="consultant@example.com")
        accept = self.client.post(
            f"/api/users/role-invitations/{invitation.token}/accept",
            data=json.dumps(
                {
                    "username": "email.consultant",
                    "password": "StrongInvitePass123!",
                    "password_confirm": "StrongInvitePass123!",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(accept.status_code, 201)
        invited_user = User.objects.get(email="consultant@example.com")
        self.assertTrue(invited_user.groups.filter(name="Contributor").exists())
        self.assertTrue(invited_user.groups.filter(name="Reviewer").exists())
        self.assertTrue(invited_user.groups.filter(name="Consultant").exists())
        self.assertEqual(accept.json()["role"], "consultant")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_admin_can_invite_admin_by_email(self):
        self.client.force_login(self.admin_user)
        invite = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps(
                {
                    "email": "new.admin@example.com",
                    "role": "admin",
                    "first_name": "New",
                    "last_name": "Admin",
                    "municipality": "Basco",
                    "notes": "Trusted to help manage the platform.",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(invite.status_code, 201)
        invitation = RoleInvitation.objects.get(email="new.admin@example.com")
        accept = self.client.post(
            f"/api/users/role-invitations/{invitation.token}/accept",
            data=json.dumps(
                {
                    "username": "new.admin",
                    "password": "StrongInvitePass123!",
                    "password_confirm": "StrongInvitePass123!",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(accept.status_code, 201)
        invited_user = User.objects.get(email="new.admin@example.com")
        self.assertTrue(invited_user.groups.filter(name="Contributor").exists())
        self.assertTrue(invited_user.groups.filter(name="Reviewer").exists())
        self.assertTrue(invited_user.groups.filter(name="Admin").exists())
        self.assertTrue(invited_user.is_staff)
        self.assertEqual(accept.json()["role"], "admin")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_reviewer_cannot_invite_admin_by_email(self):
        self.client.force_login(self.reviewer_a)
        invite = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps({"email": "admin.blocked@example.com", "role": "admin"}),
            content_type="application/json",
        )

        self.assertEqual(invite.status_code, 400)
        self.assertIn("Only admin users can invite administrators", invite.json()["detail"])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_reviewer_cannot_invite_consultant_by_email(self):
        self.client.force_login(self.reviewer_a)
        invite = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps({"email": "consultant.blocked@example.com", "role": "consultant"}),
            content_type="application/json",
        )

        self.assertEqual(invite.status_code, 400)
        self.assertIn("Only admin users can invite consultants", invite.json()["detail"])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_reviewer_can_invite_by_email(self):
        self.client.force_login(self.reviewer_a)
        invite = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps({"email": "reviewer.invited@example.com", "role": "contributor"}),
            content_type="application/json",
        )

        self.assertEqual(invite.status_code, 201)
        self.assertIn("/roles?invite=", invite.json()["accept_url"])
        self.assertEqual(len(mail.outbox), 1)

    def test_duplicate_pending_role_application_is_blocked(self):
        self.client.force_login(self.applicant)
        first = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "contributor"}),
            content_type="application/json",
        )
        second = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "contributor"}),
            content_type="application/json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 400)
        self.assertIn("pending contributor application", second.json()["detail"])

    def test_public_role_application_rejects_invalid_email(self):
        response = self.client.post(
            "/api/users/role-applications",
            data=json.dumps(
                {
                    "target_role": "contributor",
                    "first_name": "Invalid",
                    "last_name": "Email",
                    "email": "not-an-email",
                    "municipality": "Basco",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("valid email", response.json()["detail"].lower())

    def test_public_role_application_duplicate_email_shows_pending_message(self):
        payload = {
            "target_role": "contributor",
            "first_name": "Pending",
            "last_name": "Applicant",
            "email": "pending-applicant@example.com",
            "municipality": "Basco",
        }
        first = self.client.post(
            "/api/users/role-applications",
            data=json.dumps(payload),
            content_type="application/json",
        )
        second = self.client.post(
            "/api/users/role-applications",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 400)
        self.assertIn("already has a pending contributor application", second.json()["detail"])
        self.assertNotIn("below", second.json()["detail"].lower())

    def test_admin_email_invitation_rejects_invalid_email(self):
        self.client.force_login(self.admin_user)
        response = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps({"email": "invalid-address", "role": "contributor"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("valid email", response.json()["detail"].lower())

    def test_admin_users_endpoint_lists_people_with_profiles_and_stats(self):
        contributor_group, _ = Group.objects.get_or_create(name="Contributor")
        self.applicant.groups.add(contributor_group)
        profile, _ = UserProfile.objects.get_or_create(user=self.applicant)
        profile.municipality = "Basco"
        profile.affiliation = "Community archive"
        profile.save()
        stats, _ = UserContributionStats.objects.get_or_create(user=self.applicant)
        stats.combined_total = 3
        stats.review_completed_total = 1
        stats.save()

        self.client.force_login(self.admin_user)
        response = self.client.get("/api/admin/users?q=Basco&group=Contributor")

        self.assertEqual(response.status_code, 200)
        rows = response.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["username"], self.applicant.username)
        self.assertEqual(rows[0]["profile"]["municipality"], "Basco")
        self.assertEqual(rows[0]["stats"]["combined_total"], 3)
        self.assertIn("Contributor", rows[0]["groups"])

    def test_admin_users_endpoint_requires_admin_access(self):
        self.client.force_login(self.reviewer_a)
        response = self.client.get("/api/admin/users")
        self.assertEqual(response.status_code, 403)

    def test_admin_user_activity_endpoint_caps_rows_without_deleting_audit_records(self):
        EntryRevision.objects.bulk_create(
            [
                EntryRevision(
                    contributor=self.applicant,
                    proposed_data={"term": f"activity-{index}"},
                    status=EntryRevision.Status.DRAFT,
                )
                for index in range(501)
            ]
        )

        self.client.force_login(self.admin_user)
        response = self.client.get(f"/api/admin/users/{self.applicant.username}/activity")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["limit"], 500)
        self.assertEqual(len(payload["rows"]), 500)
        self.assertEqual(EntryRevision.objects.filter(contributor=self.applicant).count(), 501)

    def test_admin_user_activity_endpoint_includes_login_logout_events(self):
        login_response = self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": self.applicant.username, "password": "testpass123"}),
            content_type="application/json",
            HTTP_USER_AGENT="ActivityTestBrowser",
            REMOTE_ADDR="127.0.0.1",
        )
        self.assertEqual(login_response.status_code, 200)

        logout_response = self.client.post(
            "/api/auth/logout",
            content_type="application/json",
            HTTP_USER_AGENT="ActivityTestBrowser",
            REMOTE_ADDR="127.0.0.1",
        )
        self.assertEqual(logout_response.status_code, 200)
        self.assertEqual(UserSessionEvent.objects.filter(user=self.applicant).count(), 2)

        self.client.force_login(self.admin_user)
        response = self.client.get(f"/api/admin/users/{self.applicant.username}/activity")

        self.assertEqual(response.status_code, 200)
        labels = [row["label"] for row in response.json()["rows"] if row["kind"] == "session"]
        self.assertIn("Login", labels)
        self.assertIn("Logout", labels)

    def test_admin_user_activity_endpoint_requires_admin_access(self):
        self.client.force_login(self.reviewer_a)
        response = self.client.get(f"/api/admin/users/{self.applicant.username}/activity")
        self.assertEqual(response.status_code, 403)


class PublicRoleCredentialClaimTests(TestCase):
    def setUp(self):
        self.applicant = User.objects.create_user(
            username="pending.claim",
            email="claim@example.com",
            first_name="Claim",
            last_name="Applicant",
        )
        self.applicant.set_unusable_password()
        self.applicant.save(update_fields=["password"])

        self.approved_application = RoleApplication.objects.create(
            applicant=self.applicant,
            target_role=RoleApplication.TargetRole.CONTRIBUTOR,
            status=RoleApplication.Status.APPROVED,
        )

    def test_public_claim_sets_username_and_password_for_approved_applicant(self):
        response = self.client.post(
            "/api/users/role-applications/claim-access",
            data=json.dumps(
                {
                    "email": "claim@example.com",
                    "application_id": str(self.approved_application.id),
                    "username": "claim.user",
                    "password": "IvatanHeritage!2026",
                    "password_confirm": "IvatanHeritage!2026",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["username"], "claim.user")

        self.applicant.refresh_from_db()
        self.assertEqual(self.applicant.username, "claim.user")
        self.assertTrue(self.applicant.has_usable_password())
        self.assertTrue(self.applicant.check_password("IvatanHeritage!2026"))

    def test_public_claim_requires_approved_application(self):
        pending_application = RoleApplication.objects.create(
            applicant=self.applicant,
            target_role=RoleApplication.TargetRole.REVIEWER,
            status=RoleApplication.Status.PENDING,
        )
        response = self.client.post(
            "/api/users/role-applications/claim-access",
            data=json.dumps(
                {
                    "email": "claim@example.com",
                    "application_id": str(pending_application.id),
                    "username": "claim.user",
                    "password": "IvatanHeritage!2026",
                    "password_confirm": "IvatanHeritage!2026",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Approved application reference not found", response.json()["detail"])

    def test_public_claim_blocks_taken_username(self):
        User.objects.create_user(
            username="already.taken",
            password="another-pass-123",
        )
        response = self.client.post(
            "/api/users/role-applications/claim-access",
            data=json.dumps(
                {
                    "email": "claim@example.com",
                    "application_id": str(self.approved_application.id),
                    "username": "already.taken",
                    "password": "IvatanHeritage!2026",
                    "password_confirm": "IvatanHeritage!2026",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "That username is already taken.")


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

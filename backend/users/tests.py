import json
import tempfile
from unittest.mock import patch
from urllib.parse import urlparse

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core import mail
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from dictionary.models import Entry, EntryRevision, EntryStatus
from folklore.models import FolkloreEntry
from reviews.models import Review
from reviews.services import submit_review
from users.contributions import contribution_summary_for_user, global_leaderboard
from users.models import (
    AdminAccountAction,
    ContributionEvent,
    GamificationConfig,
    MunicipalityMonthlyWinner,
    MunicipalityStats,
    Notification,
    RecognitionEvent,
    RoleApplication,
    RoleApplicationDecision,
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


def valid_captcha_payload(answer=7):
    return {"turnstile_token": "test-turnstile-token"}


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

    def _mark_leaderboard_eligible(
        self, user, *, municipality="Basco", include_in_leaderboard=True
    ):
        user.groups.add(self.contributor_group)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.municipality = municipality
        profile.include_in_leaderboard = include_in_leaderboard
        profile.save(update_fields=["municipality", "include_in_leaderboard"])
        if not user.role_onboarding_records.filter(
            role=RoleOnboardingRecord.Role.CONTRIBUTOR
        ).exists():
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

    def test_global_leaderboard_excludes_unactivated_role_group_account(self):
        self.contributor1.set_unusable_password()
        self.contributor1.save(update_fields=["password"])
        self.contributor1.groups.add(self.contributor_group)
        UserProfile.objects.create(
            user=self.contributor1,
            municipality="Basco",
        )

        response = self.client.get("/leaderboard/global")

        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        usernames = [row["username"] for row in payload["rows"]]
        self.assertNotIn(self.contributor1.username, usernames)

    def test_global_leaderboard_includes_role_group_account_with_zero_score(self):
        self.contributor1.groups.add(self.contributor_group)
        UserProfile.objects.create(
            user=self.contributor1,
            municipality="Basco",
        )

        response = self.client.get("/leaderboard/global")

        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        row = next(
            item for item in payload["rows"] if item["username"] == self.contributor1.username
        )
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
            first_name="Profile",
            last_name="User",
        )
        UserProfile.objects.create(
            user=self.user,
            municipality="Basco",
            name_extension="III",
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

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        FRONTEND_BASE_URL="https://chirinivatan.test",
        DEFAULT_FROM_EMAIL="Chirin Ivatan <noreply@chirinivatan.test>",
    )
    def test_profile_email_change_requires_verification_before_update(self):
        self.user.email = "old@example.com"
        self.user.save(update_fields=["email"])
        self.client.force_login(self.user)

        response = self.client.post(
            "/api/profile/my",
            data=json.dumps({"email": "new@example.com"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["email_change_pending"])
        self.assertEqual(payload["pending_email"], "new@example.com")
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "old@example.com")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("new@example.com", mail.outbox[0].to)

        verify_url = next(
            line
            for line in mail.outbox[0].body.splitlines()
            if "/api/profile/email/verify/" in line
        )
        verify_path = urlparse(verify_url).path
        verify_response = self.client.get(verify_path)

        self.assertEqual(verify_response.status_code, 302)
        self.assertIn("email_verified=1", verify_response["Location"])
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new@example.com")

    def test_profile_username_can_be_changed(self):
        self.client.force_login(self.user)

        response = self.client.post(
            "/api/profile/my",
            data=json.dumps({"username": "better.profile"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "better.profile")
        self.assertEqual(response.json()["username"], "better.profile")

    def test_profile_username_change_blocks_taken_username(self):
        User.objects.create_user(username="already_taken", password="testpass123")
        self.client.force_login(self.user)

        response = self.client.post(
            "/api/profile/my",
            data=json.dumps({"username": "already_taken"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "That username is already taken.")
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "profile_user")

    def test_public_profile_normalizes_all_caps_names_and_affiliations(self):
        self.user.username = "KADAMI"
        self.user.first_name = "KRISTELLE"
        self.user.last_name = "ADAMI"
        self.user.save(update_fields=["username", "first_name", "last_name"])
        profile = self.user.profile
        profile.affiliation = "IVATAN HERITAGE GROUP"
        profile.occupation = "COMMUNITY RESEARCHER"
        profile.cultural_affiliations = [
            {"role": "CULTURAL STEWARD", "organization": "BASCO HERITAGE COUNCIL"}
        ]
        profile.other_affiliations = [
            {"designation": "FACULTY MEMBER", "institution": "BATANES STATE COLLEGE"}
        ]
        profile.save()

        response = self.client.get("/api/users/kadami")

        self.assertEqual(response.status_code, 200)
        header = response.json()["header"]
        self.assertEqual(header["username"], "kadami")
        self.assertEqual(header["first_name"], "Kristelle")
        self.assertEqual(header["last_name"], "Adami")
        self.assertEqual(header["affiliation"], "Ivatan Heritage Group")
        self.assertEqual(header["occupation"], "Community Researcher")
        self.assertEqual(
            header["cultural_affiliations"],
            [{"role": "Cultural Steward", "organization": "Basco Heritage Council"}],
        )
        self.assertEqual(
            header["other_affiliations"],
            [{"designation": "Faculty Member", "institution": "Batanes State College"}],
        )

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
        self.assertEqual(payload["header"]["name_extension"], "III")
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
        self.regular_user = User.objects.create_user(
            username="regular_user", password="testpass123"
        )

    def test_public_site_content_returns_defaults(self):
        response = self.client.get("/api/site-content")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["is_default"])
        self.assertEqual(payload["about_heading"], "About the project")
        self.assertEqual(payload["yaru_heading"], "The Digital Yaru")
        self.assertFalse(payload["maintenance_enabled"])
        self.assertIn("temporarily paused", payload["maintenance_message"])
        self.assertTrue(payload["privacy_notice_paragraphs"])
        self.assertTrue(payload["media_upload_policy_paragraphs"])
        self.assertTrue(payload["contributor_agreement_paragraphs"])

    def test_admin_can_update_site_content(self):
        self.client.force_login(self.admin_user)
        response = self.client.post(
            "/api/site-content",
            data=json.dumps(
                {
                    "brand_name": "Chirin Ivatan Archive",
                    "brand_logo_url": "https://example.com/brand.png",
                    "landing_intro_text": "Editable landing introduction.",
                    "landing_body_text": "Editable landing supporting text.",
                    "footer_left_text": "Left footer",
                    "footer_center_text": "Center footer",
                    "footer_right_text": "Right footer",
                    "about_heading": "About Chirin",
                    "about_intro_paragraphs": ["Intro one", ""],
                    "about_body_paragraphs": ["Body"],
                    "about_rationale_paragraphs": [],
                    "about_future_paragraphs": [],
                    "about_final_quote": "Closing",
                    "yaru_heading": "Digital Yaru",
                    "yaru_intro_paragraphs": ["Yaru intro"],
                    "privacy_notice_paragraphs": ["Privacy", ""],
                    "media_upload_policy_paragraphs": ["Media policy"],
                    "contributor_agreement_paragraphs": ["Contributor agreement"],
                    "maintenance_enabled": True,
                    "maintenance_message": "We are updating the archive tonight.",
                    "support_statements": [
                        {"quote": "Important work", "name": "Supporter", "role": "Teacher"},
                        {"quote": "", "name": "", "role": ""},
                    ],
                    "partner_details": [
                        {
                            "name": "Partner A",
                            "description": "Legacy details should be discarded",
                            "url": "https://example.com",
                            "logo_url": "https://example.com/logo.png",
                        }
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
        self.assertEqual(payload["brand_name"], "Chirin Ivatan Archive")
        self.assertEqual(payload["brand_logo_url"], "https://example.com/brand.png")
        self.assertEqual(payload["landing_intro_text"], "Editable landing introduction.")
        self.assertEqual(payload["footer_center_text"], "Center footer")
        self.assertEqual(payload["about_heading"], "About Chirin")
        self.assertEqual(payload["about_intro_paragraphs"], ["Intro one"])
        self.assertEqual(payload["privacy_notice_paragraphs"], ["Privacy"])
        self.assertEqual(payload["media_upload_policy_paragraphs"], ["Media policy"])
        self.assertEqual(payload["contributor_agreement_paragraphs"], ["Contributor agreement"])
        self.assertTrue(payload["maintenance_enabled"])
        self.assertEqual(payload["maintenance_message"], "We are updating the archive tonight.")
        self.assertEqual(payload["support_statements"][0]["name"], "Supporter")
        self.assertEqual(
            payload["partner_details"][0],
            {
                "name": "Partner A",
                "url": "https://example.com",
                "logo_url": "https://example.com/logo.png",
            },
        )
        self.assertEqual(payload["faq_sections"][0]["roles"], ["visitor", "admin"])
        self.assertEqual(payload["faq_sections"][0]["items"][0]["bullets"], ["One"])
        self.assertEqual(payload["faq_sections"][0]["items"][0]["image_alt"], "Sample graph")
        self.assertEqual(SiteContentSettings.objects.get(key="default").updated_by, self.admin_user)

    def test_admin_can_upload_partner_logo(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                self.client.force_login(self.admin_user)
                logo = SimpleUploadedFile(
                    "partner.gif",
                    (
                        b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00"
                        b"\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,"
                        b"\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
                    ),
                    content_type="image/gif",
                )
                response = self.client.post(
                    "/api/site-content/partner-media",
                    data={"image": logo},
                )

                self.assertEqual(response.status_code, 201)
                self.assertIn("/media/site/partners/", response.json()["url"])

    def test_admin_can_upload_brand_logo(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                self.client.force_login(self.admin_user)
                logo = SimpleUploadedFile(
                    "brand.gif",
                    (
                        b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00"
                        b"\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,"
                        b"\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
                    ),
                    content_type="image/gif",
                )
                response = self.client.post(
                    "/api/site-content/brand-media",
                    data={"image": logo},
                )

                self.assertEqual(response.status_code, 201)
                self.assertIn("/media/site/brand/", response.json()["url"])

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

        unactivated_contributor = User.objects.create_user(
            username="unactivated_contributor",
            first_name="Unactivated",
            last_name="Contributor",
        )
        unactivated_contributor.set_unusable_password()
        unactivated_contributor.save(update_fields=["password"])
        unactivated_contributor.groups.add(contributor_group)
        UserProfile.objects.get_or_create(user=unactivated_contributor)

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
        self.assertNotIn(unactivated_contributor.username, rows)
        self.assertNotIn(hidden_admin.username, rows)


class RoleOnboardingFlowTests(TestCase):
    def setUp(self):
        self.contributor_group, _ = Group.objects.get_or_create(name="Contributor")
        self.reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.admin_group, _ = Group.objects.get_or_create(name="Admin")

        self.reviewer_a = User.objects.create_user(username="reviewer_a", password="testpass123")
        self.reviewer_a.groups.add(self.reviewer_group)

        self.reviewer_b = User.objects.create_user(username="reviewer_b", password="testpass123")
        self.reviewer_b.groups.add(self.reviewer_group)

        self.admin_user = User.objects.create_user(username="admin_user", password="testpass123")
        self.admin_user.groups.add(self.admin_group)
        self.admin_user_b = User.objects.create_user(
            username="admin_user_b", password="testpass123"
        )
        self.admin_user_b.groups.add(self.admin_group)

        self.applicant = User.objects.create_user(username="applicant", password="testpass123")
        self.invitee = User.objects.create_user(username="invitee", password="testpass123")

    def test_contributor_application_requires_two_approvals(self):
        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "contributor", **valid_captcha_payload()}),
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
        self.assertEqual(decide.json()["application_status"], RoleApplication.Status.PENDING)

        self.client.force_login(self.admin_user)
        decide = self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "second approval"}),
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

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        FRONTEND_BASE_URL="https://chirinivatan.test",
        DEFAULT_FROM_EMAIL="Chirin Ivatan <noreply@chirinivatan.test>",
    )
    def test_final_role_approval_emails_applicant_with_approvers_and_activation_link(self):
        self.applicant.email = "approved.applicant@example.com"
        self.applicant.save(update_fields=["email"])

        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "contributor", **valid_captcha_payload()}),
            content_type="application/json",
        )
        application_id = create.json()["application_id"]

        self.client.force_login(self.reviewer_a)
        first_decision = self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "looks good"}),
            content_type="application/json",
        )
        self.assertEqual(first_decision.status_code, 200)
        self.assertEqual(
            first_decision.json()["application_status"], RoleApplication.Status.PENDING
        )
        self.assertEqual(len(mail.outbox), 0)

        self.client.force_login(self.admin_user)
        with self.captureOnCommitCallbacks(execute=True):
            final_decision = self.client.post(
                f"/api/users/role-applications/{application_id}/decide",
                data=json.dumps({"decision": "approve", "notes": "second approval"}),
                content_type="application/json",
            )

        self.assertEqual(final_decision.status_code, 200)
        self.assertEqual(
            final_decision.json()["application_status"], RoleApplication.Status.APPROVED
        )
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ["approved.applicant@example.com"])
        self.assertIn("Contributor application was approved", email.subject)
        self.assertIn("reviewer_a", email.body)
        self.assertIn("admin_user", email.body)
        self.assertIn(
            "https://chirinivatan.test/roles?status_email=approved.applicant%40example.com",
            email.body,
        )
        self.assertIn(str(application_id), email.body)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        FRONTEND_BASE_URL="https://chirinivatan.test",
        DEFAULT_FROM_EMAIL="Chirin Ivatan <noreply@chirinivatan.test>",
    )
    def test_public_approved_application_waits_for_activation_before_role_group(self):
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps(
                {
                    "target_role": "contributor",
                    "first_name": "Public",
                    "last_name": "Applicant",
                    "email": "public.awaiting@example.com",
                    "municipality": "Basco",
                    **valid_captcha_payload(),
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201)
        application_id = create.json()["application_id"]

        self.client.force_login(self.reviewer_a)
        self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "approve 1"}),
            content_type="application/json",
        )
        self.client.force_login(self.admin_user)
        with self.captureOnCommitCallbacks(execute=True):
            final_decision = self.client.post(
                f"/api/users/role-applications/{application_id}/decide",
                data=json.dumps({"decision": "approve", "notes": "approve 2"}),
                content_type="application/json",
            )

        self.assertEqual(final_decision.status_code, 200)
        self.assertEqual(
            final_decision.json()["application_status"], RoleApplication.Status.APPROVED
        )
        applicant = User.objects.get(email="public.awaiting@example.com")
        self.assertFalse(applicant.has_usable_password())
        self.assertFalse(applicant.is_active)
        self.assertFalse(applicant.groups.filter(name="Contributor").exists())

    def test_reviewer_application_can_activate_via_two_admins(self):
        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps(
                {
                    "target_role": "reviewer",
                    "reviewer_reason": "I can help validate submissions.",
                    **valid_captcha_payload(),
                }
            ),
            content_type="application/json",
        )
        application_id = create.json()["application_id"]

        self.client.force_login(self.admin_user)
        decide_1 = self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "admin approval 1"}),
            content_type="application/json",
        )
        self.assertEqual(decide_1.json()["application_status"], RoleApplication.Status.PENDING)

        self.client.force_login(self.admin_user_b)
        decide_2 = self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "admin approval 2"}),
            content_type="application/json",
        )
        self.assertEqual(decide_2.json()["application_status"], RoleApplication.Status.APPROVED)

    def test_reviewer_application_requires_two_reviewers(self):
        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps(
                {
                    "target_role": "reviewer",
                    "reviewer_reason": "I can help validate submissions.",
                    **valid_captcha_payload(),
                }
            ),
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

    def test_approved_by_current_reviewer_moves_from_pending_to_awaiting_bucket(self):
        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps(
                {
                    "target_role": "reviewer",
                    "reviewer_reason": "I can help validate submissions.",
                    **valid_captcha_payload(),
                }
            ),
            content_type="application/json",
        )
        application_id = create.json()["application_id"]

        self.client.force_login(self.reviewer_a)
        decide = self.client.post(
            f"/api/users/role-applications/{application_id}/decide",
            data=json.dumps({"decision": "approve", "notes": "reviewer approval"}),
            content_type="application/json",
        )
        self.assertEqual(decide.status_code, 200)
        self.assertEqual(decide.json()["application_status"], RoleApplication.Status.PENDING)

        pending_for_reviewer_a = self.client.get("/api/admin/role-applications?status=pending")
        self.assertEqual(pending_for_reviewer_a.status_code, 200)
        self.assertEqual(pending_for_reviewer_a.json()["rows"], [])

        approved_for_reviewer_a = self.client.get("/api/admin/role-applications?status=approved")
        self.assertEqual(approved_for_reviewer_a.status_code, 200)
        self.assertEqual(approved_for_reviewer_a.json()["rows"], [])

        awaiting_for_reviewer_a = self.client.get(
            "/api/admin/role-applications?status=awaiting_quorum"
        )
        self.assertEqual(awaiting_for_reviewer_a.status_code, 200)
        row = awaiting_for_reviewer_a.json()["rows"][0]
        self.assertEqual(row["application_id"], application_id)
        self.assertEqual(row["status"], RoleApplication.Status.PENDING)
        self.assertEqual(row["screening_status"], "awaiting_quorum")
        self.assertEqual(row["current_user_decision"], RoleApplicationDecision.Decision.APPROVE)

        self.client.force_login(self.reviewer_b)
        pending_for_reviewer_b = self.client.get("/api/admin/role-applications?status=pending")
        self.assertEqual(pending_for_reviewer_b.status_code, 200)
        row = pending_for_reviewer_b.json()["rows"][0]
        self.assertEqual(row["application_id"], application_id)
        self.assertEqual(row["screening_status"], RoleApplication.Status.PENDING)
        self.assertEqual(row["current_user_decision"], "")

    def test_admin_can_release_email_from_rejected_public_application(self):
        public_applicant = User.objects.create_user(
            username="public_rejected",
            email="released@example.com",
        )
        public_applicant.set_unusable_password()
        public_applicant.save(update_fields=["password"])
        application = RoleApplication.objects.create(
            applicant=public_applicant,
            target_role=RoleApplication.TargetRole.CONTRIBUTOR,
            status=RoleApplication.Status.REJECTED,
        )

        self.client.force_login(self.admin_user)
        response = self.client.post(f"/api/admin/role-applications/{application.id}/release-email")

        self.assertEqual(response.status_code, 200)
        public_applicant.refresh_from_db()
        self.assertEqual(public_applicant.email, "")
        self.assertEqual(response.json()["released_email"], "released@example.com")
        self.assertEqual(response.json()["application"]["applicant"]["email"], "")

    def test_release_email_refuses_credentialed_rejected_applicant(self):
        self.applicant.email = "real.user@example.com"
        self.applicant.save(update_fields=["email"])
        application = RoleApplication.objects.create(
            applicant=self.applicant,
            target_role=RoleApplication.TargetRole.CONTRIBUTOR,
            status=RoleApplication.Status.REJECTED,
        )

        self.client.force_login(self.admin_user)
        response = self.client.post(f"/api/admin/role-applications/{application.id}/release-email")

        self.assertEqual(response.status_code, 400)
        self.applicant.refresh_from_db()
        self.assertEqual(self.applicant.email, "real.user@example.com")

    def test_reviewer_application_can_activate_via_reviewer_plus_admin(self):
        self.client.force_login(self.applicant)
        create = self.client.post(
            "/api/users/role-applications",
            data=json.dumps(
                {
                    "target_role": "reviewer",
                    "reviewer_reason": "I can help validate submissions.",
                    **valid_captcha_payload(),
                }
            ),
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

    def test_non_contributor_reviewer_application_does_not_require_reason(self):
        self.client.force_login(self.applicant)
        response = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "reviewer", **valid_captcha_payload()}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["target_role"], RoleApplication.TargetRole.REVIEWER)
        self.assertEqual(response.json()["reviewer_reason"], "")

    def test_contributor_reviewer_application_requires_reason(self):
        self.applicant.groups.add(self.contributor_group)
        self.client.force_login(self.applicant)
        response = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "reviewer", **valid_captcha_payload()}),
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
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                self.client.force_login(self.admin_user)
                photo = SimpleUploadedFile(
                    "consultant.gif",
                    (
                        b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00"
                        b"\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,"
                        b"\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
                    ),
                    content_type="image/gif",
                )
                response = self.client.post(
                    "/api/admin/consultant-profiles",
                    data={
                        "first_name": "Apo",
                        "last_name": "Consultant",
                        "municipality": "Sabtang",
                        "post_nominals": "Elder",
                        "cultural_affiliations": json.dumps(
                            [{"role": "Knowledge holder", "organization": "Sabtang community"}]
                        ),
                        "other_affiliations": json.dumps(
                            [{"designation": "Adviser", "institution": "Ivatan Cultural Council"}]
                        ),
                        "bio": "Shares context without managing an account.",
                        "notes": "Created after verbal consent.",
                        "profile_photo": photo,
                    },
                )

                self.assertEqual(response.status_code, 201)
                payload = response.json()
                consultant = User.objects.get(username=payload["user"]["username"])
                self.assertFalse(consultant.has_usable_password())
                self.assertTrue(consultant.groups.filter(name="Contributor").exists())
                self.assertTrue(consultant.groups.filter(name="Reviewer").exists())
                self.assertTrue(consultant.groups.filter(name="Consultant").exists())
                self.assertFalse(consultant.profile.include_in_leaderboard)
                self.assertEqual(
                    consultant.profile.cultural_affiliations,
                    [{"role": "Knowledge Holder", "organization": "Sabtang Community"}],
                )
                self.assertEqual(
                    consultant.profile.other_affiliations,
                    [{"designation": "Adviser", "institution": "Ivatan Cultural Council"}],
                )
                self.assertEqual(
                    consultant.profile.affiliation,
                    "Sabtang Community, Ivatan Cultural Council",
                )
                self.assertEqual(consultant.profile.occupation, "Knowledge Holder, Adviser")
                self.assertTrue(bool(consultant.profile.profile_photo))
                self.assertIn("Created as Consultant profile", payload["accountability_label"])

                public_profile = self.client.get(f"/api/users/{consultant.username}").json()
                self.assertEqual(public_profile["header"]["role"], "Consultant")
                self.assertTrue(public_profile["header"]["profile_photo"])

                replacement_photo = SimpleUploadedFile(
                    "consultant-updated.gif",
                    (
                        b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00"
                        b"\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,"
                        b"\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
                    ),
                    content_type="image/gif",
                )
                update = self.client.post(
                    f"/api/admin/consultant-profiles/{consultant.username}",
                    data={
                        "first_name": "Apo",
                        "last_name": "Updated",
                        "email": "apo.updated@example.com",
                        "municipality": "Ivana",
                        "post_nominals": "Elder",
                        "cultural_affiliations": json.dumps(
                            [{"role": "Elder", "organization": "Ivana community"}]
                        ),
                        "other_affiliations": json.dumps([]),
                        "bio": "Updated public bionote.",
                        "notes": "Updated with renewed consent.",
                        "profile_photo": replacement_photo,
                    },
                )
                self.assertEqual(update.status_code, 200)
                consultant.refresh_from_db()
                consultant.profile.refresh_from_db()
                self.assertEqual(consultant.last_name, "Updated")
                self.assertEqual(consultant.email, "apo.updated@example.com")
                self.assertEqual(consultant.profile.municipality, "Ivana")
                self.assertEqual(consultant.profile.affiliation, "Ivana Community")
                self.assertEqual(consultant.profile.occupation, "Elder")
                self.assertIn("consultant-updated", consultant.profile.profile_photo.name)
                record = consultant.role_onboarding_records.get(
                    role=RoleOnboardingRecord.Role.CONSULTANT,
                    method=RoleOnboardingRecord.Method.ADMIN_CREATED,
                )
                self.assertEqual(record.accountability_notes, "Updated with renewed consent.")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_admin_can_invite_by_email_and_invitee_accepts_without_application_quorum(self):
        self.client.force_login(self.admin_user)
        invite = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps(
                {
                    "email": "new.invitee@example.com",
                    "role": "reviewer",
                    "notes": "Vetted by admin.",
                    **valid_captcha_payload(),
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(invite.status_code, 201)
        payload = invite.json()
        self.assertIn("/roles?invite=", payload["accept_url"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(payload["accept_url"], mail.outbox[0].body)
        self.assertEqual(len(mail.outbox[0].alternatives), 1)
        html_body, content_type = mail.outbox[0].alternatives[0]
        self.assertEqual(content_type, "text/html")
        self.assertIn("You are invited to join the digital yaru", html_body)
        self.assertIn(payload["accept_url"], html_body)
        self.assertIn("Accept invitation", html_body)

        invitation = RoleInvitation.objects.get(email="new.invitee@example.com")
        accept = self.client.post(
            f"/api/users/role-invitations/{invitation.token}/accept",
            data=json.dumps(
                {
                    "first_name": "New",
                    "last_name": "Invitee",
                    "name_extension": "Jr.",
                    "municipality": "Uyugan",
                    "username": "new.invitee",
                    "password": "StrongInvitePass123!",
                    "password_confirm": "StrongInvitePass123!",
                    **valid_captcha_payload(),
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(accept.status_code, 201)
        invited_user = User.objects.get(email="new.invitee@example.com")
        self.assertTrue(invited_user.groups.filter(name="Contributor").exists())
        self.assertTrue(invited_user.groups.filter(name="Reviewer").exists())
        self.assertEqual(invited_user.first_name, "New")
        self.assertEqual(invited_user.last_name, "Invitee")
        self.assertEqual(invited_user.profile.name_extension, "Jr.")
        self.assertEqual(invited_user.profile.municipality, "Uyugan")
        self.assertTrue(invited_user.profile.onboarding_prompt_pending)
        self.assertFalse(invited_user.profile.onboarding_prompt_dismissed)
        self.assertFalse(RoleApplication.objects.filter(applicant=invited_user).exists())
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, RoleInvitation.Status.ACCEPTED)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_resending_same_email_role_replaces_prior_pending_invitation(self):
        self.client.force_login(self.admin_user)
        invite_payload = {
            "email": "replace.invitee@example.com",
            "role": "contributor",
            "notes": "Trusted contributor.",
            **valid_captcha_payload(),
        }
        first = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps(invite_payload),
            content_type="application/json",
        )
        self.assertEqual(first.status_code, 201)
        first_invitation = RoleInvitation.objects.get(email="replace.invitee@example.com")

        second = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps(invite_payload),
            content_type="application/json",
        )

        self.assertEqual(second.status_code, 201)
        first_invitation.refresh_from_db()
        self.assertEqual(first_invitation.status, RoleInvitation.Status.REPLACED)
        latest_invitation = RoleInvitation.objects.exclude(id=first_invitation.id).get(
            email="replace.invitee@example.com",
        )
        self.assertEqual(latest_invitation.status, RoleInvitation.Status.PENDING)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_new_email_invitation_requires_profile_details_when_accepted(self):
        self.client.force_login(self.admin_user)
        invite = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps(
                {
                    "email": "profile.required@example.com",
                    "role": "contributor",
                    "notes": "Trusted contributor.",
                    **valid_captcha_payload(),
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(invite.status_code, 201)

        invitation = RoleInvitation.objects.get(email="profile.required@example.com")
        self.assertEqual(invitation.first_name, "")
        self.assertEqual(invitation.last_name, "")
        self.assertEqual(invitation.municipality, "")

        accept = self.client.post(
            f"/api/users/role-invitations/{invitation.token}/accept",
            data=json.dumps(
                {
                    "username": "profile.required",
                    "password": "StrongInvitePass123!",
                    "password_confirm": "StrongInvitePass123!",
                    **valid_captcha_payload(),
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(accept.status_code, 400)
        self.assertIn(
            "First name, last name, and municipality are required", accept.json()["detail"]
        )

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
                    **valid_captcha_payload(),
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
                    **valid_captcha_payload(),
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
                    **valid_captcha_payload(),
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
                    **valid_captcha_payload(),
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
            data=json.dumps(
                {"email": "admin.blocked@example.com", "role": "admin", **valid_captcha_payload()}
            ),
            content_type="application/json",
        )

        self.assertEqual(invite.status_code, 400)
        self.assertIn("Only admin users can invite administrators", invite.json()["detail"])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_reviewer_cannot_invite_consultant_by_email(self):
        self.client.force_login(self.reviewer_a)
        invite = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps(
                {
                    "email": "consultant.blocked@example.com",
                    "role": "consultant",
                    **valid_captcha_payload(),
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(invite.status_code, 400)
        self.assertIn("Only admin users can invite consultants", invite.json()["detail"])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_reviewer_can_invite_by_email(self):
        self.client.force_login(self.reviewer_a)
        invite = self.client.post(
            "/api/admin/role-invitations/email",
            data=json.dumps(
                {
                    "email": "reviewer.invited@example.com",
                    "role": "contributor",
                    **valid_captcha_payload(),
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(invite.status_code, 201)
        self.assertIn("/roles?invite=", invite.json()["accept_url"])
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_email_invitation_list_only_includes_current_users_invites(self):
        RoleInvitation.objects.create(
            email="admin.invited@example.com",
            role=RoleOnboardingRecord.Role.CONTRIBUTOR,
            invited_by=self.admin_user,
        )
        RoleInvitation.objects.create(
            email="reviewer.invited@example.com",
            role=RoleOnboardingRecord.Role.CONTRIBUTOR,
            invited_by=self.reviewer_a,
        )

        self.client.force_login(self.reviewer_a)
        reviewer_response = self.client.get("/api/admin/role-invitations/email")

        self.assertEqual(reviewer_response.status_code, 200)
        self.assertEqual(
            [row["email"] for row in reviewer_response.json()["rows"]],
            ["reviewer.invited@example.com"],
        )

        self.client.force_login(self.admin_user)
        admin_response = self.client.get("/api/admin/role-invitations/email")

        self.assertEqual(admin_response.status_code, 200)
        self.assertEqual(
            [row["email"] for row in admin_response.json()["rows"]],
            ["admin.invited@example.com"],
        )

    def test_duplicate_pending_role_application_is_blocked(self):
        self.client.force_login(self.applicant)
        first = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "contributor", **valid_captcha_payload()}),
            content_type="application/json",
        )
        second = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({"target_role": "contributor", **valid_captcha_payload()}),
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
                    **valid_captcha_payload(),
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
            data=json.dumps({**payload, **valid_captcha_payload()}),
            content_type="application/json",
        )
        second = self.client.post(
            "/api/users/role-applications",
            data=json.dumps({**payload, **valid_captcha_payload()}),
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
            data=json.dumps(
                {"email": "invalid-address", "role": "contributor", **valid_captcha_payload()}
            ),
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

    def test_admin_users_endpoint_excludes_registered_only_pending_applicants(self):
        registered_only = User.objects.create_user(
            username="registered_only",
            password="testpass123",
        )
        RoleApplication.objects.create(
            applicant=registered_only,
            target_role=RoleApplication.TargetRole.CONTRIBUTOR,
            status=RoleApplication.Status.PENDING,
        )

        contributor_group, _ = Group.objects.get_or_create(name="Contributor")
        approved_contributor = User.objects.create_user(
            username="test_contributor",
            password="testpass123",
        )
        approved_contributor.groups.add(contributor_group)

        self.client.force_login(self.admin_user)
        response = self.client.get("/api/admin/users")

        self.assertEqual(response.status_code, 200)
        usernames = [row["username"] for row in response.json()["rows"]]
        self.assertIn(self.admin_user.username, usernames)
        self.assertIn(approved_contributor.username, usernames)
        self.assertNotIn(registered_only.username, usernames)

    def test_admin_users_endpoint_keeps_existing_contributor_with_pending_reviewer_application(
        self,
    ):
        contributor_group, _ = Group.objects.get_or_create(name="Contributor")
        self.applicant.groups.add(contributor_group)
        RoleApplication.objects.create(
            applicant=self.applicant,
            target_role=RoleApplication.TargetRole.REVIEWER,
            reviewer_reason="I can help review.",
            status=RoleApplication.Status.PENDING,
        )

        self.client.force_login(self.admin_user)
        response = self.client.get("/api/admin/users")

        self.assertEqual(response.status_code, 200)
        usernames = [row["username"] for row in response.json()["rows"]]
        self.assertIn(self.applicant.username, usernames)

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
        self.applicant.is_active = False
        self.applicant.save(update_fields=["password", "is_active"])

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
        self.assertTrue(self.applicant.is_active)
        self.assertTrue(self.applicant.groups.filter(name="Contributor").exists())
        self.assertTrue(self.applicant.profile.onboarding_prompt_pending)
        self.assertFalse(self.applicant.profile.onboarding_prompt_dismissed)

    def test_public_status_marks_approved_unclaimed_application_as_awaiting_activation(self):
        response = self.client.post(
            "/api/users/role-applications/status",
            data=json.dumps({"email": "claim@example.com"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        row = response.json()["rows"][0]
        self.assertEqual(row["public_status"], "approved_pending_activation")
        self.assertTrue(row["can_claim_credentials"])

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
        self.reviewer = User.objects.create_user(
            username="culture_reviewer", password="testpass123"
        )
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


class AdminAccountControlTests(TestCase):
    def setUp(self):
        admin_group, _ = Group.objects.get_or_create(name="Admin")
        contributor_group, _ = Group.objects.get_or_create(name="Contributor")
        reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")

        self.admin = User.objects.create_user(
            username="account_admin",
            email="admin@example.com",
            password="testpass123",
        )
        self.admin.groups.add(admin_group)
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])

        self.user = User.objects.create_user(
            username="account_user",
            email="user@example.com",
            password="testpass123",
        )
        self.user.groups.add(contributor_group, reviewer_group)
        UserProfile.objects.create(user=self.user, municipality="Basco")
        self.client.force_login(self.admin)

    def test_admin_can_deactivate_and_reactivate_account_with_audit(self):
        response = self.client.post(
            f"/api/admin/users/{self.user.username}/status",
            data=json.dumps({"is_active": False, "notes": "beta account paused"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)
        self.assertTrue(
            AdminAccountAction.objects.filter(
                target_user=self.user,
                admin=self.admin,
                action=AdminAccountAction.Action.DEACTIVATE,
            ).exists()
        )

        response = self.client.post(
            f"/api/admin/users/{self.user.username}/status",
            data=json.dumps({"is_active": True, "notes": "restored"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_admin_cannot_activate_approved_account_before_credentials_are_claimed(self):
        pending_activation_user = User.objects.create_user(
            username="awaiting_activation",
            email="awaiting@example.com",
            is_active=False,
        )
        pending_activation_user.set_unusable_password()
        pending_activation_user.save(update_fields=["password"])
        RoleApplication.objects.create(
            applicant=pending_activation_user,
            target_role=RoleApplication.TargetRole.CONTRIBUTOR,
            status=RoleApplication.Status.APPROVED,
        )

        response = self.client.post(
            f"/api/admin/users/{pending_activation_user.username}/status",
            data=json.dumps({"is_active": True, "notes": "activate early"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        pending_activation_user.refresh_from_db()
        self.assertFalse(pending_activation_user.is_active)
        self.assertIn("must create credentials", response.json()["detail"])

    def test_admin_cannot_deactivate_self(self):
        response = self.client.post(
            f"/api/admin/users/{self.admin.username}/status",
            data=json.dumps({"is_active": False, "notes": "bad idea"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("cannot deactivate your own account", response.json()["detail"])

    def test_admin_cannot_revoke_own_admin_access(self):
        response = self.client.post(
            f"/api/admin/users/{self.admin.username}/roles/revoke",
            data=json.dumps({"role": "admin", "notes": "bad idea"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("cannot revoke your own admin access", response.json()["detail"])

    def test_admin_can_revoke_role_access_with_notes(self):
        response = self.client.post(
            f"/api/admin/users/{self.user.username}/roles/revoke",
            data=json.dumps({"role": "reviewer", "notes": "reviewer access no longer needed"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.groups.filter(name="Reviewer").exists())
        self.assertTrue(self.user.groups.filter(name="Contributor").exists())
        self.assertTrue(
            AdminAccountAction.objects.filter(
                target_user=self.user,
                action=AdminAccountAction.Action.REVOKE_ROLE,
                role="reviewer",
            ).exists()
        )

    def test_suspicious_flag_requires_review_resolution(self):
        response = self.client.post(
            f"/api/admin/users/{self.user.username}/suspicious-flag",
            data=json.dumps({"notes": "login pattern looked wrong"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        flag_id = response.json()["flag"]["action_id"]
        flag = AdminAccountAction.objects.get(id=flag_id)
        self.assertEqual(flag.flag_status, AdminAccountAction.FlagStatus.PENDING)

        response = self.client.post(
            f"/api/admin/account-flags/{flag_id}/resolve",
            data=json.dumps({"decision": "clear", "notes": "verified with account owner"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        flag.refresh_from_db()
        self.assertEqual(flag.flag_status, AdminAccountAction.FlagStatus.CLEARED)
        self.assertEqual(flag.resolved_by, self.admin)

    def test_logged_in_user_can_flag_public_profile_with_captcha(self):
        reporter = User.objects.create_user(username="profile_reporter", password="testpass123")
        self.client.force_login(reporter)

        response = self.client.post(
            f"/api/users/{self.user.username}/suspicious-flag",
            data=json.dumps(
                {
                    "notes": "Profile details look inconsistent with recent activity.",
                    **valid_captcha_payload(),
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        flag = AdminAccountAction.objects.get(
            target_user=self.user,
            action=AdminAccountAction.Action.FLAG_SUSPICIOUS,
        )
        self.assertEqual(flag.admin, reporter)
        self.assertEqual(flag.flag_status, AdminAccountAction.FlagStatus.PENDING)

    def test_public_profile_flag_requires_captcha_and_blocks_self_report(self):
        reporter = User.objects.create_user(username="profile_reporter", password="testpass123")
        self.client.force_login(reporter)

        response = self.client.post(
            f"/api/users/{self.user.username}/suspicious-flag",
            data=json.dumps({"notes": "Missing captcha"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Turnstile", response.json()["detail"])

        response = self.client.post(
            f"/api/users/{reporter.username}/suspicious-flag",
            data=json.dumps({"notes": "self report", **valid_captcha_payload()}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("own account", response.json()["detail"])

    def test_public_profile_flag_requires_login(self):
        self.client.logout()

        response = self.client.post(
            f"/api/users/{self.user.username}/suspicious-flag",
            data=json.dumps({"notes": "anonymous report", **valid_captcha_payload()}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_admin_can_send_password_reset_link(self):
        response = self.client.post(
            f"/api/admin/users/{self.user.username}/password-reset",
            data=json.dumps({"notes": "requested by user"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.email, mail.outbox[0].to)
        self.assertTrue(
            AdminAccountAction.objects.filter(
                target_user=self.user,
                action=AdminAccountAction.Action.SEND_PASSWORD_RESET,
            ).exists()
        )

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_public_password_reset_request_sends_generic_email(self):
        self.client.logout()

        response = self.client.post(
            "/api/auth/password-reset",
            data=json.dumps({"email": self.user.email, **valid_captcha_payload()}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.email, mail.outbox[0].to)
        self.assertIn("password reset link has been sent", response.json()["detail"])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_public_password_reset_request_rejects_unknown_email(self):
        self.client.logout()

        response = self.client.post(
            "/api/auth/password-reset",
            data=json.dumps({"email": "nobody@example.com", **valid_captcha_payload()}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(response.json()["detail"], "No active account uses that email address.")


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


class ProfileOnboardingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="onboarding_user",
            password="testpass123",
            first_name="New",
            last_name="Steward",
        )
        self.profile = UserProfile.objects.create(
            user=self.user,
            municipality="Basco",
            onboarding_prompt_pending=True,
        )

    def test_unauthenticated_dismiss_returns_401(self):
        response = self.client.post("/api/profile/onboarding/dismiss")

        self.assertEqual(response.status_code, 401)

    def test_login_payload_exposes_pending_onboarding(self):
        response = self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": self.user.username, "password": "testpass123"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["onboarding_prompt_pending"])
        self.assertFalse(response.json()["onboarding_prompt_dismissed"])

    def test_login_accepts_lowercase_for_legacy_uppercase_username(self):
        self.user.username = "ONBOARDING_USER"
        self.user.save(update_fields=["username"])

        response = self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "onboarding_user", "password": "testpass123"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "onboarding_user")

    def test_invalid_login_mentions_lowercase_username_handles(self):
        response = self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "ONBOARDING_USER", "password": "wrong-password"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("lowercase", response.json()["detail"])

    def test_dismiss_persists_and_is_returned_by_auth_me(self):
        self.client.force_login(self.user)

        dismiss = self.client.post("/api/profile/onboarding/dismiss")

        self.assertEqual(dismiss.status_code, 200)
        self.assertEqual(dismiss.json(), {"dismissed": True})
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.onboarding_prompt_pending)
        self.assertTrue(self.profile.onboarding_prompt_dismissed)

        auth_me = self.client.get("/api/auth/me")
        self.assertEqual(auth_me.status_code, 200)
        self.assertFalse(auth_me.json()["onboarding_prompt_pending"])
        self.assertTrue(auth_me.json()["onboarding_prompt_dismissed"])


class NotificationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="notif_user", password="testpass123")
        self.other_user = User.objects.create_user(
            username="other_notif_user", password="testpass123"
        )

    def test_unauthenticated_request_returns_401(self):
        response = self.client.get("/api/notifications")
        self.assertEqual(response.status_code, 401)

    def test_empty_list_returns_zero_count_and_empty_rows(self):
        self.client.login(username="notif_user", password="testpass123")

        response = self.client.get("/api/notifications")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"unread_count": 0, "notifications": []})

    def test_created_notification_appears_with_expected_fields(self):
        notification = Notification.objects.create(
            user=self.user,
            notif_type=Notification.Type.REVISION_APPROVED,
            message='Your entry "Vahay" has been approved and is now live.',
            target_url="/dictionary-view?entry_id=example",
        )
        self.client.login(username="notif_user", password="testpass123")

        response = self.client.get("/api/notifications")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["unread_count"], 1)
        self.assertEqual(len(payload["notifications"]), 1)
        row = payload["notifications"][0]
        self.assertEqual(row["id"], str(notification.id))
        self.assertEqual(row["notif_type"], Notification.Type.REVISION_APPROVED)
        self.assertEqual(row["message"], notification.message)
        self.assertEqual(row["target_url"], notification.target_url)
        self.assertFalse(row["is_read"])
        self.assertIn("created_at", row)

    def test_mark_read_with_specific_ids_marks_only_those(self):
        first = Notification.objects.create(
            user=self.user,
            notif_type=Notification.Type.MILESTONE,
            message="First milestone.",
        )
        second = Notification.objects.create(
            user=self.user,
            notif_type=Notification.Type.MILESTONE,
            message="Second milestone.",
        )
        self.client.login(username="notif_user", password="testpass123")

        response = self.client.post(
            "/api/notifications/mark-read",
            data=json.dumps({"ids": [str(first.id)]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["marked"], 1)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertTrue(first.is_read)
        self.assertFalse(second.is_read)

    def test_mark_read_with_no_body_marks_all(self):
        Notification.objects.create(
            user=self.user,
            notif_type=Notification.Type.MILESTONE,
            message="First milestone.",
        )
        Notification.objects.create(
            user=self.user,
            notif_type=Notification.Type.ROLE_DECIDED,
            message="Role decided.",
        )
        self.client.login(username="notif_user", password="testpass123")

        response = self.client.post("/api/notifications/mark-read")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["marked"], 2)
        self.assertEqual(Notification.objects.filter(user=self.user, is_read=False).count(), 0)

    def test_unread_count_decrements_after_mark_read(self):
        first = Notification.objects.create(
            user=self.user,
            notif_type=Notification.Type.MILESTONE,
            message="First milestone.",
        )
        Notification.objects.create(
            user=self.user,
            notif_type=Notification.Type.MILESTONE,
            message="Second milestone.",
        )
        self.client.login(username="notif_user", password="testpass123")

        self.client.post(
            "/api/notifications/mark-read",
            data=json.dumps({"ids": [str(first.id)]}),
            content_type="application/json",
        )
        response = self.client.get("/api/notifications")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["unread_count"], 1)

    def test_notifications_from_other_users_are_not_visible(self):
        Notification.objects.create(
            user=self.other_user,
            notif_type=Notification.Type.COMMENT_RECEIVED,
            message="Someone else should see this.",
        )
        self.client.login(username="notif_user", password="testpass123")

        response = self.client.get("/api/notifications")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"unread_count": 0, "notifications": []})

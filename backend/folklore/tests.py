import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from folklore.models import FolkloreComment, FolkloreEntry, FolkloreRevision
from folklore.services import (
    finalize_approved_revision,
    publish_revision,
    transition_folklore_status,
)
from users.models import ContributionEvent, Notification

User = get_user_model()


class FolkloreEntryModelTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create_user(
            username="folk_contributor",
            password="testpass123",
        )

    def test_approval_sets_default_license_for_self_produced_media_when_empty(self):
        entry = FolkloreEntry.objects.create(
            title="Kapayvanuvanua",
            content="Sample folklore text",
            category=FolkloreEntry.Category.MYTH,
            municipality_source="Basco",
            source="Oral account",
            media_url="https://example.com/photo.jpg",
            self_produced_media=True,
            contributor=self.contributor,
            status=FolkloreEntry.Status.APPROVED,
            copyright_usage="",
        )

        self.assertEqual(entry.copyright_usage, FolkloreEntry.DEFAULT_LICENSE)

    def test_approval_does_not_default_license_for_external_media(self):
        entry = FolkloreEntry.objects.create(
            title="Kapayvanuvanua",
            content="Sample folklore text",
            category=FolkloreEntry.Category.MYTH,
            municipality_source="Basco",
            source="Oral account",
            media_url="https://example.com/photo.jpg",
            media_source="National Archive",
            self_produced_media=False,
            contributor=self.contributor,
            status=FolkloreEntry.Status.APPROVED,
            copyright_usage="",
        )

        self.assertEqual(entry.copyright_usage, "")

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


class FolklorePublicApiTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create_user(
            username="folk_api_contributor",
            password="testpass123",
        )

    def _entry(self, *, title, status, self_knowledge=False, self_produced_media=False):
        return FolkloreEntry.objects.create(
            title=title,
            content=f"{title} content",
            category=FolkloreEntry.Category.LEGEND,
            municipality_source="Basco",
            source="Public source text",
            self_knowledge=self_knowledge,
            media_url="https://example.com/media",
            media_source="Public media source",
            self_produced_media=self_produced_media,
            contributor=self.contributor,
            status=status,
            copyright_usage="CC BY-NC 4.0",
        )

    def test_list_includes_only_public_statuses(self):
        visible = self._entry(title="Visible", status=FolkloreEntry.Status.APPROVED)
        under_review = self._entry(
            title="Visible Under Review",
            status=FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
        )
        self._entry(title="Hidden Rejected", status=FolkloreEntry.Status.REJECTED)
        self._entry(title="Hidden Draft", status=FolkloreEntry.Status.DRAFT)

        response = self.client.get("/api/folklore/entries")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        entry_ids = {row["entry_id"] for row in payload["rows"]}

        self.assertIn(str(visible.id), entry_ids)
        self.assertIn(str(under_review.id), entry_ids)
        self.assertEqual(len(entry_ids), 2)

    def test_detail_masks_source_fields_when_self_marked(self):
        entry = self._entry(
            title="Masked Entry",
            status=FolkloreEntry.Status.APPROVED,
            self_knowledge=True,
            self_produced_media=True,
        )

        response = self.client.get(f"/api/folklore/entries/{entry.id}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["source"], "")
        self.assertEqual(payload["media_source"], "")
        self.assertEqual(payload["copyright_usage"], "CC BY-NC 4.0")

    def test_detail_returns_404_for_non_public_entry(self):
        entry = self._entry(title="Hidden Entry", status=FolkloreEntry.Status.REJECTED)

        response = self.client.get(f"/api/folklore/entries/{entry.id}")
        self.assertEqual(response.status_code, 404)

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

    def test_municipality_must_be_valid_choice(self):
        with self.assertRaises(ValidationError):
            FolkloreEntry.objects.create(
                title="Invalid Municipality",
                content="Sample",
                category=FolkloreEntry.Category.MYTH,
                municipality_source="invalid-town",
                source="Oral account",
                contributor=self.contributor,
                status=FolkloreEntry.Status.DRAFT,
            )


class FolkloreContributorApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="folk_owner",
            password="testpass123",
        )
        self.other_user = User.objects.create_user(
            username="folk_other",
            password="testpass123",
        )

    def test_create_draft_requires_authentication(self):
        response = self.client.post(
            "/api/folklore/entries/create",
            data=json.dumps(
                {
                    "title": "Entry",
                    "content": "Content",
                    "category": FolkloreEntry.Category.MYTH,
                    "source": "Oral account",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_my_revisions_includes_reviewer_notes_for_rejected_submission(self):
        revision = FolkloreRevision.objects.create(
            contributor=self.owner,
            status=FolkloreRevision.Status.REJECTED,
            proposed_data={
                "title": "Returned story",
                "content": "Draft account",
                "category": FolkloreEntry.Category.MYTH,
                "source": "Oral account",
            },
            reviewer_notes="Please identify the storyteller and municipality.",
        )
        self.client.force_login(self.owner)

        response = self.client.get("/api/folklore/revisions/my")

        self.assertEqual(response.status_code, 200)
        row = next(
            item for item in response.json()["rows"] if item["revision_id"] == str(revision.id)
        )
        self.assertEqual(
            row["reviewer_notes"],
            "Please identify the storyteller and municipality.",
        )

    def test_rejected_submission_can_be_fixed_and_resubmitted(self):
        revision = FolkloreRevision.objects.create(
            contributor=self.owner,
            status=FolkloreRevision.Status.REJECTED,
            proposed_data={
                "title": "Returned story",
                "content": "Draft account",
                "category": FolkloreEntry.Category.MYTH,
                "municipality_source": "Basco",
                "source": "Oral account",
                "self_knowledge": False,
            },
            reviewer_notes="Please clarify the account.",
        )
        self.client.force_login(self.owner)

        update_response = self.client.post(
            f"/api/folklore/revisions/{revision.id}",
            data=json.dumps({"content": "Clarified account"}),
            content_type="application/json",
        )
        submit_response = self.client.post(f"/api/folklore/revisions/{revision.id}/submit")

        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(submit_response.status_code, 200)
        revision.refresh_from_db()
        self.assertEqual(revision.proposed_data["content"], "Clarified account")
        self.assertEqual(revision.status, FolkloreRevision.Status.PENDING)

    def test_create_requires_source_unless_self_knowledge(self):
        self.client.force_login(self.owner)
        response = self.client.post(
            "/api/folklore/revisions/create",
            data=json.dumps(
                {
                    "title": "Entry",
                    "content": "Content",
                    "category": FolkloreEntry.Category.MYTH,
                    "source": "",
                    "self_knowledge": False,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        submit_response = self.client.post(
            f"/api/folklore/revisions/{response.json()['revision_id']}/submit"
        )
        self.assertEqual(submit_response.status_code, 400)
        self.assertIn("source", submit_response.json()["detail"])

        response = self.client.post(
            "/api/folklore/revisions/create",
            data=json.dumps(
                {
                    "title": "Self knowledge entry",
                    "content": "Content",
                    "category": FolkloreEntry.Category.MYTH,
                    "source": "",
                    "self_knowledge": True,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)

    def test_create_requires_media_source_when_media_not_self_produced(self):
        self.client.force_login(self.owner)
        response = self.client.post(
            "/api/folklore/revisions/create",
            data=json.dumps(
                {
                    "title": "Media Entry",
                    "content": "Content",
                    "category": FolkloreEntry.Category.MYTH,
                    "source": "Oral account",
                    "media_url": "https://example.com/video",
                    "self_produced_media": False,
                    "media_source": "",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        submit_response = self.client.post(
            f"/api/folklore/revisions/{response.json()['revision_id']}/submit"
        )
        self.assertEqual(submit_response.status_code, 400)
        self.assertIn("media_source", submit_response.json()["detail"])

        response = self.client.post(
            "/api/folklore/revisions/create",
            data=json.dumps(
                {
                    "title": "Self Produced Media Entry",
                    "content": "Content",
                    "category": FolkloreEntry.Category.MYTH,
                    "source": "Oral account",
                    "media_url": "https://example.com/video",
                    "self_produced_media": True,
                    "media_source": "",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)

    def test_create_draft_sets_owner_and_draft_status(self):
        self.client.force_login(self.owner)
        response = self.client.post(
            "/api/folklore/revisions/create",
            data=json.dumps(
                {
                    "title": "Entry",
                    "content": "Content",
                    "category": FolkloreEntry.Category.MYTH,
                    "municipality_source": "Basco",
                    "source": "Oral account",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        revision = FolkloreRevision.objects.get(id=payload["revision_id"])
        self.assertEqual(revision.contributor_id, self.owner.id)
        self.assertEqual(revision.status, FolkloreRevision.Status.DRAFT)

    def test_create_and_update_draft_allow_one_field(self):
        self.client.force_login(self.owner)

        create_response = self.client.post(
            "/api/folklore/revisions/create",
            data=json.dumps({"title": "Partial folklore title"}),
            content_type="application/json",
        )

        self.assertEqual(create_response.status_code, 201)
        revision_id = create_response.json()["revision_id"]

        update_response = self.client.patch(
            f"/api/folklore/revisions/{revision_id}",
            data=json.dumps({"content": "Partial folklore content"}),
            content_type="application/json",
        )

        self.assertEqual(update_response.status_code, 200)
        revision = FolkloreRevision.objects.get(id=revision_id)
        self.assertEqual(revision.proposed_data["title"], "Partial folklore title")
        self.assertEqual(revision.proposed_data["content"], "Partial folklore content")

        submit_response = self.client.post(f"/api/folklore/revisions/{revision_id}/submit")
        self.assertEqual(submit_response.status_code, 400)

    def test_create_draft_requires_title_before_first_inline_image(self):
        self.client.force_login(self.owner)

        response = self.client.post(
            "/api/folklore/revisions/create",
            data=json.dumps({}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "Title is required before saving a folklore draft.",
        )

    def test_create_draft_accepts_uploads(self):
        self.client.force_login(self.owner)
        photo = SimpleUploadedFile("sample.jpg", b"fake-image-bytes", content_type="image/jpeg")
        audio = SimpleUploadedFile("sample.mp3", b"fake-audio-bytes", content_type="audio/mpeg")
        response = self.client.post(
            "/api/folklore/revisions/create",
            data={
                "title": "Upload Entry",
                "content": "Content",
                "category": FolkloreEntry.Category.MYTH,
                "source": "Oral account",
                "self_produced_media": "true",
                "photo_upload": photo,
                "audio_upload": audio,
            },
        )
        self.assertEqual(response.status_code, 201)
        revision = FolkloreRevision.objects.get(id=response.json()["revision_id"])
        self.assertTrue(bool(revision.photo_upload))
        self.assertTrue(bool(revision.audio_upload))
        list_response = self.client.get("/api/folklore/revisions/my")
        self.assertEqual(list_response.status_code, 200)
        row = list_response.json()["rows"][0]
        self.assertIn("/media/folklore/photos/", row["photo_upload_url"])
        self.assertIn("/media/folklore/audio/", row["audio_upload_url"])

    def test_create_draft_legacy_entries_route_still_works(self):
        self.client.force_login(self.owner)
        response = self.client.post(
            "/api/folklore/entries/create",
            data=json.dumps(
                {
                    "title": "Legacy route entry",
                    "content": "Content",
                    "category": FolkloreEntry.Category.MYTH,
                    "source": "Oral account",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertTrue(FolkloreRevision.objects.filter(id=payload["revision_id"]).exists())

    def test_start_revision_from_existing_entry_uses_snapshot(self):
        entry = FolkloreEntry.objects.create(
            title="Mayan legend",
            content="Original content",
            category=FolkloreEntry.Category.LEGEND,
            subcategory=FolkloreEntry.Subcategory.LEGENDS,
            municipality_source="Basco",
            source="Oral account",
            media_url="https://example.com/video",
            media_source="Community archive",
            contributor=self.owner,
            status=FolkloreEntry.Status.APPROVED,
        )

        # Only the original contributor may start a revision.
        self.client.force_login(self.owner)
        response = self.client.post(f"/api/folklore/entries/{entry.id}/revisions/start")

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["entry_id"], str(entry.id))
        self.assertEqual(payload["title"], "Mayan legend")
        self.assertEqual(payload["content"], "Original content")
        self.assertEqual(payload["media_source"], "Community archive")

    def test_update_draft_is_owner_only(self):
        revision = FolkloreRevision.objects.create(
            contributor=self.owner,
            status=FolkloreRevision.Status.DRAFT,
            proposed_data={
                "title": "Owned draft",
                "content": "Initial content",
                "category": FolkloreEntry.Category.LEGEND,
                "source": "Oral account",
            },
        )

        self.client.force_login(self.other_user)
        response = self.client.patch(
            f"/api/folklore/revisions/{revision.id}",
            data=json.dumps({"title": "Hacked title"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_update_draft_legacy_entries_route_still_works(self):
        revision = FolkloreRevision.objects.create(
            contributor=self.owner,
            status=FolkloreRevision.Status.DRAFT,
            proposed_data={
                "title": "Old title",
                "content": "Initial content",
                "category": FolkloreEntry.Category.LEGEND,
                "source": "Oral account",
            },
        )
        self.client.force_login(self.owner)
        response = self.client.patch(
            f"/api/folklore/entries/{revision.id}/draft",
            data=json.dumps({"title": "New title"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        revision.refresh_from_db()
        self.assertEqual(revision.proposed_data["title"], "New title")

    def test_submit_changes_draft_to_pending(self):
        revision = FolkloreRevision.objects.create(
            contributor=self.owner,
            status=FolkloreRevision.Status.DRAFT,
            proposed_data={
                "title": "Ready draft",
                "content": "Ready content",
                "category": FolkloreEntry.Category.LEGEND,
                "source": "Oral account",
            },
        )

        self.client.force_login(self.owner)
        response = self.client.post(f"/api/folklore/revisions/{revision.id}/submit")
        self.assertEqual(response.status_code, 200)
        revision.refresh_from_db()
        self.assertEqual(revision.status, FolkloreRevision.Status.PENDING)
        self.assertFalse(
            Notification.objects.filter(
                user=self.owner,
                notif_type=Notification.Type.SUBMISSION_RECEIVED,
            ).exists()
        )

    def test_submit_legacy_entries_route_still_works(self):
        revision = FolkloreRevision.objects.create(
            contributor=self.owner,
            status=FolkloreRevision.Status.DRAFT,
            proposed_data={
                "title": "Ready draft",
                "content": "Ready content",
                "category": FolkloreEntry.Category.LEGEND,
                "source": "Oral account",
            },
        )
        self.client.force_login(self.owner)
        response = self.client.post(f"/api/folklore/entries/{revision.id}/submit")
        self.assertEqual(response.status_code, 200)
        revision.refresh_from_db()
        self.assertEqual(revision.status, FolkloreRevision.Status.PENDING)

    def test_my_entries_returns_only_current_user_entries(self):
        mine = FolkloreRevision.objects.create(
            contributor=self.owner,
            status=FolkloreRevision.Status.DRAFT,
            proposed_data={
                "title": "My draft",
                "content": "Mine",
                "category": FolkloreEntry.Category.IDIOM,
                "source": "Source",
            },
        )
        FolkloreRevision.objects.create(
            contributor=self.other_user,
            status=FolkloreRevision.Status.DRAFT,
            proposed_data={
                "title": "Other draft",
                "content": "Other",
                "category": FolkloreEntry.Category.IDIOM,
                "source": "Source",
            },
        )

        self.client.force_login(self.owner)
        response = self.client.get("/api/folklore/revisions/my")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        ids = {row["revision_id"] for row in payload["rows"]}
        self.assertEqual(ids, {str(mine.id)})

    def test_my_entries_legacy_route_still_works(self):
        mine = FolkloreRevision.objects.create(
            contributor=self.owner,
            status=FolkloreRevision.Status.DRAFT,
            proposed_data={
                "title": "My legacy draft",
                "content": "Mine",
                "category": FolkloreEntry.Category.IDIOM,
                "source": "Source",
            },
        )
        self.client.force_login(self.owner)
        response = self.client.get("/api/folklore/entries/my")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        ids = {row["revision_id"] for row in payload["rows"]}
        self.assertIn(str(mine.id), ids)


class FolkloreRevisionOwnershipTests(TestCase):
    """
    Confirms contributor-owned archival record rules:
    - Only the original contributor may revise their own entry.
    - Reviewers cannot directly revise another user's entry.
    - Admins retain override authority (can revise any entry).
    - Approved revision updates the live entry only after review approval.
    - Non-owners may start a variant instead.
    """

    def setUp(self):
        self.owner = User.objects.create_user(username="owner_user", password="pass")
        self.other_contributor = User.objects.create_user(username="other_contrib", password="pass")
        self.reviewer = User.objects.create_user(username="reviewer_user", password="pass")
        self.admin_user = User.objects.create_user(username="admin_user", password="pass")

        reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        admin_group, _ = Group.objects.get_or_create(name="Admin")
        self.reviewer.groups.add(reviewer_group)
        self.admin_user.groups.add(admin_group)

        self.entry = FolkloreEntry.objects.create(
            title="Ancestral Story",
            content="Long ago...",
            category=FolkloreEntry.Category.ORAL_NARRATIVES,
            subcategory=FolkloreEntry.Subcategory.LEGENDS,
            municipality_source="Basco",
            source="Oral tradition",
            contributor=self.owner,
            status=FolkloreEntry.Status.APPROVED,
            copyright_usage="CC BY-NC 4.0",
        )

    # ── Rule 1: only original contributor can revise ──────────────────────────

    def test_original_contributor_can_revise_own_entry(self):
        self.client.force_login(self.owner)
        response = self.client.post(f"/api/folklore/entries/{self.entry.id}/revisions/start")
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["revision_type"], FolkloreRevision.RevisionType.REVISION)
        self.assertEqual(payload["entry_id"], str(self.entry.id))

    def test_other_contributor_cannot_revise_another_users_entry(self):
        self.client.force_login(self.other_contributor)
        response = self.client.post(f"/api/folklore/entries/{self.entry.id}/revisions/start")
        self.assertEqual(response.status_code, 403)

    # ── Rule 2: reviewer cannot directly revise (unless also the original contributor) ─

    def test_reviewer_cannot_revise_another_users_entry(self):
        self.client.force_login(self.reviewer)
        response = self.client.post(f"/api/folklore/entries/{self.entry.id}/revisions/start")
        self.assertEqual(response.status_code, 403)

    def test_reviewer_who_is_also_owner_can_revise_own_entry(self):
        # If the entry contributor also holds Reviewer role, they can still revise.
        reviewer_group = Group.objects.get(name="Reviewer")
        self.owner.groups.add(reviewer_group)
        self.client.force_login(self.owner)
        response = self.client.post(f"/api/folklore/entries/{self.entry.id}/revisions/start")
        self.assertEqual(response.status_code, 201)

    # ── Rule 5: admin override ────────────────────────────────────────────────

    def test_admin_can_revise_any_entry(self):
        self.client.force_login(self.admin_user)
        response = self.client.post(f"/api/folklore/entries/{self.entry.id}/revisions/start")
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["entry_id"], str(self.entry.id))

    def test_superuser_can_revise_any_entry(self):
        superuser = User.objects.create_superuser(username="su_user", password="pass")
        self.client.force_login(superuser)
        response = self.client.post(f"/api/folklore/entries/{self.entry.id}/revisions/start")
        self.assertEqual(response.status_code, 201)

    # ── Rule 4 alternative: non-owners may submit a variant ──────────────────

    def test_non_owner_can_start_variant(self):
        self.client.force_login(self.other_contributor)
        response = self.client.post(f"/api/folklore/entries/{self.entry.id}/variants/start")
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["revision_type"], FolkloreRevision.RevisionType.VARIANT)
        self.assertIsNone(payload["entry_id"])
        self.assertEqual(payload["variant_of_id"], str(self.entry.id))

    def test_owner_can_also_start_variant_of_own_entry(self):
        self.client.force_login(self.owner)
        response = self.client.post(f"/api/folklore/entries/{self.entry.id}/variants/start")
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["revision_type"], FolkloreRevision.RevisionType.VARIANT)

    def test_variant_requires_authentication(self):
        response = self.client.post(f"/api/folklore/entries/{self.entry.id}/variants/start")
        self.assertEqual(response.status_code, 401)

    # ── Rule 6: approved revision updates live entry only after review approval ─

    def test_approved_revision_updates_live_entry(self):
        revision = FolkloreRevision.objects.create(
            entry=self.entry,
            contributor=self.owner,
            revision_type=FolkloreRevision.RevisionType.REVISION,
            proposed_data={
                "title": "Ancestral Story (Revised)",
                "content": "Long ago, revised...",
                "category": FolkloreEntry.Category.ORAL_NARRATIVES,
                "subcategory": FolkloreEntry.Subcategory.LEGENDS,
                "municipality_source": "Basco",
                "source": "Oral tradition",
                "self_knowledge": False,
                "media_url": "",
                "media_source": "",
                "self_produced_media": False,
                "copyright_usage": "",
            },
            status=FolkloreRevision.Status.PENDING,
        )

        # Live entry still has the old title before approval.
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.title, "Ancestral Story")

        # Simulate reviewer approval.
        revision.status = FolkloreRevision.Status.APPROVED
        revision.save(update_fields=["status"])
        updated_entry = publish_revision(revision=revision)
        finalize_approved_revision(revision=revision)

        updated_entry.refresh_from_db()
        self.assertEqual(updated_entry.title, "Ancestral Story (Revised)")
        self.assertEqual(updated_entry.status, FolkloreEntry.Status.APPROVED)

    def test_pending_revision_does_not_update_live_entry(self):
        original_title = self.entry.title
        FolkloreRevision.objects.create(
            entry=self.entry,
            contributor=self.owner,
            revision_type=FolkloreRevision.RevisionType.REVISION,
            proposed_data={
                "title": "Should Not Appear Yet",
                "content": "...",
                "category": FolkloreEntry.Category.ORAL_NARRATIVES,
                "subcategory": FolkloreEntry.Subcategory.LEGENDS,
                "municipality_source": "Basco",
                "source": "Oral tradition",
                "self_knowledge": False,
                "media_url": "",
                "media_source": "",
                "self_produced_media": False,
                "copyright_usage": "",
            },
            status=FolkloreRevision.Status.PENDING,
        )
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.title, original_title)


class FolkloreCommentTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="comment_owner", password="pass")
        self.commenter = User.objects.create_user(username="commenter_user", password="pass")
        self.other = User.objects.create_user(username="comment_other", password="pass")
        admin_group, _ = Group.objects.get_or_create(name="Admin")
        self.admin_user = User.objects.create_user(username="comment_admin", password="pass")
        self.admin_user.groups.add(admin_group)

        self.entry = FolkloreEntry.objects.create(
            title="Story Entry",
            content="Content here",
            category=FolkloreEntry.Category.ORAL_NARRATIVES,
            subcategory=FolkloreEntry.Subcategory.LEGENDS,
            municipality_source="Basco",
            source="Oral tradition",
            contributor=self.owner,
            status=FolkloreEntry.Status.APPROVED,
            copyright_usage="CC BY-NC 4.0",
        )

    def _url_list(self):
        return f"/api/folklore/entries/{self.entry.id}/comments"

    def _url_create(self):
        return f"/api/folklore/entries/{self.entry.id}/comments/create"

    def _url_delete(self, comment_id):
        return f"/api/folklore/comments/{comment_id}/delete"

    def test_list_comments_is_public(self):
        FolkloreComment.objects.create(entry=self.entry, author=self.commenter, body="Hello!")
        response = self.client.get(self._url_list())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["rows"]), 1)

    def test_list_comments_empty(self):
        response = self.client.get(self._url_list())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rows"], [])

    def test_list_returns_404_for_non_public_entry(self):
        hidden = FolkloreEntry.objects.create(
            title="Hidden",
            content="x",
            category=FolkloreEntry.Category.ORAL_NARRATIVES,
            subcategory=FolkloreEntry.Subcategory.LEGENDS,
            source="x",
            contributor=self.owner,
            status=FolkloreEntry.Status.DRAFT,
        )
        response = self.client.get(f"/api/folklore/entries/{hidden.id}/comments")
        self.assertEqual(response.status_code, 404)

    def test_create_comment_requires_auth(self):
        response = self.client.post(
            self._url_create(),
            data=json.dumps({"body": "Hello!"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_create_comment_success(self):
        self.client.force_login(self.commenter)
        response = self.client.post(
            self._url_create(),
            data=json.dumps({"body": "Great story!"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["body"], "Great story!")
        self.assertTrue(payload["is_own"])
        self.assertEqual(FolkloreComment.objects.filter(entry=self.entry).count(), 1)

    def test_create_comment_rejects_empty_body(self):
        self.client.force_login(self.commenter)
        response = self.client.post(
            self._url_create(),
            data=json.dumps({"body": "   "}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_create_comment_rejects_body_over_limit(self):
        self.client.force_login(self.commenter)
        response = self.client.post(
            self._url_create(),
            data=json.dumps({"body": "x" * (FolkloreComment.BODY_MAX_LENGTH + 1)}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_is_own_flag_only_true_for_author(self):
        self.client.force_login(self.commenter)
        self.client.post(
            self._url_create(),
            data=json.dumps({"body": "My comment"}),
            content_type="application/json",
        )
        # Other user sees is_own=False
        self.client.force_login(self.other)
        response = self.client.get(self._url_list())
        row = response.json()["rows"][0]
        self.assertFalse(row["is_own"])

    def test_delete_own_comment(self):
        self.client.force_login(self.commenter)
        create_resp = self.client.post(
            self._url_create(),
            data=json.dumps({"body": "To be deleted"}),
            content_type="application/json",
        )
        comment_id = create_resp.json()["comment_id"]
        del_resp = self.client.delete(self._url_delete(comment_id))
        self.assertEqual(del_resp.status_code, 200)
        self.assertEqual(FolkloreComment.objects.filter(id=comment_id).count(), 0)

    def test_delete_other_users_comment_is_forbidden(self):
        comment = FolkloreComment.objects.create(
            entry=self.entry, author=self.commenter, body="Mine"
        )
        self.client.force_login(self.other)
        response = self.client.delete(self._url_delete(comment.id))
        self.assertEqual(response.status_code, 403)

    def test_admin_can_delete_any_comment(self):
        comment = FolkloreComment.objects.create(
            entry=self.entry, author=self.commenter, body="Someone's comment"
        )
        self.client.force_login(self.admin_user)
        response = self.client.delete(self._url_delete(comment.id))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(FolkloreComment.objects.filter(id=comment.id).count(), 0)

    def test_delete_requires_auth(self):
        comment = FolkloreComment.objects.create(entry=self.entry, author=self.commenter, body="x")
        response = self.client.delete(self._url_delete(comment.id))
        self.assertEqual(response.status_code, 401)

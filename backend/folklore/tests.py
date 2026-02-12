import json

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from folklore.models import FolkloreEntry, FolkloreRevision
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

import json
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone

from dictionary.models import Entry, EntryRevision, EntryStatus
from folklore.models import FolkloreEntry, FolkloreRevision
from reviews.models import CorrectionAssignment, FolkloreReview, Review, ReviewAdminOverride
from reviews.services import submit_folklore_review, submit_review
from users.models import Notification

User = get_user_model()


class ReviewServicesTests(TestCase):
    def setUp(self):
        self.reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.admin_group, _ = Group.objects.get_or_create(name="Admin")
        self.contributor_group, _ = Group.objects.get_or_create(name="Contributor")
        self.consultant_group, _ = Group.objects.get_or_create(name="Consultant")

        self.contributor = User.objects.create_user(
            username="contributor",
            password="testpass123",
        )
        self.contributor.groups.add(self.contributor_group)
        self.consultant = User.objects.create_user(
            username="consultant",
            password="testpass123",
        )
        self.consultant.groups.add(self.consultant_group)
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
        self.admin2 = User.objects.create_user(
            username="admin2",
            password="testpass123",
        )
        self.admin2.groups.add(self.admin_group)

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

    def test_contributor_can_flag_own_approved_entry(self):
        entry, revision = self._approved_entry_with_revision()

        submit_review(
            revision=revision,
            reviewer=self.contributor,
            decision=Review.Decision.FLAG,
            notes="I noticed a correction is needed.",
        )

        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.APPROVED_UNDER_REVIEW)

    def test_consultant_can_flag_approved_entry(self):
        entry, revision = self._approved_entry_with_revision()

        submit_review(
            revision=revision,
            reviewer=self.consultant,
            decision=Review.Decision.FLAG,
            notes="Cultural context needs another check.",
        )

        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.APPROVED_UNDER_REVIEW)

    def test_rereview_reject_archives_entry(self):
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
        self.assertEqual(entry.status, EntryStatus.ARCHIVED)
        notification = Notification.objects.get(
            user=self.contributor,
            notif_type=Notification.Type.REVISION_REJECTED,
        )
        self.assertIn("rejected after re-review", notification.message)
        self.assertIn("Confirmed issue.", notification.message)
        self.assertEqual(notification.target_url, "/admin-applications?tab=contributions")

    def test_rereview_can_return_revision_to_selected_contributor_and_restore_previous_snapshot(
        self,
    ):
        entry = Entry.objects.create(
            term="vahay",
            meaning="house",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        base = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "vahay", "meaning": "house"},
            status=EntryRevision.Status.APPROVED,
            is_base_snapshot=True,
        )
        latest = EntryRevision.objects.create(
            entry=entry,
            contributor=self.reviewer2,
            proposed_data={"term": "vahay", "meaning": "incorrect meaning"},
            status=EntryRevision.Status.APPROVED,
        )
        entry.meaning = "incorrect meaning"
        entry.save(update_fields=["meaning"])

        submit_review(
            revision=latest,
            reviewer=self.reviewer1,
            decision=Review.Decision.FLAG,
            notes="Meaning is disputed.",
        )
        submit_review(
            revision=latest,
            reviewer=self.admin,
            decision=Review.Decision.RETURN,
            notes="Verify the meaning with another source.",
            assigned_to_username=self.reviewer2.username,
            source_revision_id=str(latest.id),
        )

        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.APPROVED)
        self.assertEqual(entry.meaning, "House")
        assignment = CorrectionAssignment.objects.get(dictionary_source_revision=latest)
        self.assertEqual(assignment.assigned_to, self.reviewer2)
        self.assertEqual(
            assignment.dictionary_correction_revision.status, EntryRevision.Status.DRAFT
        )
        self.assertEqual(assignment.source_snapshot["meaning"], "incorrect meaning")
        self.assertEqual(base.entry_id, entry.id)

    def test_returning_original_entry_hides_it_until_correction_is_approved(self):
        entry, revision = self._approved_entry_with_revision()
        revision.is_base_snapshot = True
        revision.save(update_fields=["is_base_snapshot"])

        submit_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=Review.Decision.FLAG,
            notes="Original entry needs correction.",
        )
        submit_review(
            revision=revision,
            reviewer=self.admin,
            decision=Review.Decision.RETURN,
            notes="Correct the original term evidence.",
            assigned_to_username=self.contributor.username,
            source_revision_id=str(revision.id),
        )

        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.REJECTED)
        assignment = CorrectionAssignment.objects.get(dictionary_source_revision=revision)
        self.assertEqual(assignment.scope, CorrectionAssignment.Scope.ORIGINAL)

        correction = assignment.dictionary_correction_revision
        correction.status = EntryRevision.Status.PENDING
        correction.proposed_data = {"term": "vahay", "meaning": "corrected meaning"}
        correction.save(update_fields=["status", "proposed_data"])
        submit_review(
            revision=correction,
            reviewer=self.reviewer1,
            decision=Review.Decision.APPROVE,
            notes="Correction verified.",
        )
        submit_review(
            revision=correction,
            reviewer=self.admin,
            decision=Review.Decision.APPROVE,
            notes="Correction approved.",
        )

        entry.refresh_from_db()
        assignment.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.APPROVED)
        self.assertEqual(entry.meaning, "Corrected meaning")
        self.assertEqual(assignment.status, CorrectionAssignment.Status.RESOLVED)

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
        notification = Notification.objects.get(
            user=self.contributor,
            notif_type=Notification.Type.REVISION_APPROVED,
        )
        self.assertIn("completed re-review", notification.message)
        self.assertEqual(
            notification.target_url,
            f"/dictionary-view?entry_id={entry.id}",
        )

    def test_dictionary_quorum_accepts_two_admins(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={"term": "admin-quorum"},
            status=EntryRevision.Status.PENDING,
        )

        submit_review(
            revision=revision,
            reviewer=self.admin,
            decision=Review.Decision.APPROVE,
            notes="Admin approval one.",
        )
        revision.refresh_from_db()
        self.assertEqual(revision.status, EntryRevision.Status.PENDING)

        submit_review(
            revision=revision,
            reviewer=self.admin2,
            decision=Review.Decision.APPROVE,
            notes="Admin approval two.",
        )
        revision.refresh_from_db()
        self.assertEqual(revision.status, EntryRevision.Status.APPROVED)

    def test_flag_requires_notes(self):
        _, revision = self._approved_entry_with_revision()

        with self.assertRaises(ValidationError):
            submit_review(
                revision=revision,
                reviewer=self.reviewer1,
                decision=Review.Decision.FLAG,
                notes="",
            )

    def test_non_reviewer_cannot_submit_review(self):
        _, revision = self._approved_entry_with_revision()
        regular = User.objects.create_user(
            username="regular_user",
            password="testpass123",
        )
        with self.assertRaises(ValidationError):
            submit_review(
                revision=revision,
                reviewer=regular,
                decision=Review.Decision.APPROVE,
                notes="not allowed",
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


class ReviewerDashboardApiTests(TestCase):
    def setUp(self):
        self.reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.admin_group, _ = Group.objects.get_or_create(name="Admin")

        self.contributor = User.objects.create_user(
            username="dash_contributor",
            password="testpass123",
        )
        self.reviewer1 = User.objects.create_user(
            username="dash_reviewer1",
            password="testpass123",
        )
        self.reviewer1.groups.add(self.reviewer_group)

        self.reviewer2 = User.objects.create_user(
            username="dash_reviewer2",
            password="testpass123",
        )
        self.reviewer2.groups.add(self.reviewer_group)

        self.admin = User.objects.create_user(
            username="dash_admin",
            password="testpass123",
        )
        self.admin.groups.add(self.admin_group)

        self.regular_user = User.objects.create_user(
            username="dash_regular",
            password="testpass123",
        )

    def _pending_revision(self, *, contributor, term):
        return EntryRevision.objects.create(
            contributor=contributor,
            proposed_data={"term": term},
            status=EntryRevision.Status.PENDING,
        )

    def test_dashboard_requires_reviewer_or_admin_role(self):
        self.client.force_login(self.regular_user)
        response = self.client.get("/api/reviews/dashboard")
        self.assertEqual(response.status_code, 403)

    def test_reviewer_pending_list_excludes_items_already_reviewed_by_them(self):
        rev_a = self._pending_revision(contributor=self.contributor, term="a")
        rev_b = self._pending_revision(contributor=self.contributor, term="b")

        submit_review(
            revision=rev_a,
            reviewer=self.reviewer1,
            decision=Review.Decision.APPROVE,
            notes="approved by reviewer1",
        )

        self.client.force_login(self.reviewer1)
        response = self.client.get("/api/reviews/dashboard")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)

        pending_ids = {item["revision_id"] for item in payload["pending_submissions"]}
        self.assertNotIn(str(rev_a.id), pending_ids)
        self.assertIn(str(rev_b.id), pending_ids)

    def test_admin_pending_list_excludes_items_already_reviewed_by_them(self):
        rev = self._pending_revision(contributor=self.contributor, term="admin-reviewed")
        submit_review(
            revision=rev,
            reviewer=self.admin,
            decision=Review.Decision.APPROVE,
            notes="admin review",
        )

        self.client.force_login(self.admin)
        response = self.client.get("/api/reviews/dashboard")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        pending_ids = {item["revision_id"] for item in payload["pending_submissions"]}
        self.assertNotIn(str(rev.id), pending_ids)

    def test_dashboard_excludes_own_pending_dictionary_submission(self):
        own_revision = self._pending_revision(contributor=self.reviewer1, term="own-term")
        other_revision = self._pending_revision(contributor=self.contributor, term="other-term")

        self.client.force_login(self.reviewer1)
        response = self.client.get("/api/reviews/dashboard")

        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        pending_ids = {item["revision_id"] for item in payload["pending_submissions"]}
        self.assertNotIn(str(own_revision.id), pending_ids)
        self.assertIn(str(other_revision.id), pending_ids)

    def test_dashboard_orders_pending_dictionary_submissions_newest_first(self):
        older_revision = self._pending_revision(contributor=self.contributor, term="older")
        newer_revision = self._pending_revision(contributor=self.contributor, term="newer")
        EntryRevision.objects.filter(id=older_revision.id).update(
            created_at=timezone.now() - timedelta(days=1)
        )
        EntryRevision.objects.filter(id=newer_revision.id).update(created_at=timezone.now())

        self.client.force_login(self.reviewer1)
        response = self.client.get("/api/reviews/dashboard")

        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        terms = [item["term"] for item in payload["pending_submissions"]]
        self.assertEqual(terms[:2], ["newer", "older"])

    def test_awaiting_quorum_after_my_approval_lists_pending_item(self):
        rev = self._pending_revision(contributor=self.contributor, term="awaiting")
        submit_review(
            revision=rev,
            reviewer=self.reviewer1,
            decision=Review.Decision.APPROVE,
            notes="first approval",
        )

        self.client.force_login(self.reviewer1)
        response = self.client.get("/api/reviews/dashboard")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)

        awaiting_ids = {
            item["revision_id"] for item in payload["awaiting_quorum_after_my_approval"]
        }
        self.assertIn(str(rev.id), awaiting_ids)
        awaiting_row = next(
            item
            for item in payload["dictionary"]["awaiting_quorum_after_my_approval"]
            if item["revision_id"] == str(rev.id)
        )
        self.assertEqual(awaiting_row["term"], "awaiting")
        self.assertEqual(awaiting_row["reviewer_approvals"], 1)
        self.assertEqual(awaiting_row["admin_approvals"], 0)
        self.assertEqual(
            awaiting_row["quorum_requirement"],
            "Needs 1 more reviewer/admin approval",
        )

    def test_dashboard_keeps_item_pending_for_other_reviewer_after_first_approval(self):
        rev = self._pending_revision(contributor=self.contributor, term="needs-second")
        submit_review(
            revision=rev,
            reviewer=self.reviewer1,
            decision=Review.Decision.APPROVE,
            notes="first approval",
        )

        self.client.force_login(self.admin)
        response = self.client.get("/api/reviews/dashboard")

        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        pending_ids = {item["revision_id"] for item in payload["pending_submissions"]}
        self.assertIn(str(rev.id), pending_ids)

    def test_dashboard_excludes_stale_pending_dictionary_revision_with_rejection(self):
        rev = self._pending_revision(contributor=self.contributor, term="stale-rejected")
        Review.objects.create(
            revision=rev,
            reviewer=self.reviewer1,
            decision=Review.Decision.REJECT,
            notes="Reject once",
            review_round=0,
        )

        self.client.force_login(self.admin)
        response = self.client.get("/api/reviews/dashboard")

        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        pending_ids = {item["revision_id"] for item in payload["pending_submissions"]}
        self.assertNotIn(str(rev.id), pending_ids)

    def test_dashboard_excludes_stale_awaiting_dictionary_revision_with_rejection(self):
        rev = self._pending_revision(contributor=self.contributor, term="stale-awaiting")
        Review.objects.create(
            revision=rev,
            reviewer=self.reviewer1,
            decision=Review.Decision.REJECT,
            notes="Reject once",
            review_round=0,
        )
        Review.objects.create(
            revision=rev,
            reviewer=self.reviewer2,
            decision=Review.Decision.APPROVE,
            notes="Late approval",
            review_round=0,
        )

        self.client.force_login(self.reviewer2)
        response = self.client.get("/api/reviews/dashboard")

        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        awaiting_ids = {
            item["revision_id"] for item in payload["awaiting_quorum_after_my_approval"]
        }
        self.assertNotIn(str(rev.id), awaiting_ids)

    def test_dashboard_returns_grouped_sections_with_legacy_keys(self):
        rev = self._pending_revision(contributor=self.contributor, term="grouped")
        self.client.force_login(self.reviewer1)
        response = self.client.get("/api/reviews/dashboard")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)

        self.assertIn("dictionary", payload)
        self.assertIn("folklore", payload)
        self.assertIn("reviews", payload)

        self.assertIn("pending_submissions", payload["dictionary"])
        self.assertIn("pending_rereview", payload["dictionary"])
        self.assertIn("published_entries", payload["dictionary"])
        self.assertIn(
            "awaiting_quorum_after_my_approval",
            payload["dictionary"],
        )
        self.assertIn("pending_submissions", payload["folklore"])
        self.assertIn("pending_rereview", payload["folklore"])
        self.assertIn("published_entries", payload["folklore"])
        self.assertIn(
            "awaiting_quorum_after_my_approval",
            payload["folklore"],
        )
        self.assertIn("my_reviews", payload["reviews"])
        self.assertIn("awaiting_quorum_after_my_approval", payload["reviews"])

        # Backward compatibility keys remain available.
        self.assertIn("pending_submissions", payload)
        self.assertIn("pending_folklore_submissions", payload)
        self.assertIn("pending_rereview", payload)
        self.assertIn("pending_folklore_rereview", payload)
        self.assertIn("published_entries", payload)
        self.assertIn("published_folklore_entries", payload)
        self.assertIn("my_reviews", payload)
        self.assertIn("awaiting_quorum_after_my_approval", payload)

        pending_ids = {item["revision_id"] for item in payload["dictionary"]["pending_submissions"]}
        self.assertIn(str(rev.id), pending_ids)

    def test_dictionary_review_preview_includes_submitted_media_and_metadata(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "term": "media-term",
                "meaning": "Meaning",
                "part_of_speech": "Noun (N)",
                "variant_type": "Ivatan (Common Usage)",
                "pronunciation_text": "MEH-dee-ah",
                "phonetic": "/media/",
                "example_sentence": "Mangu ka.",
                "example_translation": "How are you.",
                "usage_notes": "Used in review.",
                "etymology": "Community memory.",
                "english_synonym": "sample",
                "ivatan_synonym": "patulasen",
                "english_antonym": "opposite",
                "ivatan_antonym": "contra",
                "inflected_forms": "mediaen",
                "source_text": "Term Source: Interview",
                "audio_pronunciation": "dictionary/audio/sample.mp3",
                "audio_source": "Audio Source: Contributor recording",
                "audio_license": "CC BY-NC 4.0",
                "photo": "dictionary/photos/sample.jpg",
                "photo_source": "Photo Source: Field photo",
                "photo_license": "CC BY-NC 4.0",
                "variants": [
                    {
                        "term": "Media Variant",
                        "variant_type": "Isamurungen",
                        "audio_pronunciation": "dictionary/audio/variant.mp3",
                        "audio_source": "Variant audio source",
                    }
                ],
            },
            status=EntryRevision.Status.PENDING,
        )

        self.client.force_login(self.reviewer1)
        response = self.client.get("/api/reviews/dashboard")

        self.assertEqual(response.status_code, 200)
        row = next(
            item
            for item in response.json()["dictionary"]["pending_submissions"]
            if item["revision_id"] == str(revision.id)
        )
        preview = row["preview"]
        self.assertIn("/media/dictionary/audio/sample.mp3", preview["audio_pronunciation_url"])
        self.assertIn("/media/dictionary/photos/sample.jpg", preview["photo_url"])
        self.assertEqual(preview["audio_source"], "Audio Source: Contributor recording")
        self.assertEqual(preview["photo_source"], "Photo Source: Field photo")
        self.assertEqual(preview["audio_license"], "CC BY-NC 4.0")
        self.assertEqual(preview["etymology"], "Community memory.")
        self.assertEqual(preview["english_synonym"], "sample")
        self.assertIn(
            "/media/dictionary/audio/variant.mp3",
            preview["variants"][0]["audio_pronunciation_url"],
        )

    @override_settings(MEDIA_ROOT=tempfile.mkdtemp())
    def test_folklore_review_preview_includes_uploaded_media_and_metadata(self):
        revision = FolkloreRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "title": "Media folklore",
                "content": "<p>Story content.</p>",
                "category": FolkloreEntry.Category.MYTH,
                "subcategory": FolkloreEntry.Subcategory.MYTHS,
                "municipality_source": FolkloreEntry.MunicipalitySource.BASCO,
                "source": "Community interview",
                "self_knowledge": False,
                "media_url": "https://example.com/video",
                "media_source": "Archive collection",
                "self_produced_media": False,
                "copyright_usage": "CC BY-NC 4.0",
            },
            photo_upload=SimpleUploadedFile(
                "preview.jpg",
                b"fake-image",
                content_type="image/jpeg",
            ),
            audio_upload=SimpleUploadedFile(
                "preview.mp3",
                b"fake-audio",
                content_type="audio/mpeg",
            ),
            status=FolkloreRevision.Status.PENDING,
        )

        self.client.force_login(self.reviewer1)
        response = self.client.get("/api/reviews/dashboard")

        self.assertEqual(response.status_code, 200)
        row = next(
            item
            for item in response.json()["folklore"]["pending_submissions"]
            if item["revision_id"] == str(revision.id)
        )
        preview = row["preview"]
        self.assertIn("/media/folklore/photos/", preview["photo_upload_url"])
        self.assertIn("/media/folklore/audio/", preview["audio_upload_url"])
        self.assertEqual(preview["media_url"], "https://example.com/video")
        self.assertEqual(preview["media_source"], "Archive collection")
        self.assertEqual(preview["copyright_usage"], "CC BY-NC 4.0")
        self.assertEqual(preview["content"], "<p>Story content.</p>")

    def test_dashboard_includes_latest_approved_entries_for_flagging(self):
        dictionary_entry = Entry.objects.create(
            term="published-term",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        dictionary_revision = EntryRevision.objects.create(
            entry=dictionary_entry,
            contributor=self.contributor,
            proposed_data={"term": "published-term"},
            status=EntryRevision.Status.APPROVED,
        )

        folklore_entry = FolkloreEntry.objects.create(
            title="Published folklore",
            content="Body",
            category=FolkloreEntry.Category.MYTH,
            municipality_source=FolkloreEntry.MunicipalitySource.BASCO,
            source="Oral source",
            contributor=self.contributor,
            status=FolkloreEntry.Status.APPROVED,
        )
        folklore_revision = FolkloreRevision.objects.create(
            entry=folklore_entry,
            contributor=self.contributor,
            proposed_data={
                "title": "Published folklore",
                "category": FolkloreEntry.Category.MYTH,
            },
            status=FolkloreRevision.Status.APPROVED,
        )

        self.client.force_login(self.reviewer1)
        response = self.client.get("/api/reviews/dashboard")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)

        dictionary_ids = {
            item["revision_id"] for item in payload["dictionary"]["published_entries"]
        }
        folklore_ids = {item["revision_id"] for item in payload["folklore"]["published_entries"]}

        self.assertIn(str(dictionary_revision.id), dictionary_ids)
        self.assertIn(str(folklore_revision.id), folklore_ids)

    def test_dictionary_submit_endpoint_flags_entry_under_review(self):
        entry = Entry.objects.create(
            term="api-flag-term",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        revision = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "api-flag-term"},
            status=EntryRevision.Status.APPROVED,
        )

        self.client.force_login(self.reviewer1)
        response = self.client.post(
            "/api/reviews/dictionary/submit",
            data=json.dumps(
                {
                    "revision_id": str(revision.id),
                    "decision": "flag",
                    "notes": "Flag via API endpoint",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        revision.refresh_from_db()
        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.APPROVED_UNDER_REVIEW)

    def test_dictionary_submit_endpoint_invalid_uuid_returns_400(self):
        self.client.force_login(self.reviewer1)
        response = self.client.post(
            "/api/reviews/dictionary/submit",
            data=json.dumps(
                {
                    "revision_id": "PASTE_REVISION_ID_HERE",
                    "decision": "flag",
                    "notes": "invalid id",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid revision_id UUID", response.json()["detail"])


class AdminOverrideApiTests(TestCase):
    def setUp(self):
        self.reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.admin_group, _ = Group.objects.get_or_create(name="Admin")

        self.contributor = User.objects.create_user(
            username="override_contributor",
            password="testpass123",
        )
        self.reviewer = User.objects.create_user(
            username="override_reviewer",
            password="testpass123",
        )
        self.reviewer.groups.add(self.reviewer_group)

        self.admin = User.objects.create_user(
            username="override_admin",
            password="testpass123",
        )
        self.admin.groups.add(self.admin_group)

        self.regular_user = User.objects.create_user(
            username="override_regular",
            password="testpass123",
        )

    def _dictionary_entry_under_review(self):
        entry = Entry.objects.create(
            term="override-term",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        revision = EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "override-term"},
            status=EntryRevision.Status.APPROVED,
        )
        submit_review(
            revision=revision,
            reviewer=self.reviewer,
            decision=Review.Decision.FLAG,
            notes="needs admin override",
        )
        entry.refresh_from_db()
        return entry

    def _folklore_entry_under_review(self):
        entry = FolkloreEntry.objects.create(
            title="Folklore Override",
            content="Sample",
            category=FolkloreEntry.Category.LEGEND,
            source="Oral account",
            contributor=self.contributor,
            status=FolkloreEntry.Status.APPROVED_UNDER_REVIEW,
        )
        return entry

    def test_admin_override_requires_admin(self):
        entry = self._dictionary_entry_under_review()
        self.client.force_login(self.regular_user)
        response = self.client.post(
            "/api/reviews/admin/override",
            data=json.dumps(
                {
                    "target_type": "dictionary",
                    "target_id": str(entry.id),
                    "action": "force_reject",
                    "notes": "override",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_override_force_reject_dictionary(self):
        entry = self._dictionary_entry_under_review()
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/reviews/admin/override",
            data=json.dumps(
                {
                    "target_type": "dictionary",
                    "target_id": str(entry.id),
                    "action": "force_reject",
                    "notes": "admin override reject",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.REJECTED)
        self.assertTrue(
            ReviewAdminOverride.objects.filter(
                target_type=ReviewAdminOverride.TargetType.DICTIONARY,
                dictionary_entry=entry,
                action=ReviewAdminOverride.Action.FORCE_REJECT,
            ).exists()
        )

    def test_admin_override_archive_dictionary(self):
        entry = self._dictionary_entry_under_review()
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/reviews/admin/override",
            data=json.dumps(
                {
                    "target_type": "dictionary",
                    "target_id": str(entry.id),
                    "action": "archive",
                    "notes": "admin archive override",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.ARCHIVED)
        self.assertIsNotNone(entry.archived_at)

    def test_admin_can_archive_and_restore_approved_dictionary(self):
        entry = Entry.objects.create(
            term="archive-ready",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        self.client.force_login(self.admin)

        archive_response = self.client.post(
            "/api/reviews/admin/override",
            data=json.dumps(
                {
                    "target_type": "dictionary",
                    "target_id": str(entry.id),
                    "action": "archive",
                    "notes": "duplicate public record",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(archive_response.status_code, 200)
        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.ARCHIVED)
        self.assertIsNotNone(entry.archived_at)

        restore_response = self.client.post(
            "/api/reviews/admin/override",
            data=json.dumps(
                {
                    "target_type": "dictionary",
                    "target_id": str(entry.id),
                    "action": "restore_approved",
                    "notes": "record verified and restored",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(restore_response.status_code, 200)
        entry.refresh_from_db()
        self.assertEqual(entry.status, EntryStatus.APPROVED)
        self.assertIsNone(entry.archived_at)

    def test_admin_archive_inventory_lists_archived_entries_only(self):
        archived = FolkloreEntry.objects.create(
            title="Archived Folklore",
            content="Sample",
            category=FolkloreEntry.Category.ORAL_NARRATIVES,
            subcategory=FolkloreEntry.Subcategory.LEGENDS,
            source="Oral account",
            contributor=self.contributor,
            status=FolkloreEntry.Status.ARCHIVED,
        )
        self.client.force_login(self.admin)

        response = self.client.get("/api/reviews/admin/archive")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertNotIn("eligible", payload)
        self.assertIn(str(archived.id), [row["target_id"] for row in payload["archived"]])

    def test_archive_inventory_requires_admin(self):
        self.client.force_login(self.regular_user)
        response = self.client.get("/api/reviews/admin/archive")
        self.assertEqual(response.status_code, 403)

    def test_admin_override_restore_approved_folklore(self):
        entry = self._folklore_entry_under_review()
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/reviews/admin/override",
            data=json.dumps(
                {
                    "target_type": "folklore",
                    "target_id": str(entry.id),
                    "action": "restore_approved",
                    "notes": "admin restore folklore",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        entry.refresh_from_db()
        self.assertEqual(entry.status, FolkloreEntry.Status.APPROVED)

    def test_admin_override_requires_notes(self):
        entry = self._dictionary_entry_under_review()
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/reviews/admin/override",
            data=json.dumps(
                {
                    "target_type": "dictionary",
                    "target_id": str(entry.id),
                    "action": "force_reject",
                    "notes": "",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


class FolkloreReviewFlowTests(TestCase):
    def setUp(self):
        self.reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.admin_group, _ = Group.objects.get_or_create(name="Admin")

        self.contributor = User.objects.create_user(
            username="folk_contributor_review",
            password="testpass123",
        )
        self.reviewer1 = User.objects.create_user(
            username="folk_reviewer1",
            password="testpass123",
        )
        self.reviewer1.groups.add(self.reviewer_group)
        self.reviewer2 = User.objects.create_user(
            username="folk_reviewer2",
            password="testpass123",
        )
        self.reviewer2.groups.add(self.reviewer_group)
        self.admin = User.objects.create_user(
            username="folk_admin",
            password="testpass123",
        )
        self.admin.groups.add(self.admin_group)
        self.admin2 = User.objects.create_user(
            username="folk_admin_2",
            password="testpass123",
        )
        self.admin2.groups.add(self.admin_group)

    def _pending_folklore(self):
        return FolkloreRevision.objects.create(
            contributor=self.contributor,
            status=FolkloreRevision.Status.PENDING,
            proposed_data={
                "title": "Folklore Pending",
                "content": "Pending content",
                "category": FolkloreEntry.Category.LEGEND,
                "municipality_source": "Basco",
                "source": "Oral account",
            },
        )

    def test_pending_rejection_is_immediate(self):
        revision = self._pending_folklore()
        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=FolkloreReview.Decision.REJECT,
            notes="Source mismatch",
        )
        revision.refresh_from_db()
        self.assertEqual(revision.status, FolkloreRevision.Status.REJECTED)

    def test_pending_quorum_approves_entry(self):
        revision = self._pending_folklore()
        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Looks good",
        )
        submit_folklore_review(
            revision=revision,
            reviewer=self.admin,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Admin confirms",
        )
        revision.refresh_from_db()
        self.assertEqual(revision.status, FolkloreRevision.Status.APPROVED)
        self.assertIsNotNone(revision.entry_id)
        entry = revision.entry
        entry.refresh_from_db()
        self.assertEqual(entry.status, FolkloreEntry.Status.APPROVED)

    def test_folklore_quorum_accepts_two_admins(self):
        revision = self._pending_folklore()
        submit_folklore_review(
            revision=revision,
            reviewer=self.admin,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Admin approval one.",
        )
        revision.refresh_from_db()
        self.assertEqual(revision.status, FolkloreRevision.Status.PENDING)

        submit_folklore_review(
            revision=revision,
            reviewer=self.admin2,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Admin approval two.",
        )
        revision.refresh_from_db()
        self.assertEqual(revision.status, FolkloreRevision.Status.APPROVED)

    def test_flag_then_reject_sets_under_review_then_archived(self):
        revision = self._pending_folklore()
        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Looks good",
        )
        submit_folklore_review(
            revision=revision,
            reviewer=self.admin,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Approve publish",
        )
        revision.refresh_from_db()
        entry = revision.entry
        entry.refresh_from_db()
        self.assertEqual(entry.status, FolkloreEntry.Status.APPROVED)

        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=FolkloreReview.Decision.FLAG,
            notes="Needs dispute review",
        )
        entry.refresh_from_db()
        self.assertEqual(entry.status, FolkloreEntry.Status.APPROVED_UNDER_REVIEW)

        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer2,
            decision=FolkloreReview.Decision.REJECT,
            notes="Reject on re-review",
        )
        entry.refresh_from_db()
        self.assertEqual(entry.status, FolkloreEntry.Status.ARCHIVED)
        notification = Notification.objects.get(
            user=self.contributor,
            notif_type=Notification.Type.REVISION_REJECTED,
        )
        self.assertIn("rejected after re-review", notification.message)
        self.assertIn("Reject on re-review", notification.message)
        self.assertEqual(notification.target_url, "/admin-applications?tab=contributions")

    def test_folklore_rereview_quorum_notifies_that_entry_remains_approved(self):
        revision = self._pending_folklore()
        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Looks good",
        )
        submit_folklore_review(
            revision=revision,
            reviewer=self.admin,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Approve publish",
        )
        revision.refresh_from_db()
        entry = revision.entry
        Notification.objects.filter(user=self.contributor).delete()

        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=FolkloreReview.Decision.FLAG,
            notes="Needs another review.",
        )
        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer2,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Looks valid.",
        )
        submit_folklore_review(
            revision=revision,
            reviewer=self.admin2,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Approved after re-review.",
        )

        entry.refresh_from_db()
        self.assertEqual(entry.status, FolkloreEntry.Status.APPROVED)
        notification = Notification.objects.get(
            user=self.contributor,
            notif_type=Notification.Type.REVISION_APPROVED,
        )
        self.assertIn("completed re-review", notification.message)
        self.assertEqual(
            notification.target_url,
            f"/folklore-view?entry_id={entry.id}",
        )

    def test_flagged_folklore_can_be_returned_as_an_assigned_correction_draft(self):
        revision = self._pending_folklore()
        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Looks good",
        )
        submit_folklore_review(
            revision=revision,
            reviewer=self.admin,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Approve publish",
        )
        revision.refresh_from_db()
        entry = revision.entry

        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=FolkloreReview.Decision.FLAG,
            notes="The original account needs clarification.",
        )
        submit_folklore_review(
            revision=revision,
            reviewer=self.admin,
            decision=FolkloreReview.Decision.RETURN,
            notes="Clarify the source and narrative.",
            assigned_to_username=self.reviewer2.username,
            source_revision_id=str(revision.id),
        )

        entry.refresh_from_db()
        assignment = CorrectionAssignment.objects.get(folklore_source_revision=revision)
        self.assertEqual(entry.status, FolkloreEntry.Status.REJECTED)
        self.assertEqual(assignment.assigned_to, self.reviewer2)
        self.assertEqual(
            assignment.folklore_correction_revision.status,
            FolkloreRevision.Status.DRAFT,
        )

    def test_folklore_submit_endpoint_updates_status(self):
        revision = self._pending_folklore()
        self.client.force_login(self.reviewer1)
        response = self.client.post(
            "/api/reviews/folklore/submit",
            data=json.dumps(
                {
                    "revision_id": str(revision.id),
                    "decision": "approve",
                    "notes": "approve 1",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        revision.refresh_from_db()
        self.assertEqual(revision.status, FolkloreRevision.Status.PENDING)

    def test_dashboard_includes_pending_folklore(self):
        revision = self._pending_folklore()
        self.client.force_login(self.reviewer1)
        response = self.client.get("/api/reviews/dashboard")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        pending_ids = {row["revision_id"] for row in payload["pending_folklore_submissions"]}
        self.assertIn(str(revision.id), pending_ids)

    def test_dashboard_excludes_pending_folklore_already_reviewed_by_user(self):
        revision = self._pending_folklore()
        submit_folklore_review(
            revision=revision,
            reviewer=self.admin,
            decision=FolkloreReview.Decision.APPROVE,
            notes="Admin already reviewed",
        )

        self.client.force_login(self.admin)
        response = self.client.get("/api/reviews/dashboard")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        pending_ids = {row["revision_id"] for row in payload["pending_folklore_submissions"]}
        self.assertNotIn(str(revision.id), pending_ids)

    def test_dashboard_lists_my_folklore_approval_awaiting_quorum(self):
        revision = self._pending_folklore()
        submit_folklore_review(
            revision=revision,
            reviewer=self.reviewer1,
            decision=FolkloreReview.Decision.APPROVE,
            notes="First approval",
        )

        self.client.force_login(self.reviewer1)
        response = self.client.get("/api/reviews/dashboard")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)

        awaiting_row = next(
            item
            for item in payload["folklore"]["awaiting_quorum_after_my_approval"]
            if item["revision_id"] == str(revision.id)
        )
        self.assertEqual(awaiting_row["title"], "Folklore Pending")
        self.assertEqual(awaiting_row["reviewer_approvals"], 1)
        self.assertEqual(awaiting_row["admin_approvals"], 0)
        self.assertEqual(
            awaiting_row["quorum_requirement"],
            "Needs 1 more reviewer/admin approval",
        )

    def test_submit_endpoint_entry_id_fallback_creates_revision(self):
        entry = FolkloreEntry.objects.create(
            title="Legacy pending entry",
            content="Legacy content",
            category=FolkloreEntry.Category.LEGEND,
            municipality_source="Basco",
            source="Legacy source",
            contributor=self.contributor,
            status=FolkloreEntry.Status.PENDING,
        )
        self.client.force_login(self.reviewer1)
        response = self.client.post(
            "/api/reviews/folklore/submit",
            data=json.dumps(
                {
                    "entry_id": str(entry.id),
                    "decision": "approve",
                    "notes": "legacy approve",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("revision_id", payload)
        revision = FolkloreRevision.objects.get(id=payload["revision_id"])
        self.assertEqual(revision.entry_id, entry.id)
        self.assertEqual(revision.status, FolkloreRevision.Status.PENDING)

    def test_folklore_submit_endpoint_invalid_uuid_returns_400(self):
        self.client.force_login(self.reviewer1)
        response = self.client.post(
            "/api/reviews/folklore/submit",
            data=json.dumps(
                {
                    "revision_id": "PASTE_REVISION_ID_HERE",
                    "decision": "approve",
                    "notes": "invalid id",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid revision_id UUID", response.json()["detail"])

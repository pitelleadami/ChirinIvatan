from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from dictionary.models import Entry, EntryRevision, EntryStatus, VariantGroup
from dictionary.services import (
    create_revision_from_entry,
    finalize_approved_revision,
    get_visible_revision_history,
    publish_revision,
)
from dictionary.state_machine import validate_transition
from dictionary.variant_services import promote_to_mother
from folklore.models import FolkloreEntry
from users.models import Notification, UserProfile

User = get_user_model()


class DictionaryServicesTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create_user(
            username="contrib",
            password="testpass123",
        )
        self.other_contributor = User.objects.create_user(
            username="contrib2",
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

    def test_create_revision_from_variant_uses_mother_semantic_snapshot(self):
        mother = Entry.objects.create(
            term="vahay",
            meaning="house",
            part_of_speech="noun",
            english_synonym="home",
            status=EntryStatus.APPROVED,
            is_mother=True,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        group = VariantGroup.objects.create(mother_entry=mother)
        mother.variant_group = group
        mother.save(update_fields=["variant_group"])
        variant = Entry.objects.create(
            term="bahay",
            meaning="stale variant-local meaning",
            pronunciation_text="ba-hay",
            variant_type="Isamurong",
            status=EntryStatus.APPROVED,
            is_mother=False,
            variant_group=group,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )

        revision = create_revision_from_entry(
            entry=variant,
            contributor=self.other_contributor,
        )

        self.assertEqual(revision.proposed_data["term"], "bahay")
        self.assertEqual(revision.proposed_data["pronunciation_text"], "ba-hay")
        self.assertEqual(revision.proposed_data["variant_type"], "Isamurong")
        self.assertEqual(revision.proposed_data["meaning"], "house")
        self.assertEqual(revision.proposed_data["part_of_speech"], "noun")
        self.assertEqual(revision.proposed_data["english_synonym"], "home")

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
        self.assertEqual(entry.term, "Vahay")
        self.assertEqual(entry.meaning, "House")
        self.assertEqual(entry.part_of_speech, "noun")
        self.assertEqual(entry.variant_type, "general")
        self.assertEqual(entry.usage_notes, "common noun")
        self.assertEqual(entry.last_revised_by, self.contributor)
        self.assertEqual(entry.last_approved_by.count(), 1)
        self.assertEqual(entry.last_approved_by.first(), self.approver)

    def test_publish_revision_updates_active_media_contributor(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "term": "vahay",
                "audio_pronunciation": "dictionary/audio/a1.mp3",
                "photo": "dictionary/photos/p1.jpg",
            },
            status=EntryRevision.Status.APPROVED,
        )
        entry = publish_revision(revision=revision, approvers=[self.approver])
        self.assertEqual(entry.audio_contributor, self.contributor)
        self.assertEqual(entry.photo_contributor, self.contributor)

        update_revision = EntryRevision.objects.create(
            entry=entry,
            contributor=self.other_contributor,
            proposed_data={
                "term": "vahay",
                "audio_pronunciation": "dictionary/audio/a2.mp3",
                "photo": "dictionary/photos/p2.jpg",
            },
            status=EntryRevision.Status.APPROVED,
        )
        entry = publish_revision(revision=update_revision, approvers=[self.approver])
        self.assertEqual(entry.audio_contributor, self.other_contributor)
        self.assertEqual(entry.photo_contributor, self.other_contributor)

    def test_publish_variant_revision_updates_mother_semantic_and_variant_specific_fields(self):
        mother = Entry.objects.create(
            term="vahay",
            meaning="old shared meaning",
            part_of_speech="noun",
            status=EntryStatus.APPROVED,
            is_mother=True,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        group = VariantGroup.objects.create(mother_entry=mother)
        mother.variant_group = group
        mother.save(update_fields=["variant_group"])
        variant = Entry.objects.create(
            term="bahay",
            pronunciation_text="old pronunciation",
            status=EntryStatus.APPROVED,
            is_mother=False,
            variant_group=group,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        revision = EntryRevision.objects.create(
            entry=variant,
            contributor=self.other_contributor,
            proposed_data={
                "term": "bahay",
                "meaning": "updated shared meaning",
                "part_of_speech": "noun",
                "pronunciation_text": "new pronunciation",
                "variant_type": "Isamurong",
                "term_source_is_self_knowledge": True,
            },
            status=EntryRevision.Status.APPROVED,
        )

        publish_revision(revision=revision, approvers=[self.approver])
        mother.refresh_from_db()
        variant.refresh_from_db()

        self.assertEqual(mother.meaning, "Updated shared meaning")
        self.assertEqual(variant.meaning, "")
        self.assertEqual(variant.pronunciation_text, "new pronunciation")
        self.assertEqual(variant.variant_type, "Isamurong")

    def test_publish_revision_creates_additional_variant_entries(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "term": "vahay",
                "meaning": "house",
                "part_of_speech": "noun",
                "variant_type": "General Ivatan",
                "term_source_is_self_knowledge": True,
                "variants": [
                    {
                        "term": "bahay",
                        "variant_type": "Isamurong",
                        "pronunciation_text": "ba-hay",
                        "audio_pronunciation": "dictionary/audio/bahay.mp3",
                        "audio_source": "Audio Source: Shared pronunciation by Ana",
                        "audio_source_is_self_recorded": False,
                    }
                ],
            },
            status=EntryRevision.Status.APPROVED,
        )

        entry = publish_revision(revision=revision, approvers=[self.approver])
        group = entry.variant_group
        variant = group.entries.get(term="Bahay")

        self.assertFalse(variant.is_mother)
        self.assertEqual(variant.meaning, "House")
        self.assertEqual(variant.pronunciation_text, "ba-hay")
        self.assertEqual(variant.audio_contributor, self.contributor)
        self.assertTrue(
            EntryRevision.objects.filter(
                entry=variant,
                status=EntryRevision.Status.APPROVED,
                is_base_snapshot=True,
            ).exists()
        )

    def test_publish_revision_normalizes_headword_meaning_and_examples(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "term": "aMUNG",
                "meaning": "fish caught near Basco",
                "example_sentence": "MANGU KA",
                "example_translation": "HOW ARE YOU",
            },
            status=EntryRevision.Status.APPROVED,
        )

        entry = publish_revision(revision=revision, approvers=[self.approver])

        self.assertEqual(entry.term, "Amung")
        self.assertEqual(entry.meaning, "Fish caught near Basco")
        self.assertEqual(entry.example_sentence, "Mangu ka.")
        self.assertEqual(entry.example_translation, "How are you.")

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
        self.assertTrue(EntryRevision.objects.filter(id=base.id, is_base_snapshot=True).exists())
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
            first_name="Test",
            last_name="Contributor",
        )
        self.reviewer = User.objects.create_user(
            username="api_reviewer",
            password="testpass123",
            first_name="Review",
            last_name="Steward",
        )
        reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.reviewer.groups.add(reviewer_group)
        contributor_group, _ = Group.objects.get_or_create(name="Contributor")
        self.contributor.groups.add(contributor_group)
        UserProfile.objects.create(
            user=self.contributor,
            name_extension="Jr.",
            post_nominals="MA",
        )

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

    def test_entry_detail_includes_spec_sections(self):
        entry = self._build_entry_with_history()

        response = self.client.get(f"/api/dictionary/entries/{entry.id}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertIn("header", payload)
        self.assertIn("semantic_core", payload)
        self.assertIn("variant_section", payload)
        self.assertIn("connected_variants", payload)
        self.assertIn("contributors", payload)
        self.assertEqual(payload["header"]["term"], "api-term")
        self.assertEqual(payload["semantic_core"]["meaning"], entry.meaning)

    def test_initial_approval_does_not_claim_a_reviser_and_returns_linkable_actors(self):
        entry = Entry.objects.create(
            term="first-version",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        entry.last_approved_by.add(self.reviewer)
        EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "first-version"},
            status=EntryRevision.Status.APPROVED,
            approved_at=timezone.now(),
            is_base_snapshot=True,
        )

        response = self.client.get(f"/api/dictionary/entries/{entry.id}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(
            payload["attribution"]["term"]["initially_contributed_by_actor"],
            {"username": "api_contrib", "display_name": "Test Contributor Jr., MA"},
        )
        self.assertEqual(
            payload["attribution"]["always_visible"]["reviewed_and_approved_by_actors"],
            [{"username": "api_reviewer", "display_name": "Review Steward"}],
        )
        self.assertIsNone(payload["attribution"]["always_visible"]["last_revised_by"])
        self.assertEqual(payload["contributors"]["unique_revision_contributor_actors"], [])

    def test_contributor_can_flag_public_entry_from_detail(self):
        entry = Entry.objects.create(
            term="flag-me",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        EntryRevision.objects.create(
            entry=entry,
            contributor=self.contributor,
            proposed_data={"term": "flag-me"},
            status=EntryRevision.Status.APPROVED,
            approved_at=timezone.now(),
            is_base_snapshot=True,
        )
        self.client.force_login(self.contributor)

        response = self.client.get(f"/api/dictionary/entries/{entry.id}")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["review_action"]["can_flag_for_rereview"])

    def test_variant_entry_uses_mother_semantic_core(self):
        mother = Entry.objects.create(
            term="mother-term",
            meaning="mother meaning",
            part_of_speech="noun",
            status=EntryStatus.APPROVED,
            is_mother=True,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        group = VariantGroup.objects.create(mother_entry=mother)
        mother.variant_group = group
        mother.save(update_fields=["variant_group"])

        sibling = Entry.objects.create(
            term="sibling-term",
            variant_type="isamurong",
            status=EntryStatus.APPROVED,
            is_mother=False,
            variant_group=group,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        variant = Entry.objects.create(
            term="variant-term",
            meaning="should not be shown as semantic core",
            variant_type="ivasay",
            status=EntryStatus.APPROVED,
            is_mother=False,
            variant_group=group,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )

        response = self.client.get(f"/api/dictionary/entries/{variant.id}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        # Semantic core should come from mother entry for variants.
        self.assertEqual(payload["semantic_core"]["source_entry_id"], str(mother.id))
        self.assertEqual(payload["semantic_core"]["meaning"], "mother meaning")
        # Current clicked variant still has its own variant-specific section.
        self.assertEqual(payload["variant_section"]["term"], "variant-term")

        connected_ids = {item["entry_id"] for item in payload["connected_variants"]}
        self.assertIn(str(mother.id), connected_ids)
        self.assertIn(str(sibling.id), connected_ids)

    def test_public_entry_list_uses_mother_semantic_core_for_variants(self):
        mother = Entry.objects.create(
            term="mother-term",
            meaning="mother meaning",
            part_of_speech="noun",
            status=EntryStatus.APPROVED,
            is_mother=True,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        group = VariantGroup.objects.create(mother_entry=mother)
        mother.variant_group = group
        mother.save(update_fields=["variant_group"])
        variant = Entry.objects.create(
            term="variant-term",
            meaning="",
            part_of_speech="",
            status=EntryStatus.APPROVED,
            is_mother=False,
            variant_group=group,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )

        response = self.client.get("/api/dictionary/entries?q=variant-term")
        self.assertEqual(response.status_code, 200)
        row = response.json()["rows"][0]

        self.assertEqual(row["entry_id"], str(variant.id))
        self.assertEqual(row["meaning"], "mother meaning")
        self.assertEqual(row["part_of_speech"], "noun")

    def test_public_entry_list_shows_approved_and_under_review_entries(self):
        approved = Entry.objects.create(
            term="approved-term",
            meaning="shown",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        under_review = Entry.objects.create(
            term="under-review-term",
            meaning="hidden",
            status=EntryStatus.APPROVED_UNDER_REVIEW,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )

        response = self.client.get("/api/dictionary/entries")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        rows = payload["rows"]

        self.assertEqual(
            {row["entry_id"] for row in rows},
            {str(approved.id), str(under_review.id)},
        )
        self.assertEqual(payload["counts"]["approved"], 1)
        self.assertEqual(payload["counts"]["approved_under_review"], 1)
        self.assertIn(EntryStatus.APPROVED_UNDER_REVIEW, {row["status"] for row in rows})

    def test_english_lookup_indexes_only_one_or_two_word_meanings(self):
        Entry.objects.create(
            term="vahay",
            meaning="house",
            part_of_speech="noun",
            status=EntryStatus.APPROVED,
            is_mother=True,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        Entry.objects.create(
            term="rakuh",
            meaning="to move",
            part_of_speech="verb",
            status=EntryStatus.APPROVED,
            is_mother=True,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        Entry.objects.create(
            term="mayvani",
            meaning="to move quickly",
            part_of_speech="verb",
            status=EntryStatus.APPROVED,
            is_mother=True,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )

        response = self.client.get("/api/dictionary/english-terms?q=move")
        self.assertEqual(response.status_code, 200)
        rows = response.json()["rows"]

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["english_term"], "to move")
        self.assertEqual(rows[0]["translations"][0]["term"], "rakuh")

    def test_english_lookup_uses_mother_meaning_for_variants(self):
        mother = Entry.objects.create(
            term="vahay",
            meaning="house",
            part_of_speech="noun",
            status=EntryStatus.APPROVED,
            is_mother=True,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        group = VariantGroup.objects.create(mother_entry=mother)
        mother.variant_group = group
        mother.save(update_fields=["variant_group"])
        Entry.objects.create(
            term="bahay",
            meaning="",
            status=EntryStatus.APPROVED,
            is_mother=False,
            variant_group=group,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )

        response = self.client.get("/api/dictionary/english-terms?q=house")
        self.assertEqual(response.status_code, 200)
        translations = response.json()["rows"][0]["translations"]

        self.assertEqual(
            {item["term"] for item in translations},
            {"bahay", "vahay"},
        )

    def test_entry_detail_masks_sources_based_on_visibility_flags(self):
        entry = Entry.objects.create(
            term="mask-term",
            status=EntryStatus.APPROVED,
            is_mother=True,
            source_text="From elder interview",
            term_source_is_self_knowledge=True,
            audio_source="Self recording",
            audio_source_is_self_recorded=True,
            photo_source="Owned by contributor",
            photo_source_is_contributor_owned=True,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
            audio_contributor=self.contributor,
            photo_contributor=self.contributor,
        )

        response = self.client.get(f"/api/dictionary/entries/{entry.id}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        attribution = payload["attribution"]

        self.assertEqual(attribution["term"]["initially_contributed_by"], "api_contrib")
        self.assertEqual(attribution["term"]["source_text"], "")
        self.assertEqual(attribution["audio"]["source"], "")
        self.assertIsNone(attribution["audio"]["contributed_by"])
        self.assertEqual(attribution["photo"]["source"], "")
        self.assertEqual(attribution["photo"]["contributed_by"], "api_contrib")


class DictionaryRevisionApiTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create_user(
            username="dict_contributor",
            password="testpass123",
        )
        self.other_user = User.objects.create_user(
            username="dict_other",
            password="testpass123",
        )
        self.entry = Entry.objects.create(
            term="rayu",
            meaning="far",
            part_of_speech="adjective",
            status=EntryStatus.APPROVED,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
            inflected_forms={"root": "rayu"},
        )

    def test_create_update_submit_and_list_dictionary_revision(self):
        self.client.force_login(self.contributor)

        create_response = self.client.post(
            "/api/dictionary/revisions/create",
            data={
                "term": "chirin",
                "meaning": "word or language",
                "part_of_speech": "noun",
                "phonetic": "/tʃi.rin/",
                "term_source_is_self_knowledge": "true",
                "inflected_forms": '{"plural": "chirin"}',
            },
        )
        self.assertEqual(create_response.status_code, 201)
        revision_id = create_response.json()["revision_id"]
        self.assertEqual(create_response.json()["proposed_data"]["phonetic"], "/tʃi.rin/")

        update_response = self.client.post(
            f"/api/dictionary/revisions/{revision_id}",
            data={
                "meaning": "language; speech",
                "variant_type": "general",
            },
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["meaning"], "Language; speech")

        list_response = self.client.get("/api/dictionary/revisions/my")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()["rows"]), 1)

        submit_response = self.client.post(f"/api/dictionary/revisions/{revision_id}/submit")
        self.assertEqual(submit_response.status_code, 200)
        self.assertEqual(submit_response.json()["status"], EntryRevision.Status.PENDING)
        self.assertFalse(
            Notification.objects.filter(
                user=self.contributor,
                notif_type=Notification.Type.SUBMISSION_RECEIVED,
            ).exists()
        )

    def test_my_revisions_includes_reviewer_notes_for_rejected_submission(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            status=EntryRevision.Status.REJECTED,
            proposed_data={"term": "returned", "meaning": "Needs correction"},
            reviewer_notes="Please verify the source and spelling.",
        )
        self.client.force_login(self.contributor)

        response = self.client.get("/api/dictionary/revisions/my")

        self.assertEqual(response.status_code, 200)
        row = next(
            item for item in response.json()["rows"] if item["revision_id"] == str(revision.id)
        )
        self.assertEqual(row["reviewer_notes"], "Please verify the source and spelling.")

    def test_rejected_submission_can_be_fixed_and_resubmitted(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            status=EntryRevision.Status.REJECTED,
            proposed_data={
                "term": "returned",
                "meaning": "Needs correction",
                "term_source_is_self_knowledge": True,
            },
            reviewer_notes="Please correct the meaning.",
        )
        self.client.force_login(self.contributor)

        update_response = self.client.post(
            f"/api/dictionary/revisions/{revision.id}",
            data={"meaning": "Corrected meaning"},
        )
        submit_response = self.client.post(f"/api/dictionary/revisions/{revision.id}/submit")

        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(submit_response.status_code, 200)
        revision.refresh_from_db()
        self.assertEqual(revision.proposed_data["meaning"], "Corrected meaning")
        self.assertEqual(revision.status, EntryRevision.Status.PENDING)

    def test_create_and_update_draft_allow_one_field(self):
        self.client.force_login(self.contributor)

        create_response = self.client.post(
            "/api/dictionary/revisions/create",
            data={"term": "partial-headword"},
        )

        self.assertEqual(create_response.status_code, 201)
        revision_id = create_response.json()["revision_id"]
        self.assertEqual(create_response.json()["term"], "Partial-headword")

        update_response = self.client.post(
            f"/api/dictionary/revisions/{revision_id}",
            data={"meaning": "partial meaning"},
        )

        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["meaning"], "Partial meaning")

        submit_response = self.client.post(f"/api/dictionary/revisions/{revision_id}/submit")
        self.assertEqual(submit_response.status_code, 400)

    def test_create_draft_normalizes_dictionary_text_case(self):
        self.client.force_login(self.contributor)

        response = self.client.post(
            "/api/dictionary/revisions/create",
            data={
                "term": "aMUNG",
                "meaning": "fish from Basco",
                "example_sentence": "mangu ka",
                "example_translation": "how are you",
            },
        )

        self.assertEqual(response.status_code, 201)
        proposed = response.json()["proposed_data"]
        self.assertEqual(proposed["term"], "Amung")
        self.assertEqual(proposed["meaning"], "Fish from Basco")
        self.assertEqual(proposed["example_sentence"], "Mangu ka.")
        self.assertEqual(proposed["example_translation"], "How are you.")

    def test_create_draft_rejects_empty_payload(self):
        self.client.force_login(self.contributor)

        response = self.client.post("/api/dictionary/revisions/create", data={})

        self.assertEqual(response.status_code, 400)
        self.assertIn("at least one field", response.json()["detail"])

    def test_start_revision_from_existing_entry_uses_snapshot(self):
        self.client.force_login(self.other_user)

        response = self.client.post(f"/api/dictionary/entries/{self.entry.id}/revisions/start")

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["entry_id"], str(self.entry.id))
        self.assertEqual(payload["term"], "rayu")
        self.assertEqual(payload["meaning"], "far")

    def test_submit_requires_term(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={"meaning": "missing term"},
            status=EntryRevision.Status.DRAFT,
        )
        self.client.force_login(self.contributor)

        response = self.client.post(f"/api/dictionary/revisions/{revision.id}/submit")

        self.assertEqual(response.status_code, 400)
        self.assertIn("headword is required", response.json()["detail"])

    def test_submit_requires_meaning(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={"term": "missing-meaning"},
            status=EntryRevision.Status.DRAFT,
        )
        self.client.force_login(self.contributor)

        response = self.client.post(f"/api/dictionary/revisions/{revision.id}/submit")

        self.assertEqual(response.status_code, 400)
        self.assertIn("meaning is required", response.json()["detail"])

    def test_submit_requires_english_translation_for_ivatan_example(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "term": "example-gap",
                "meaning": "has an untranslated example",
                "term_source_is_self_knowledge": True,
                "example_sentence": "Mangu ka?",
                "example_translation": "",
            },
            status=EntryRevision.Status.DRAFT,
        )
        self.client.force_login(self.contributor)

        response = self.client.post(f"/api/dictionary/revisions/{revision.id}/submit")

        self.assertEqual(response.status_code, 400)
        self.assertIn("English translation is required", response.json()["detail"])

    def test_submit_requires_english_translation_for_variant_ivatan_example(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "term": "variant-example-gap",
                "meaning": "has an untranslated variant example",
                "term_source_is_self_knowledge": True,
                "variants": [
                    {
                        "term": "variant form",
                        "example_sentence": "Mangu ka?",
                        "example_translation": "",
                    }
                ],
            },
            status=EntryRevision.Status.DRAFT,
        )
        self.client.force_login(self.contributor)

        response = self.client.post(f"/api/dictionary/revisions/{revision.id}/submit")

        self.assertEqual(response.status_code, 400)
        self.assertIn("Variant 1", response.json()["detail"])

    def test_submit_requires_audio_source_when_audio_not_self_recorded(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "term": "with-audio",
                "meaning": "has audio",
                "term_source_is_self_knowledge": True,
                "audio_pronunciation": "dictionary/audio/sample.mp3",
                "audio_source_is_self_recorded": False,
                "audio_source": "",
            },
            status=EntryRevision.Status.DRAFT,
        )
        self.client.force_login(self.contributor)

        response = self.client.post(f"/api/dictionary/revisions/{revision.id}/submit")

        self.assertEqual(response.status_code, 400)
        self.assertIn("audio source is required", response.json()["detail"])

    def test_submit_requires_photo_source_when_photo_not_contributor_owned(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "term": "with-photo",
                "meaning": "has photo",
                "term_source_is_self_knowledge": True,
                "photo": "dictionary/photos/sample.jpg",
                "photo_source_is_contributor_owned": False,
                "photo_source": "",
            },
            status=EntryRevision.Status.DRAFT,
        )
        self.client.force_login(self.contributor)

        response = self.client.post(f"/api/dictionary/revisions/{revision.id}/submit")

        self.assertEqual(response.status_code, 400)
        self.assertIn("photo source is required", response.json()["detail"])

    def test_submit_requires_headword_source_when_not_self_knowledge(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={
                "term": "with-source-gap",
                "meaning": "missing citation",
                "term_source_is_self_knowledge": False,
                "source_text": "",
            },
            status=EntryRevision.Status.DRAFT,
        )
        self.client.force_login(self.contributor)

        response = self.client.post(f"/api/dictionary/revisions/{revision.id}/submit")

        self.assertEqual(response.status_code, 400)
        self.assertIn("headword source is required", response.json()["detail"])

    def test_create_requires_headword_source_when_not_self_knowledge(self):
        self.client.force_login(self.contributor)

        response = self.client.post(
            "/api/dictionary/revisions/create",
            data={
                "term": "source-gap",
                "meaning": "missing source",
            },
        )

        self.assertEqual(response.status_code, 201)
        revision_id = response.json()["revision_id"]

        submit_response = self.client.post(f"/api/dictionary/revisions/{revision_id}/submit")

        self.assertEqual(submit_response.status_code, 400)
        self.assertIn("headword source is required", submit_response.json()["detail"])

    def test_user_cannot_update_someone_elses_revision(self):
        revision = EntryRevision.objects.create(
            contributor=self.contributor,
            proposed_data={"term": "private"},
            status=EntryRevision.Status.DRAFT,
        )
        self.client.force_login(self.other_user)

        response = self.client.post(
            f"/api/dictionary/revisions/{revision.id}",
            data={"term": "changed"},
        )

        self.assertEqual(response.status_code, 403)

    def test_invalid_inflected_forms_returns_400(self):
        self.client.force_login(self.contributor)

        response = self.client.post(
            "/api/dictionary/revisions/create",
            data={
                "term": "bad-json",
                "inflected_forms": "not json",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("inflected_forms", response.json()["detail"])

    def test_create_revision_accepts_structured_variants(self):
        self.client.force_login(self.contributor)

        response = self.client.post(
            "/api/dictionary/revisions/create",
            data={
                "term": "main-term",
                "meaning": "main meaning",
                "variant_type": "General Ivatan",
                "term_source_is_self_knowledge": "true",
                "variants": '[{"term": "variant-term", "variant_type": "Isamurong", "pronunciation_text": "va-ri-ant"}]',
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["variants"][0]["term"], "Variant-term")
        self.assertEqual(response.json()["variants"][0]["variant_type"], "Isamurong")

    def test_create_revision_preserves_variant_context_fields(self):
        self.client.force_login(self.contributor)

        response = self.client.post(
            "/api/dictionary/revisions/create",
            data={
                "term": "main-term",
                "meaning": "main meaning",
                "term_source_is_self_knowledge": "true",
                "variants": (
                    '[{"term": "old-term", "variant_type": "Old / Historical Form", '
                    '"pronunciation_text": "old pronunciation", '
                    '"usage_notes": "Used by older speakers.", '
                    '"example_sentence": "Old sample.", '
                    '"example_translation": "Old sample translation.", '
                    '"historical_note": "Remembered in Basco, pre-war, rarely used now."}]'
                ),
            },
        )

        self.assertEqual(response.status_code, 201)
        variant = response.json()["variants"][0]
        self.assertEqual(variant["variant_type"], "Old / Historical Form")
        self.assertEqual(variant["usage_notes"], "Used by older speakers.")
        self.assertEqual(variant["example_sentence"], "Old sample.")
        self.assertEqual(variant["example_translation"], "Old sample translation.")
        self.assertEqual(
            variant["historical_note"],
            "Remembered in Basco, pre-war, rarely used now.",
        )

    def test_create_revision_accepts_variant_audio_upload(self):
        self.client.force_login(self.contributor)

        response = self.client.post(
            "/api/dictionary/revisions/create",
            data={
                "term": "main-term",
                "meaning": "main meaning",
                "term_source_is_self_knowledge": "true",
                "variants": '[{"term": "variant-term", "variant_type": "Isamurong", "pronunciation_text": "va-ri-ant"}]',
                "variant_audio_0": SimpleUploadedFile(
                    "variant.wav",
                    b"RIFF....WAVEfmt ",
                    content_type="audio/wav",
                ),
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn(
            "dictionary/audio/variant",
            response.json()["variants"][0]["audio_pronunciation"],
        )

    def test_invalid_variants_returns_400(self):
        self.client.force_login(self.contributor)

        response = self.client.post(
            "/api/dictionary/revisions/create",
            data={
                "term": "bad-variants",
                "meaning": "bad variants meaning",
                "variants": "not json",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("variants", response.json()["detail"])

    def test_invalid_variant_item_returns_400(self):
        self.client.force_login(self.contributor)

        response = self.client.post(
            "/api/dictionary/revisions/create",
            data={
                "term": "bad-variant-item",
                "meaning": "bad variant item meaning",
                "variants": '["not an object"]',
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("variant", response.json()["detail"])


class VariantGovernanceTests(TestCase):
    def setUp(self):
        self.contributor = User.objects.create_user(
            username="vg_contrib",
            password="testpass123",
        )
        self.approver = User.objects.create_user(
            username="vg_approver",
            password="testpass123",
        )

    def test_general_ivatan_revision_promotes_entry_to_mother(self):
        mother = Entry.objects.create(
            term="mother",
            meaning="shared meaning",
            status=EntryStatus.APPROVED,
            is_mother=True,
            variant_type="isamurong",
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        group = VariantGroup.objects.create(mother_entry=mother)
        mother.variant_group = group
        mother.save(update_fields=["variant_group"])

        variant = Entry.objects.create(
            term="variant",
            status=EntryStatus.APPROVED,
            is_mother=False,
            variant_type="isabtang",
            variant_group=group,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        promote_to_mother(entry=mother)

        revision = EntryRevision.objects.create(
            entry=variant,
            contributor=self.contributor,
            proposed_data={"term": "variant", "variant_type": "General Ivatan"},
            status=EntryRevision.Status.APPROVED,
        )
        publish_revision(revision=revision, approvers=[self.approver])

        group.refresh_from_db()
        mother.refresh_from_db()
        variant.refresh_from_db()
        self.assertEqual(group.mother_entry_id, variant.id)
        self.assertTrue(variant.is_mother)
        self.assertFalse(mother.is_mother)
        self.assertEqual(variant.meaning, "shared meaning")

    def test_archiving_mother_promotes_earliest_approved_variant(self):
        mother = Entry.objects.create(
            term="mother",
            status=EntryStatus.APPROVED,
            is_mother=True,
            variant_group=None,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        group = VariantGroup.objects.create(mother_entry=mother)
        mother.variant_group = group
        mother.save(update_fields=["variant_group"])

        v1 = Entry.objects.create(
            term="v1",
            status=EntryStatus.APPROVED,
            is_mother=False,
            variant_group=group,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )
        v2 = Entry.objects.create(
            term="v2",
            status=EntryStatus.APPROVED,
            is_mother=False,
            variant_group=group,
            initial_contributor=self.contributor,
            last_revised_by=self.contributor,
        )

        base_time = timezone.now()
        EntryRevision.objects.create(
            entry=v1,
            contributor=self.contributor,
            proposed_data={"term": "v1"},
            status=EntryRevision.Status.APPROVED,
            approved_at=base_time,
        )
        EntryRevision.objects.create(
            entry=v2,
            contributor=self.contributor,
            proposed_data={"term": "v2"},
            status=EntryRevision.Status.APPROVED,
            approved_at=base_time + timedelta(minutes=1),
        )

        mother.archive()
        group.refresh_from_db()
        self.assertEqual(group.mother_entry_id, v1.id)


class LifecycleMaintenanceCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="life_user",
            password="testpass123",
        )

    def test_command_archives_old_rejected_and_preserves_archived_records(self):
        old = timezone.now() - timedelta(days=370)

        rejected_dict = Entry.objects.create(
            term="old-rejected",
            status=EntryStatus.REJECTED,
            initial_contributor=self.user,
            last_revised_by=self.user,
        )
        Entry.objects.filter(id=rejected_dict.id).update(created_at=old)

        archived_dict = Entry.objects.create(
            term="old-archived",
            status=EntryStatus.ARCHIVED,
            archived_at=old,
            initial_contributor=self.user,
            last_revised_by=self.user,
        )

        rejected_folk = FolkloreEntry.objects.create(
            title="folk-rejected",
            content="sample",
            category=FolkloreEntry.Category.MYTH,
            source="oral",
            contributor=self.user,
            status=FolkloreEntry.Status.REJECTED,
        )
        FolkloreEntry.objects.filter(id=rejected_folk.id).update(updated_at=old)

        archived_folk = FolkloreEntry.objects.create(
            title="folk-archived",
            content="sample",
            category=FolkloreEntry.Category.MYTH,
            source="oral",
            contributor=self.user,
            status=FolkloreEntry.Status.ARCHIVED,
            archived_at=old,
        )

        call_command("run_lifecycle_maintenance")

        rejected_dict.refresh_from_db()
        self.assertEqual(rejected_dict.status, EntryStatus.ARCHIVED)
        self.assertTrue(Entry.objects.filter(id=archived_dict.id).exists())

        rejected_folk.refresh_from_db()
        self.assertEqual(rejected_folk.status, FolkloreEntry.Status.ARCHIVED)
        self.assertTrue(FolkloreEntry.objects.filter(id=archived_folk.id).exists())

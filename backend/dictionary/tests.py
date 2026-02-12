from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from dictionary.models import Entry, EntryRevision, EntryStatus, VariantGroup
from dictionary.state_machine import validate_transition
from dictionary.services import (
    create_revision_from_entry,
    finalize_approved_revision,
    get_visible_revision_history,
    publish_revision,
)
from dictionary.variant_services import promote_to_mother
from django.contrib.auth.models import Group
from folklore.models import FolkloreEntry


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
        self.assertEqual(entry.term, "vahay")
        self.assertEqual(entry.meaning, "house")
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
        self.assertTrue(
            EntryRevision.objects.filter(id=base.id, is_base_snapshot=True).exists()
        )
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
        )
        self.reviewer = User.objects.create_user(
            username="api_reviewer",
            password="testpass123",
        )
        reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        self.reviewer.groups.add(reviewer_group)

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

    def test_command_archives_old_rejected_and_deletes_old_archived(self):
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
        self.assertFalse(Entry.objects.filter(id=archived_dict.id).exists())

        rejected_folk.refresh_from_db()
        self.assertEqual(rejected_folk.status, FolkloreEntry.Status.ARCHIVED)
        self.assertFalse(FolkloreEntry.objects.filter(id=archived_folk.id).exists())

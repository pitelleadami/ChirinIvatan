import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


# ============================================
# ENTRY STATUS ENUM
# ============================================

class EntryStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    APPROVED_UNDER_REVIEW = "approved_under_review", "Approved (Under Review)"
    REJECTED = "rejected", "Rejected"
    ARCHIVED = "archived", "Archived"
    DELETED = "deleted", "Deleted"


# ============================================
# VARIANT GROUP
# ============================================

class VariantGroup(models.Model):
    """
    Groups all variants under one semantic unit.
    Exactly one active mother term at a time.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    mother_entry = models.OneToOneField(
        "Entry",
        on_delete=models.PROTECT,
        related_name="mother_of_group",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"VariantGroup {self.id}"


# ============================================
# ENTRY (LIVE PUBLIC OBJECT)
# ============================================

class Entry(models.Model):
    """
    Represents the CURRENT PUBLIC version of a term.
    Immutable except via approved revisions.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # -------------------------------
    # VARIANT RELATIONSHIP
    # -------------------------------

    variant_group = models.ForeignKey(
        VariantGroup,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="entries",
    )

    is_mother = models.BooleanField(default=False)

    # -------------------------------
    # SEMANTIC CORE (MOTHER ONLY)
    # -------------------------------

    meaning = models.TextField(blank=True)
    part_of_speech = models.CharField(max_length=100, blank=True)

    photo = models.ImageField(upload_to="dictionary/photos/", null=True, blank=True)
    photo_source = models.TextField(blank=True)
    photo_source_is_contributor_owned = models.BooleanField(default=False)

    english_synonym = models.CharField(max_length=255, blank=True)
    ivatan_synonym = models.CharField(max_length=255, blank=True)
    english_antonym = models.CharField(max_length=255, blank=True)
    ivatan_antonym = models.CharField(max_length=255, blank=True)

    # -------------------------------
    # VARIANT-SPECIFIC FIELDS
    # -------------------------------

    term = models.CharField(max_length=255)

    pronunciation_text = models.CharField(max_length=255, blank=True)

    audio_pronunciation = models.FileField(
        upload_to="dictionary/audio/",
        null=True,
        blank=True,
    )

    audio_source = models.TextField(blank=True)
    audio_source_is_self_recorded = models.BooleanField(default=False)

    variant_type = models.CharField(max_length=100, blank=True)

    usage_notes = models.TextField(blank=True)
    etymology = models.TextField(blank=True)

    example_sentence = models.TextField(blank=True)
    example_translation = models.TextField(blank=True)

    source_text = models.TextField(blank=True)
    term_source_is_self_knowledge = models.BooleanField(default=False)

    inflected_forms = models.JSONField(default=dict, blank=True)

    audio_contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="audio_contributed_entries",
        null=True,
        blank=True,
    )
    photo_contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="photo_contributed_entries",
        null=True,
        blank=True,
    )

    # -------------------------------
    # GOVERNANCE FIELDS
    # -------------------------------

    status = models.CharField(
        max_length=30,
        choices=EntryStatus.choices,
        default=EntryStatus.DRAFT,
    )

    initial_contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="initial_entries",
    )

    last_revised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="last_revised_entries",
        null=True,
        blank=True,
    )

    last_approved_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="approved_entries",
        blank=True,
    )

    last_approved_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    archived_at = models.DateTimeField(null=True, blank=True)

    # -------------------------------
    # STATE HELPERS
    # -------------------------------

    def approve(self, approvers):
        self.status = EntryStatus.APPROVED
        self.last_approved_at = timezone.now()
        self.save(update_fields=["status", "last_approved_at"])
        self.last_approved_by.set(approvers)

    def archive(self):
        from dictionary.variant_services import handle_mother_removed_or_archived

        self.status = EntryStatus.ARCHIVED
        self.archived_at = timezone.now()
        self.save(update_fields=["status", "archived_at"])
        handle_mother_removed_or_archived(entry=self, removed=False)

    def __str__(self):
        return self.term


# ============================================
# ENTRY REVISION (SUBMISSION OBJECT)
# ============================================

class EntryRevision(models.Model):
    """
    All submissions (new terms, edits, media changes, variant additions)
    are represented as revisions.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    entry = models.ForeignKey(
        Entry,
        on_delete=models.CASCADE,
        related_name="revisions",
        null=True,
        blank=True,
    )

    contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="entry_revisions",
    )

    proposed_data = models.JSONField(
        help_text="Full proposed snapshot of entry fields."
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    reviewer_notes = models.TextField(blank=True)
    is_base_snapshot = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.id} ({self.status})"

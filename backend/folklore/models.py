"""
folklore/models.py

Folklore domain models.

Split:
- FolkloreEntry: current public row.
- FolkloreRevision: reviewable snapshot workflow.
"""

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

FOLKLORE_SUBCATEGORIES_BY_CATEGORY = {
    "oral_narratives": {"myths", "legends", "folktales", "oral_histories"},
    "wisdom_expressions": {"proverbs", "idioms", "riddles"},
    "songs_poetry": {"laji", "songs", "childrens_rhymes", "poems"},
    "beliefs_ritual_life": {"beliefs", "rituals", "prayers"},
    "traditional_knowledge": {
        "fishing_knowledge",
        "agriculture",
        "boatbuilding",
        "architecture",
        "folk_medicine",
        "weather_knowledge",
        "crafts",
    },
}

LEGACY_FOLKLORE_CATEGORY_MAP = {
    "myth": ("oral_narratives", "myths"),
    "legend": ("oral_narratives", "legends"),
    "proverb": ("wisdom_expressions", "proverbs"),
    "idiom": ("wisdom_expressions", "idioms"),
    "laji": ("songs_poetry", "laji"),
    "poem": ("songs_poetry", "poems"),
}


def normalize_folklore_taxonomy(data):
    category, subcategory = LEGACY_FOLKLORE_CATEGORY_MAP.get(
        str(data.get("category", "")).strip(), (None, None)
    )
    if category:
        data["category"] = category
        data["subcategory"] = data.get("subcategory") or subcategory
    return data


class FolkloreEntry(models.Model):
    """
    Live/public folklore entry.

    Embedded safeguards:
    - conditional source validation
    - conditional media-source validation
    - auto-default license assignment on approval
    - license immutability after approval
    """

    DEFAULT_LICENSE = "CC BY-NC 4.0"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        APPROVED_UNDER_REVIEW = "approved_under_review", "Approved (Under Review)"
        REJECTED = "rejected", "Rejected"
        ARCHIVED = "archived", "Archived"
        DELETED = "deleted", "Deleted"

    class Category(models.TextChoices):
        ORAL_NARRATIVES = "oral_narratives", "Oral Narratives"
        WISDOM_EXPRESSIONS = "wisdom_expressions", "Wisdom and Expressions"
        SONGS_POETRY = "songs_poetry", "Songs and Poetry"
        BELIEFS_RITUAL_LIFE = "beliefs_ritual_life", "Beliefs and Ritual Life"
        TRADITIONAL_KNOWLEDGE = "traditional_knowledge", "Traditional Knowledge"

    class Subcategory(models.TextChoices):
        MYTHS = "myths", "Myths"
        LEGENDS = "legends", "Legends"
        FOLKTALES = "folktales", "Folktales"
        ORAL_HISTORIES = "oral_histories", "Oral Histories"
        PROVERBS = "proverbs", "Proverbs"
        IDIOMS = "idioms", "Idioms"
        RIDDLES = "riddles", "Riddles"
        LAJI = "laji", "Laji"
        SONGS = "songs", "Songs"
        CHILDRENS_RHYMES = "childrens_rhymes", "Children's Rhymes"
        POEMS = "poems", "Poems"
        BELIEFS = "beliefs", "Beliefs"
        RITUALS = "rituals", "Rituals"
        PRAYERS = "prayers", "Prayers"
        FISHING_KNOWLEDGE = "fishing_knowledge", "Fishing Knowledge"
        AGRICULTURE = "agriculture", "Agriculture"
        BOATBUILDING = "boatbuilding", "Boatbuilding"
        ARCHITECTURE = "architecture", "Architecture"
        FOLK_MEDICINE = "folk_medicine", "Folk Medicine"
        WEATHER_KNOWLEDGE = "weather_knowledge", "Weather Knowledge"
        CRAFTS = "crafts", "Crafts"

    class MunicipalitySource(models.TextChoices):
        BASCO = "Basco", "Basco"
        MAHATAO = "Mahatao", "Mahatao"
        IVANA = "Ivana", "Ivana"
        UYUGAN = "Uyugan", "Uyugan"
        SABTANG = "Sabtang", "Sabtang"
        ITBAYAT = "Itbayat", "Itbayat"
        NOT_APPLICABLE = "Not Applicable", "Not Applicable"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    title = models.CharField(max_length=255)
    content = models.TextField()
    category = models.CharField(max_length=40, choices=Category.choices)
    subcategory = models.CharField(
        max_length=40, choices=Subcategory.choices, blank=True, default=""
    )
    municipality_source = models.CharField(
        max_length=32,
        choices=MunicipalitySource.choices,
        default=MunicipalitySource.NOT_APPLICABLE,
    )

    source = models.TextField(blank=True, default="")
    self_knowledge = models.BooleanField(default=False)
    media_url = models.URLField(blank=True)
    photo_upload = models.ImageField(upload_to="folklore/photos/", null=True, blank=True)
    audio_upload = models.FileField(upload_to="folklore/audio/", null=True, blank=True)
    media_source = models.TextField(blank=True, default="")
    self_produced_media = models.BooleanField(default=False)
    copyright_usage = models.CharField(max_length=255, blank=True, default="")

    contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="folklore_entries"
    )

    status = models.CharField(max_length=30, choices=Status.choices, default=Status.DRAFT)
    archived_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        # Always validate before persisting.
        update_fields = kwargs.get("update_fields")
        normalized = normalize_folklore_taxonomy(
            {"category": self.category, "subcategory": self.subcategory}
        )
        previous_subcategory = self.subcategory
        self.category = normalized.get("category", self.category)
        self.subcategory = normalized.get("subcategory", self.subcategory)
        if (
            update_fields is not None
            and self.subcategory != previous_subcategory
            and "subcategory" not in update_fields
        ):
            kwargs["update_fields"] = list(update_fields) + ["subcategory"]
        self.clean()

        if (
            self.status == self.Status.APPROVED
            and self.self_produced_media
            and not self.copyright_usage.strip()
        ):
            self.copyright_usage = self.DEFAULT_LICENSE
            # If caller used update_fields, make sure auto-default license
            # is actually persisted with the same save call.
            if update_fields is not None and "copyright_usage" not in update_fields:
                kwargs["update_fields"] = list(update_fields) + ["copyright_usage"]

        # Lock license once an entry has been approved. A license change
        # should happen through a new revision snapshot lifecycle.
        if self.pk:
            previous = FolkloreEntry.objects.filter(pk=self.pk).first()
            is_external_media_license_cleanup = (
                previous
                and previous.status == self.Status.APPROVED
                and not self.self_produced_media
                and not self.copyright_usage.strip()
            )
            if (
                previous
                and previous.status == self.Status.APPROVED
                and previous.copyright_usage != self.copyright_usage
                and not is_external_media_license_cleanup
            ):
                raise ValidationError("Copyright/license is immutable after approval.")

        super().save(*args, **kwargs)

    def clean(self):
        # Controlled-choice validation.
        valid_categories = {choice for choice, _ in self.Category.choices}
        if self.category not in valid_categories:
            raise ValidationError("Invalid category value.")

        valid_subcategories = {choice for choice, _ in self.Subcategory.choices}
        if self.subcategory and self.subcategory not in valid_subcategories:
            raise ValidationError("Invalid subcategory value.")
        if self.subcategory and self.subcategory not in FOLKLORE_SUBCATEGORIES_BY_CATEGORY.get(
            self.category, set()
        ):
            raise ValidationError("Subcategory does not belong to selected category.")

        valid_municipalities = {choice for choice, _ in self.MunicipalitySource.choices}
        if self.municipality_source not in valid_municipalities:
            raise ValidationError("Invalid municipality_source value.")

        if not self.self_knowledge and not self.source.strip():
            raise ValidationError("Source is required unless marked as self-knowledge.")

        has_media = bool(self.media_url.strip() or self.photo_upload or self.audio_upload)
        if has_media and not self.self_produced_media and not self.media_source.strip():
            raise ValidationError("Media source is required unless marked as self-produced.")

    def __str__(self):
        return self.title


FolkloreEntry.Category.MYTH = "myth"
FolkloreEntry.Category.LEGEND = "legend"
FolkloreEntry.Category.LAJI = "laji"
FolkloreEntry.Category.POEM = "poem"
FolkloreEntry.Category.PROVERB = "proverb"
FolkloreEntry.Category.IDIOM = "idiom"


class FolkloreComment(models.Model):
    """
    Flat comment on a live folklore entry.

    Any authenticated user may comment. Only the author or an admin may delete.
    Comments are not part of the revision/review workflow — they are discussion,
    not edits to the archival record.
    """

    BODY_MAX_LENGTH = 2000

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    entry = models.ForeignKey(
        FolkloreEntry,
        on_delete=models.CASCADE,
        related_name="comments",
    )

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="folklore_comments",
    )

    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def clean(self):
        body = (self.body or "").strip()
        if not body:
            raise ValidationError("Comment body must not be empty.")
        if len(body) > self.BODY_MAX_LENGTH:
            raise ValidationError(f"Comment must be {self.BODY_MAX_LENGTH} characters or fewer.")

    def __str__(self):
        return f"{self.author_id} on {self.entry_id}"


class FolkloreRevision(models.Model):
    """
    Submission/revision object for folklore content.

    Beginner model:
    - live entry = current public state
    - revision row = submitted version waiting for approval lifecycle
    - revision_type="revision": contributor updating their own entry
    - revision_type="variant": alternate version by a different contributor;
      on approval creates a new FolkloreEntry rather than overwriting the original
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class RevisionType(models.TextChoices):
        REVISION = "revision", "Revision"
        VARIANT = "variant", "Variant"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    entry = models.ForeignKey(
        FolkloreEntry,
        on_delete=models.CASCADE,
        related_name="revisions",
        null=True,
        blank=True,
    )

    # Populated only when revision_type="variant"; points to the source entry
    # that inspired the variant. Kept after source entry deletion (SET_NULL).
    variant_of = models.ForeignKey(
        FolkloreEntry,
        on_delete=models.SET_NULL,
        related_name="variant_revisions",
        null=True,
        blank=True,
    )

    revision_type = models.CharField(
        max_length=20,
        choices=RevisionType.choices,
        default=RevisionType.REVISION,
    )

    contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="folklore_revisions",
    )

    proposed_data = models.JSONField(help_text="Full proposed snapshot of folklore entry fields.")
    photo_upload = models.ImageField(upload_to="folklore/photos/", null=True, blank=True)
    audio_upload = models.FileField(upload_to="folklore/audio/", null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    reviewer_notes = models.TextField(blank=True)
    is_base_snapshot = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.id} ({self.status})"


class FolkloreMediaAsset(models.Model):
    """
    Image asset inserted inside a folklore rich-text draft.

    Assets begin attached to a revision. The rendered folklore HTML stores the
    returned image URL and data-media-id so the content remains readable through
    the normal public media path.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    revision = models.ForeignKey(
        FolkloreRevision,
        on_delete=models.CASCADE,
        related_name="media_assets",
        null=True,
        blank=True,
    )
    entry = models.ForeignKey(
        FolkloreEntry,
        on_delete=models.CASCADE,
        related_name="media_assets",
        null=True,
        blank=True,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="folklore_media_assets",
    )

    image = models.ImageField(upload_to="folklore/inline/")
    caption = models.CharField(max_length=240, blank=True, default="")
    alt_text = models.CharField(max_length=180, blank=True, default="")
    order = models.PositiveIntegerField(default=0)
    self_produced = models.BooleanField(default=True)
    source = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "created_at"]

    def clean(self):
        if not self.revision_id and not self.entry_id:
            raise ValidationError("Media asset must belong to a revision or entry.")
        if not self.self_produced and not self.source.strip():
            raise ValidationError("Source is required unless image is self-produced.")

    def __str__(self):
        return f"Folklore media {self.id}"

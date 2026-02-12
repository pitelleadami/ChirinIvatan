import uuid
from django.conf import settings
from django.db import models
from django.core.exceptions import ValidationError


class FolkloreEntry(models.Model):
    DEFAULT_LICENSE = "CC BY-NC 4.0"

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        APPROVED_UNDER_REVIEW = 'approved_under_review', 'Approved (Under Review)'
        REJECTED = 'rejected', 'Rejected'
        ARCHIVED = 'archived', 'Archived'
        DELETED = 'deleted', 'Deleted'

    class Category(models.TextChoices):
        MYTH = 'myth', 'Myth'
        LEGEND = 'legend', 'Legend'
        LAJI = 'laji', 'Laji'
        POEM = 'poem', 'Poem'
        PROVERB = 'proverb', 'Proverb'
        IDIOM = 'idiom', 'Idiom'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    title = models.CharField(max_length=255)
    content = models.TextField()
    category = models.CharField(max_length=20, choices=Category.choices)
    municipality_source = models.CharField(max_length=255, blank=True, default="")

    source = models.TextField()
    self_knowledge = models.BooleanField(default=False)
    media_url = models.URLField(blank=True)
    media_source = models.TextField(blank=True, default="")
    self_produced_media = models.BooleanField(default=False)
    copyright_usage = models.CharField(max_length=255, blank=True, default="")

    contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='folklore_entries'
    )

    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.DRAFT
    )
    archived_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")

        if (
            self.status == self.Status.APPROVED
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
            if (
                previous
                and previous.status == self.Status.APPROVED
                and previous.copyright_usage != self.copyright_usage
            ):
                raise ValidationError(
                    "Copyright/license is immutable after approval."
                )

        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class FolkloreRevision(models.Model):
    """
    Submission/revision object for folklore content.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    entry = models.ForeignKey(
        FolkloreEntry,
        on_delete=models.CASCADE,
        related_name="revisions",
        null=True,
        blank=True,
    )

    contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="folklore_revisions",
    )

    proposed_data = models.JSONField(
        help_text="Full proposed snapshot of folklore entry fields."
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

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.id} ({self.status})"

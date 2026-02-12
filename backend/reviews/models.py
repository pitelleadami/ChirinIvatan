import uuid
from django.conf import settings
from django.db import models
from dictionary.models import EntryRevision
from folklore.models import FolkloreEntry, FolkloreRevision


class Review(models.Model):
    class Decision(models.TextChoices):
        APPROVE = "approve", "Approve"
        REJECT = "reject", "Reject"
        FLAG = "flag", "Flag for Re-review"


    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    revision = models.ForeignKey(
        EntryRevision,
        on_delete=models.CASCADE,
        related_name="reviews",
        null=True,      # TEMPORARY for migration
        blank=True,     # TEMPORARY for migration
    )

    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reviews_given",
    )

    decision = models.CharField(
        max_length=10,
        choices=Decision.choices,
    )

    notes = models.TextField(blank=True)
    review_round = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("revision", "reviewer", "review_round"),
                name="uniq_review_reviewer_per_round",
            ),
        ]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.reviewer} → {self.decision}"


class ReviewAdminOverride(models.Model):
    class TargetType(models.TextChoices):
        DICTIONARY = "dictionary", "Dictionary"
        FOLKLORE = "folklore", "Folklore"

    class Action(models.TextChoices):
        FORCE_REJECT = "force_reject", "Force Reject"
        RESTORE_APPROVED = "restore_approved", "Restore Approved"
        ARCHIVE = "archive", "Archive"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="review_overrides",
    )

    target_type = models.CharField(max_length=20, choices=TargetType.choices)

    dictionary_entry = models.ForeignKey(
        "dictionary.Entry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_overrides",
    )
    folklore_entry = models.ForeignKey(
        "folklore.FolkloreEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_overrides",
    )

    action = models.CharField(max_length=20, choices=Action.choices)
    notes = models.TextField()

    status_before = models.CharField(max_length=30)
    status_after = models.CharField(max_length=30)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.target_type}:{self.action} "
            f"{self.status_before}->{self.status_after}"
        )


class FolkloreReview(models.Model):
    class Decision(models.TextChoices):
        APPROVE = "approve", "Approve"
        REJECT = "reject", "Reject"
        FLAG = "flag", "Flag for Re-review"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    folklore_revision = models.ForeignKey(
        FolkloreRevision,
        on_delete=models.CASCADE,
        related_name="reviews",
    )

    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="folklore_reviews_given",
    )

    decision = models.CharField(
        max_length=10,
        choices=Decision.choices,
    )

    notes = models.TextField(blank=True)
    review_round = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("folklore_revision", "reviewer", "review_round"),
                name="uniq_folklore_review_reviewer_per_round",
            ),
        ]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.reviewer} → {self.decision} (folklore)"

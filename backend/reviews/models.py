import uuid
from django.conf import settings
from django.db import models
from dictionary.models import EntryRevision


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

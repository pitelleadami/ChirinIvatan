import uuid
from django.conf import settings
from django.db import models


class Review(models.Model):
    class ContentType(models.TextChoices):
        DICTIONARY = 'dictionary_entry', 'Dictionary Entry'
        FOLKLORE = 'folklore_entry', 'Folklore Entry'
        AUDIO = 'audio_pronunciation', 'Audio Pronunciation'

    class Decision(models.TextChoices):
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        REVISION = 'revision_requested', 'Revision Requested'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='reviews'
    )

    content_type = models.CharField(max_length=30, choices=ContentType.choices)
    object_id = models.UUIDField()

    decision = models.CharField(max_length=30, choices=Decision.choices)
    comments = models.TextField(blank=True)

    reviewed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.content_type} review by {self.reviewer}"

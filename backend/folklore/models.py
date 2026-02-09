import uuid
from django.conf import settings
from django.db import models


class FolkloreEntry(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        ARCHIVED = 'archived', 'Archived'

    class Category(models.TextChoices):
        MYTH = 'myth', 'Myth'
        LEGEND = 'legend', 'Legend'
        LAJI = 'laji', 'Laji'
        POEM = 'poem', 'Poem'
        PROVERB = 'proverb', 'Proverb'
        IDIOM = 'idiom', 'Idiom'

    class Variant(models.TextChoices):
        ISAMURONG = 'isamurong', 'Isamurong'
        IVASAY = 'ivasay', 'Ivasay'
        ITBAYATEN = 'itbayaten', 'Itbayaten'
        ISABTANG = 'isabtang', 'Isabtang'
        GENERAL = 'general', 'General Ivatan'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    title = models.CharField(max_length=255)
    content = models.TextField()
    category = models.CharField(max_length=20, choices=Category.choices)

    variant = models.CharField(
        max_length=20,
        choices=Variant.choices,
        default=Variant.GENERAL
    )

    source = models.TextField()
    self_knowledge = models.BooleanField(default=False)
    media_url = models.URLField(blank=True)

    contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='folklore_entries'
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

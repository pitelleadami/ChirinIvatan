import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.db import models
from django.utils.text import slugify


def private_storage():
    return FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT)


ALLOWED_RESOURCE_EXTENSIONS = {".pdf", ".ppt", ".pptx", ".pps", ".ppsx"}


def validate_resource_file(value):
    filename = str(value.name or "").lower()
    if not any(filename.endswith(extension) for extension in ALLOWED_RESOURCE_EXTENSIONS):
        raise ValidationError("Upload a PDF or presentation file.")


class ResourceDocument(models.Model):
    class Visibility(models.TextChoices):
        PUBLIC = "public", "All stewards"
        MEMBERS = "members", "Members only (logged in)"
        ADMIN = "admin", "Admins and reviewers only"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=100, blank=True)
    file = models.FileField(
        upload_to="resources/",
        storage=private_storage,
        validators=[validate_resource_file],
        help_text="Accepted formats: PDF, PPT, PPTX, PPS, PPSX.",
    )
    visibility = models.CharField(
        max_length=20,
        choices=Visibility.choices,
        default=Visibility.PUBLIC,
        help_text="Who is allowed to open this document.",
    )
    is_published = models.BooleanField(
        default=True,
        help_text="Untick to hide the document without deleting it.",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="uploaded_resources",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category", "title"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title) or "resource"
            slug = base
            counter = 2
            while ResourceDocument.objects.exclude(pk=self.pk).filter(slug=slug).exists():
                slug = f"{base}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

import uuid
from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    municipality = models.CharField(max_length=255, blank=True, default="")
    affiliation = models.CharField(max_length=255, blank=True, default="")
    occupation = models.CharField(max_length=255, blank=True, default="")
    bio = models.TextField(blank=True, default="")
    profile_photo = models.ImageField(
        upload_to="users/profile_photos/",
        null=True,
        blank=True,
    )

    def __str__(self):
        return f"Profile<{self.user_id}>"


class ContributionEvent(models.Model):
    class Type(models.TextChoices):
        DICTIONARY_TERM = "dictionary_term", "Dictionary Term"
        FOLKLORE_ENTRY = "folklore_entry", "Folklore Entry"
        REVISION = "revision", "Revision"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contribution_events",
    )

    contribution_type = models.CharField(max_length=32, choices=Type.choices)

    dictionary_entry = models.ForeignKey(
        "dictionary.Entry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contribution_events",
    )
    folklore_entry = models.ForeignKey(
        "folklore.FolkloreEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contribution_events",
    )
    entry_revision = models.ForeignKey(
        "dictionary.EntryRevision",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contribution_events",
    )
    folklore_revision = models.ForeignKey(
        "folklore.FolkloreRevision",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contribution_events",
    )

    awarded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user", "dictionary_entry", "contribution_type"),
                condition=models.Q(contribution_type="revision"),
                name="uniq_revision_credit_per_user_entry",
            ),
            models.UniqueConstraint(
                fields=("user", "folklore_entry", "contribution_type"),
                condition=models.Q(contribution_type="revision"),
                name="uniq_revision_credit_per_user_folklore_entry",
            ),
            models.UniqueConstraint(
                fields=("user", "dictionary_entry", "contribution_type"),
                condition=models.Q(contribution_type="dictionary_term"),
                name="uniq_dictionary_term_credit_per_user_entry",
            ),
            models.UniqueConstraint(
                fields=("user", "folklore_entry", "contribution_type"),
                condition=models.Q(contribution_type="folklore_entry"),
                name="uniq_folklore_credit_per_user_entry",
            ),
        ]
        ordering = ["-awarded_at"]

    def __str__(self):
        return f"{self.user_id}:{self.contribution_type}"

import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("folklore", "0003_folkloreentry_archived_at"),
        ("reviews", "0003_reviewadminoverride"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="FolkloreReview",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "decision",
                    models.CharField(
                        choices=[
                            ("approve", "Approve"),
                            ("reject", "Reject"),
                            ("flag", "Flag for Re-review"),
                        ],
                        max_length=10,
                    ),
                ),
                ("notes", models.TextField(blank=True)),
                ("review_round", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "folklore_entry",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reviews",
                        to="folklore.folkloreentry",
                    ),
                ),
                (
                    "reviewer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="folklore_reviews_given",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.AddConstraint(
            model_name="folklorereview",
            constraint=models.UniqueConstraint(
                fields=("folklore_entry", "reviewer", "review_round"),
                name="uniq_folklore_review_reviewer_per_round",
            ),
        ),
    ]

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("folklore", "0008_folklorecomment"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="FolkloreMediaAsset",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("image", models.ImageField(upload_to="folklore/inline/")),
                ("caption", models.CharField(blank=True, default="", max_length=240)),
                ("alt_text", models.CharField(blank=True, default="", max_length=180)),
                ("order", models.PositiveIntegerField(default=0)),
                ("self_produced", models.BooleanField(default=True)),
                ("source", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("entry", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="media_assets", to="folklore.folkloreentry")),
                ("revision", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="media_assets", to="folklore.folklorerevision")),
                ("uploaded_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="folklore_media_assets", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["order", "created_at"],
            },
        ),
    ]

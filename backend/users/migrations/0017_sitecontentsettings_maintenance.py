from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0016_roleapplication_reviewer_reason"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitecontentsettings",
            name="maintenance_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="sitecontentsettings",
            name="maintenance_message",
            field=models.TextField(
                blank=True,
                default=(
                    "Chirin Ivatan is temporarily paused for maintenance. "
                    "Please check back soon."
                ),
            ),
        ),
    ]

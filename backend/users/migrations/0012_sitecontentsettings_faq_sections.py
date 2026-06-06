from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0011_userprofile_include_in_leaderboard_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitecontentsettings",
            name="faq_sections",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

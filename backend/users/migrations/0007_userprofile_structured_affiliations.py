from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0006_gamificationconfig_gamificationruntimestate_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="cultural_affiliations",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="other_affiliations",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

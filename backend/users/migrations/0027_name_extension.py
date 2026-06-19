from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0026_persistent_profile_onboarding"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleinvitation",
            name="name_extension",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="name_extension",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
    ]

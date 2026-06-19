from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dictionary", "0017_entry_phonetic"),
    ]

    operations = [
        migrations.AddField(
            model_name="entry",
            name="audio_license",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="entry",
            name="photo_license",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]

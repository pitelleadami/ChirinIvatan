from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dictionary", "0016_entry_audio_contributor_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="entry",
            name="phonetic",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]

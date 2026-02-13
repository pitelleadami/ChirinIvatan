from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("folklore", "0004_folklorerevision"),
    ]

    operations = [
        migrations.AlterField(
            model_name="folkloreentry",
            name="municipality_source",
            field=models.CharField(
                choices=[
                    ("Basco", "Basco"),
                    ("Mahatao", "Mahatao"),
                    ("Ivana", "Ivana"),
                    ("Uyugan", "Uyugan"),
                    ("Sabtang", "Sabtang"),
                    ("Itbayat", "Itbayat"),
                    ("Not Applicable", "Not Applicable"),
                ],
                default="Not Applicable",
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="folkloreentry",
            name="source",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="folkloreentry",
            name="audio_upload",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to="folklore/audio/",
            ),
        ),
        migrations.AddField(
            model_name="folkloreentry",
            name="photo_upload",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to="folklore/photos/",
            ),
        ),
        migrations.AddField(
            model_name="folklorerevision",
            name="audio_upload",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to="folklore/audio/",
            ),
        ),
        migrations.AddField(
            model_name="folklorerevision",
            name="photo_upload",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to="folklore/photos/",
            ),
        ),
    ]

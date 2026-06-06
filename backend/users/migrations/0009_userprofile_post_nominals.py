from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0008_roleinvitation"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="post_nominals",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
    ]

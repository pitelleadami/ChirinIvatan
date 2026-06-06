from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0013_consultant_role"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="show_on_yaru_chart",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="show_live_contributions",
            field=models.BooleanField(default=True),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0021_roleinvitation_replaced_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitecontentsettings",
            name="beta_locked",
            field=models.BooleanField(default=True),
        ),
    ]

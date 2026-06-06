from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0015_admin_role_invitation"),
    ]

    operations = [
        migrations.AddField(
            model_name="roleapplication",
            name="reviewer_reason",
            field=models.TextField(blank=True, default=""),
        ),
    ]

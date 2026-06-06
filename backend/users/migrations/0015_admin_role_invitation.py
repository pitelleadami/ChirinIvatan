from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0014_userprofile_public_visibility_flags"),
    ]

    operations = [
        migrations.AlterField(
            model_name="roleonboardingrecord",
            name="role",
            field=models.CharField(
                choices=[
                    ("contributor", "Contributor"),
                    ("reviewer", "Reviewer"),
                    ("consultant", "Consultant"),
                    ("admin", "Admin"),
                ],
                max_length=24,
            ),
        ),
        migrations.AlterField(
            model_name="roleinvitation",
            name="role",
            field=models.CharField(
                choices=[
                    ("contributor", "Contributor"),
                    ("reviewer", "Reviewer"),
                    ("consultant", "Consultant"),
                    ("admin", "Admin"),
                ],
                max_length=24,
            ),
        ),
    ]

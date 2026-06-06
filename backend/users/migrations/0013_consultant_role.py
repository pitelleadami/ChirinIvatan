from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0012_sitecontentsettings_faq_sections"),
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
                ],
                max_length=24,
            ),
        ),
        migrations.AlterField(
            model_name="roleonboardingrecord",
            name="method",
            field=models.CharField(
                choices=[
                    ("invited", "Invited"),
                    ("approved_application", "Approved Application"),
                    ("admin_created", "Admin Created"),
                ],
                max_length=40,
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
                ],
                max_length=24,
            ),
        ),
    ]

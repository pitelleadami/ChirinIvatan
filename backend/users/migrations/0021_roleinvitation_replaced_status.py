from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0020_sitecontentsettings_contributor_agreement_paragraphs_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="roleinvitation",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("accepted", "Accepted"),
                    ("replaced", "Replaced"),
                    ("revoked", "Revoked"),
                ],
                default="pending",
                max_length=24,
            ),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0029_account_deletion_schedule"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitecontentsettings",
            name="terms_conditions_paragraphs",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="sitecontentsettings",
            name="information_security_policy_paragraphs",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

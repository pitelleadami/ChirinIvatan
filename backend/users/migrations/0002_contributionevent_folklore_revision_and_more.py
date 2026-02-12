from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("folklore", "0004_folklorerevision"),
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="contributionevent",
            name="folklore_revision",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="contribution_events",
                to="folklore.folklorerevision",
            ),
        ),
        migrations.AddConstraint(
            model_name="contributionevent",
            constraint=models.UniqueConstraint(
                condition=models.Q(("contribution_type", "revision")),
                fields=("user", "folklore_entry", "contribution_type"),
                name="uniq_revision_credit_per_user_folklore_entry",
            ),
        ),
    ]

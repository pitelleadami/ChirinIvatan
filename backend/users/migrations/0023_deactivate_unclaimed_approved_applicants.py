from django.db import migrations


def deactivate_unclaimed_approved_applicants(apps, schema_editor):
    RoleApplication = apps.get_model("users", "RoleApplication")
    User = apps.get_model("auth", "User")

    applicant_ids = (
        RoleApplication.objects.filter(status="approved")
        .values_list("applicant_id", flat=True)
        .distinct()
    )
    User.objects.filter(
        id__in=applicant_ids,
        is_active=True,
        is_superuser=False,
        password__startswith="!",
    ).update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0022_sitecontentsettings_beta_locked"),
    ]

    operations = [
        migrations.RunPython(
            deactivate_unclaimed_approved_applicants,
            migrations.RunPython.noop,
        ),
    ]

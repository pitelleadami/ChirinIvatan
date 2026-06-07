from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0017_sitecontentsettings_maintenance"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitecontentsettings",
            name="brand_name",
            field=models.CharField(blank=True, default="Chirin Ivatan", max_length=160),
        ),
        migrations.AddField(
            model_name="sitecontentsettings",
            name="brand_logo_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="sitecontentsettings",
            name="landing_intro_text",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="sitecontentsettings",
            name="landing_body_text",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="sitecontentsettings",
            name="footer_left_text",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="sitecontentsettings",
            name="footer_center_text",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="sitecontentsettings",
            name="footer_right_text",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]

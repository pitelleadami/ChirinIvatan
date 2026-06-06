from django.db import migrations, models


OLD_CATEGORY_MAP = {
    "myth": ("oral_narratives", "myths"),
    "legend": ("oral_narratives", "legends"),
    "proverb": ("wisdom_expressions", "proverbs"),
    "idiom": ("wisdom_expressions", "idioms"),
    "laji": ("songs_poetry", "laji"),
    "poem": ("songs_poetry", "poems"),
}

NEW_CATEGORY_VALUES = {
    "oral_narratives",
    "wisdom_expressions",
    "songs_poetry",
    "beliefs_ritual_life",
    "traditional_knowledge",
}


def migrate_entry_taxonomy(apps, schema_editor):
    FolkloreEntry = apps.get_model("folklore", "FolkloreEntry")
    FolkloreRevision = apps.get_model("folklore", "FolkloreRevision")

    for entry in FolkloreEntry.objects.all().iterator():
        category, subcategory = OLD_CATEGORY_MAP.get(
            entry.category,
            (entry.category if entry.category in NEW_CATEGORY_VALUES else "oral_narratives", entry.subcategory or ""),
        )
        entry.category = category
        entry.subcategory = subcategory or entry.subcategory
        entry.save(update_fields=["category", "subcategory"])

    for revision in FolkloreRevision.objects.all().iterator():
        proposed_data = dict(revision.proposed_data or {})
        category_value = proposed_data.get("category", "")
        category, subcategory = OLD_CATEGORY_MAP.get(
            category_value,
            (
                category_value if category_value in NEW_CATEGORY_VALUES else "oral_narratives",
                proposed_data.get("subcategory", ""),
            ),
        )
        proposed_data["category"] = category
        proposed_data["subcategory"] = subcategory or proposed_data.get("subcategory", "")
        revision.proposed_data = proposed_data
        revision.save(update_fields=["proposed_data"])


def reverse_entry_taxonomy(apps, schema_editor):
    FolkloreEntry = apps.get_model("folklore", "FolkloreEntry")
    FolkloreRevision = apps.get_model("folklore", "FolkloreRevision")
    reverse_map = {value: key for key, value in OLD_CATEGORY_MAP.items()}

    for entry in FolkloreEntry.objects.all().iterator():
        old_category = reverse_map.get((entry.category, entry.subcategory), "myth")
        entry.category = old_category
        entry.save(update_fields=["category"])

    for revision in FolkloreRevision.objects.all().iterator():
        proposed_data = dict(revision.proposed_data or {})
        old_category = reverse_map.get(
            (proposed_data.get("category", ""), proposed_data.get("subcategory", "")),
            "myth",
        )
        proposed_data["category"] = old_category
        proposed_data.pop("subcategory", None)
        revision.proposed_data = proposed_data
        revision.save(update_fields=["proposed_data"])


class Migration(migrations.Migration):
    dependencies = [
        ("folklore", "0005_folklore_media_and_rules"),
    ]

    operations = [
        migrations.AlterField(
            model_name="folkloreentry",
            name="category",
            field=models.CharField(
                choices=[
                    ("oral_narratives", "Oral Narratives"),
                    ("wisdom_expressions", "Wisdom and Expressions"),
                    ("songs_poetry", "Songs and Poetry"),
                    ("beliefs_ritual_life", "Beliefs and Ritual Life"),
                    ("traditional_knowledge", "Traditional Knowledge"),
                ],
                max_length=40,
            ),
        ),
        migrations.AddField(
            model_name="folkloreentry",
            name="subcategory",
            field=models.CharField(
                blank=True,
                choices=[
                    ("myths", "Myths"),
                    ("legends", "Legends"),
                    ("folktales", "Folktales"),
                    ("oral_histories", "Oral Histories"),
                    ("proverbs", "Proverbs"),
                    ("idioms", "Idioms"),
                    ("riddles", "Riddles"),
                    ("laji", "Laji"),
                    ("songs", "Songs"),
                    ("childrens_rhymes", "Children's Rhymes"),
                    ("poems", "Poems"),
                    ("beliefs", "Beliefs"),
                    ("rituals", "Rituals"),
                    ("prayers", "Prayers"),
                    ("fishing_knowledge", "Fishing Knowledge"),
                    ("agriculture", "Agriculture"),
                    ("boatbuilding", "Boatbuilding"),
                    ("architecture", "Architecture"),
                    ("folk_medicine", "Folk Medicine"),
                    ("weather_knowledge", "Weather Knowledge"),
                    ("crafts", "Crafts"),
                ],
                default="",
                max_length=40,
            ),
        ),
        migrations.RunPython(migrate_entry_taxonomy, reverse_entry_taxonomy),
    ]

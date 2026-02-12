from django.db import migrations, models
import django.db.models.deletion


def _build_snapshot(entry):
    return {
        "title": entry.title,
        "content": entry.content,
        "category": entry.category,
        "municipality_source": entry.municipality_source,
        "source": entry.source,
        "self_knowledge": entry.self_knowledge,
        "media_url": entry.media_url,
        "media_source": entry.media_source,
        "self_produced_media": entry.self_produced_media,
        "copyright_usage": entry.copyright_usage,
    }


def _derived_revision_status(entry_status):
    if entry_status in {"approved", "approved_under_review"}:
        return "approved"
    if entry_status == "pending":
        return "pending"
    if entry_status == "draft":
        return "draft"
    return "rejected"


def backfill_folklore_revision(apps, schema_editor):
    FolkloreReview = apps.get_model("reviews", "FolkloreReview")
    FolkloreRevision = apps.get_model("folklore", "FolkloreRevision")

    revision_by_entry = {}

    for review in FolkloreReview.objects.all().iterator():
        entry_id = getattr(review, "folklore_entry_id", None)
        if not entry_id:
            continue

        revision = revision_by_entry.get(entry_id)
        if revision is None:
            entry = review.folklore_entry
            status = _derived_revision_status(entry.status)
            revision = FolkloreRevision.objects.create(
                entry_id=entry.id,
                contributor_id=entry.contributor_id,
                proposed_data=_build_snapshot(entry),
                status=status,
                # Synthetic backfill timestamp; preserves deterministic order.
                approved_at=review.created_at if status == "approved" else None,
                is_base_snapshot=(status == "approved"),
            )
            revision_by_entry[entry_id] = revision

        review.folklore_revision_id = revision.id
        review.save(update_fields=["folklore_revision"])


class Migration(migrations.Migration):
    dependencies = [
        ("folklore", "0004_folklorerevision"),
        ("reviews", "0004_folklorereview"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="folklorereview",
            name="uniq_folklore_review_reviewer_per_round",
        ),
        migrations.AddField(
            model_name="folklorereview",
            name="folklore_revision",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="reviews",
                to="folklore.folklorerevision",
            ),
        ),
        migrations.RunPython(
            backfill_folklore_revision,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="folklorereview",
            name="folklore_revision",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="reviews",
                to="folklore.folklorerevision",
            ),
        ),
        migrations.AddConstraint(
            model_name="folklorereview",
            constraint=models.UniqueConstraint(
                fields=("folklore_revision", "reviewer", "review_round"),
                name="uniq_folklore_review_reviewer_per_round",
            ),
        ),
        migrations.RemoveField(
            model_name="folklorereview",
            name="folklore_entry",
        ),
    ]

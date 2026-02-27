from django.db.models.signals import post_save
from django.dispatch import receiver

from dictionary.models import EntryRevision
from folklore.models import FolkloreRevision
from reviews.models import FolkloreReview, Review
from users.models import ContributionEvent
from users.recognition import recompute_user_gamification


@receiver(post_save, sender=ContributionEvent)
def on_contribution_event_saved(sender, instance, created, **kwargs):
    # Event-driven recalculation: approvals create contribution events.
    if created:
        recompute_user_gamification(instance.user)


@receiver(post_save, sender=Review)
def on_dictionary_review_saved(sender, instance, created, **kwargs):
    # Reviewer progression should update whenever a review decision is recorded.
    if created:
        recompute_user_gamification(instance.reviewer)


@receiver(post_save, sender=FolkloreReview)
def on_folklore_review_saved(sender, instance, created, **kwargs):
    # Keeps reviewer level progression in sync for folklore workflows too.
    if created:
        recompute_user_gamification(instance.reviewer)


@receiver(post_save, sender=EntryRevision)
def on_dictionary_revision_saved(sender, instance, created, **kwargs):
    # Rejection counters come from revision state; recompute when revision updates.
    if instance.contributor_id:
        recompute_user_gamification(instance.contributor)


@receiver(post_save, sender=FolkloreRevision)
def on_folklore_revision_saved(sender, instance, created, **kwargs):
    # Recompute on revision save so rejection counters stay accurate.
    if instance.contributor_id:
        recompute_user_gamification(instance.contributor)

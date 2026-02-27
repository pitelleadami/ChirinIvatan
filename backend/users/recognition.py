"""
users/recognition.py

Deterministic recognition engine.

Responsibilities:
- compute counters from authoritative database state
- map counters to levels/badges using active config rules
- update cached stats tables
- emit recognition events (level-up, badge unlock, municipality wins)
"""

from dataclasses import dataclass
from datetime import datetime, timezone as dt_timezone

from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.utils import timezone

from dictionary.models import EntryRevision
from folklore.models import FolkloreRevision
from reviews.models import FolkloreReview, Review
from users.models import (
    ContributionEvent,
    GamificationConfig,
    GamificationRuntimeState,
    MunicipalityMonthlyWinner,
    MunicipalityStats,
    RecognitionEvent,
    UserContributionStats,
)


User = get_user_model()


# Recognition engine overview:
# 1) Read threshold rules (defaults + optional admin config).
# 2) Compute authoritative counters from approved events/reviews.
# 3) Derive levels/badges deterministically.
# 4) Persist aggregate stats for fast profile/leaderboard APIs.
# 5) Emit recognition events only when something newly unlocks.
@dataclass(frozen=True)
class LevelRule:
    number: int
    title: str
    threshold: int


DEFAULT_CONTRIBUTOR_LEVELS = [
    {"number": 0, "title": "Community Learner", "threshold": 0},
    {"number": 1, "title": "Language Contributor", "threshold": 5},
    {"number": 2, "title": "Cultural Steward", "threshold": 20},
    {"number": 3, "title": "Heritage Guardian", "threshold": 50},
    {"number": 4, "title": "Ivatan Archivist", "threshold": 100},
    {"number": 5, "title": "Heritage Champion", "threshold": 200},
]

DEFAULT_REVIEWER_LEVELS = [
    {"number": 0, "title": "Reviewer", "threshold": 0},
    {"number": 1, "title": "Cultural Validator", "threshold": 10},
    {"number": 2, "title": "Heritage Moderator", "threshold": 50},
    {"number": 3, "title": "Senior Cultural Consultant", "threshold": 100},
]

DEFAULT_DICTIONARY_BADGES = [
    {"key": "word_contributor", "name": "Word Contributor", "threshold": 5},
    {"key": "lexicon_builder", "name": "Lexicon Builder", "threshold": 20},
    {"key": "language_preserver", "name": "Language Preserver", "threshold": 50},
    {"key": "dictionary_steward", "name": "Dictionary Steward", "threshold": 100},
    {"key": "master_lexicon_keeper", "name": "Master Lexicon Keeper", "threshold": 200},
]

DEFAULT_FOLKLORE_BADGES = [
    {"key": "story_contributor", "name": "Story Contributor", "threshold": 1},
    {"key": "folklore_weaver", "name": "Folklore Weaver", "threshold": 3},
    {"key": "tradition_keeper", "name": "Tradition Keeper", "threshold": 5},
    {"key": "cultural_narrator", "name": "Cultural Narrator", "threshold": 10},
    {"key": "oral_historian", "name": "Oral Historian", "threshold": 50},
]

DEFAULT_QUALITY_BADGE = {
    "key": "accuracy_champion",
    "name": "Accuracy Champion",
    "threshold": 20,
    "max_rejections": 0,
}


def _normalize_level_rules(raw_rows, fallback_rows):
    # Protect runtime from malformed JSON config rows.
    rows = raw_rows if isinstance(raw_rows, list) and raw_rows else fallback_rows
    normalized = []
    for item in rows:
        try:
            normalized.append(
                LevelRule(
                    number=int(item["number"]),
                    title=str(item["title"]),
                    threshold=int(item["threshold"]),
                )
            )
        except Exception:
            continue

    if not normalized:
        return _normalize_level_rules(fallback_rows, fallback_rows)

    return sorted(normalized, key=lambda row: row.threshold)


def _normalize_badge_rules(raw_rows, fallback_rows):
    # Badge rows use similar defensive normalization.
    rows = raw_rows if isinstance(raw_rows, list) and raw_rows else fallback_rows
    normalized = []
    for item in rows:
        try:
            normalized.append(
                {
                    "key": str(item["key"]),
                    "name": str(item["name"]),
                    "threshold": int(item["threshold"]),
                }
            )
        except Exception:
            continue

    if not normalized:
        return _normalize_badge_rules(fallback_rows, fallback_rows)
    return normalized


def _normalize_quality_badge(raw_row):
    # Quality badge uses a custom structure (with max_rejections).
    row = raw_row if isinstance(raw_row, dict) and raw_row else DEFAULT_QUALITY_BADGE
    try:
        return {
            "key": str(row.get("key") or DEFAULT_QUALITY_BADGE["key"]),
            "name": str(row.get("name") or DEFAULT_QUALITY_BADGE["name"]),
            "threshold": int(row.get("threshold", DEFAULT_QUALITY_BADGE["threshold"])),
            "max_rejections": int(
                row.get("max_rejections", DEFAULT_QUALITY_BADGE["max_rejections"])
            ),
        }
    except Exception:
        return dict(DEFAULT_QUALITY_BADGE)


def _ruleset():
    # Central place to resolve active rule values.
    # Extension tip:
    # to reuse this for another language project, update defaults/config only.
    config = (
        GamificationConfig.objects.filter(name="default").first()
        or GamificationConfig.objects.first()
    )

    if not config:
        return {
            "contributor_levels": _normalize_level_rules([], DEFAULT_CONTRIBUTOR_LEVELS),
            "reviewer_levels": _normalize_level_rules([], DEFAULT_REVIEWER_LEVELS),
            "dictionary_badges": _normalize_badge_rules([], DEFAULT_DICTIONARY_BADGES),
            "folklore_badges": _normalize_badge_rules([], DEFAULT_FOLKLORE_BADGES),
            "quality_badge": _normalize_quality_badge(DEFAULT_QUALITY_BADGE),
        }

    return {
        "contributor_levels": _normalize_level_rules(
            config.contributor_levels,
            DEFAULT_CONTRIBUTOR_LEVELS,
        ),
        "reviewer_levels": _normalize_level_rules(
            config.reviewer_levels,
            DEFAULT_REVIEWER_LEVELS,
        ),
        "dictionary_badges": _normalize_badge_rules(
            config.dictionary_badges,
            DEFAULT_DICTIONARY_BADGES,
        ),
        "folklore_badges": _normalize_badge_rules(
            config.folklore_badges,
            DEFAULT_FOLKLORE_BADGES,
        ),
        "quality_badge": _normalize_quality_badge(config.quality_badge),
    }


def _current_month_key(now=None):
    now = now or timezone.now()
    return now.strftime("%Y-%m")


def _previous_month_key(month_key):
    year, month = month_key.split("-")
    year = int(year)
    month = int(month)
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


def _compute_level(rules, current_count):
    # Returns current level and next level target for progress UI.
    current = rules[0]
    for rule in rules:
        if current_count >= rule.threshold:
            current = rule

    next_rule = None
    for rule in rules:
        if rule.threshold > current.threshold:
            next_rule = rule
            break

    return current, next_rule


def _badge_rows_from_rules(*, rules, current_value):
    rows = []
    for item in rules:
        rows.append(
            {
                "key": item["key"],
                "name": item["name"],
                "unlocked": current_value >= item["threshold"],
                "current_value": current_value,
                "threshold": item["threshold"],
            }
        )
    return rows


def _calculate_user_counters(user):
    # Authoritative counters are DB-derived, never frontend-derived.
    qs = ContributionEvent.objects.filter(user=user)

    dictionary_original_total = qs.filter(
        contribution_type=ContributionEvent.Type.DICTIONARY_TERM
    ).count()
    folklore_original_total = qs.filter(
        contribution_type=ContributionEvent.Type.FOLKLORE_ENTRY
    ).count()
    revision_total = qs.filter(contribution_type=ContributionEvent.Type.REVISION).count()

    combined_total = dictionary_original_total + folklore_original_total + revision_total

    total_rejections = EntryRevision.objects.filter(
        contributor=user,
        status=EntryRevision.Status.REJECTED,
    ).count() + FolkloreRevision.objects.filter(
        contributor=user,
        status=FolkloreRevision.Status.REJECTED,
    ).count()

    review_completed_total = Review.objects.filter(
        reviewer=user,
        decision__in=[Review.Decision.APPROVE, Review.Decision.REJECT],
    ).count() + FolkloreReview.objects.filter(
        reviewer=user,
        decision__in=[FolkloreReview.Decision.APPROVE, FolkloreReview.Decision.REJECT],
    ).count()

    return {
        "combined_total": combined_total,
        "dictionary_original_total": dictionary_original_total,
        "folklore_original_total": folklore_original_total,
        "total_rejections": total_rejections,
        "review_completed_total": review_completed_total,
    }


def _calculate_monthly_counters(user, month_key):
    # Monthly counters are constrained to events on/after month start.
    start = datetime.strptime(month_key + "-01", "%Y-%m-%d").replace(tzinfo=dt_timezone.utc)

    dictionary_original_month = ContributionEvent.objects.filter(
        user=user,
        contribution_type=ContributionEvent.Type.DICTIONARY_TERM,
        awarded_at__gte=start,
    ).count()
    folklore_original_month = ContributionEvent.objects.filter(
        user=user,
        contribution_type=ContributionEvent.Type.FOLKLORE_ENTRY,
        awarded_at__gte=start,
    ).count()
    revision_month = ContributionEvent.objects.filter(
        user=user,
        contribution_type=ContributionEvent.Type.REVISION,
        awarded_at__gte=start,
    ).count()

    return {
        "dictionary_month": dictionary_original_month,
        "folklore_month": folklore_original_month,
        "combined_month": dictionary_original_month + folklore_original_month + revision_month,
    }


def _calculate_badges(*, rules, dictionary_original_total, folklore_original_total, combined_total, total_rejections):
    dictionary_badges = _badge_rows_from_rules(
        rules=rules["dictionary_badges"],
        current_value=dictionary_original_total,
    )
    folklore_badges = _badge_rows_from_rules(
        rules=rules["folklore_badges"],
        current_value=folklore_original_total,
    )

    quality_rule = rules["quality_badge"]
    quality_unlocked = (
        combined_total >= quality_rule["threshold"]
        and total_rejections <= quality_rule["max_rejections"]
    )
    quality_badges = [
        {
            "key": quality_rule["key"],
            "name": quality_rule["name"],
            "unlocked": quality_unlocked,
            "current_value": combined_total,
            "threshold": quality_rule["threshold"],
            "rejection_count": total_rejections,
        }
    ]

    return dictionary_badges, folklore_badges, quality_badges


def _unlocked_badge_keys(dictionary_badges, folklore_badges, quality_badges):
    all_badges = dictionary_badges + folklore_badges + quality_badges
    return sorted([badge["key"] for badge in all_badges if badge["unlocked"]])


def _process_monthly_winner_rollover(current_month):
    # Lazy month rollover:
    # winner computation runs during recompute so no cron is required.
    state, _ = GamificationRuntimeState.objects.get_or_create(key="global")
    if state.last_winner_processed_month == current_month:
        return

    previous_month = _previous_month_key(current_month)
    metric_map = {
        MunicipalityMonthlyWinner.Metric.DICTIONARY: "dictionary_month",
        MunicipalityMonthlyWinner.Metric.FOLKLORE: "folklore_month",
        MunicipalityMonthlyWinner.Metric.COMBINED: "combined_month",
    }

    for metric, field_name in metric_map.items():
        existing = MunicipalityMonthlyWinner.objects.filter(
            month_key=previous_month,
            metric=metric,
        ).first()
        if existing:
            continue

        winner = (
            MunicipalityStats.objects.filter(last_month_calculated=previous_month)
            .order_by(f"-{field_name}", "municipality")
            .first()
        )
        if not winner:
            continue

        score = getattr(winner, field_name, 0)
        if score <= 0:
            continue

        winner_row = MunicipalityMonthlyWinner.objects.create(
            month_key=previous_month,
            metric=metric,
            municipality=winner.municipality,
            score=score,
        )
        RecognitionEvent.objects.create(
            event_type=RecognitionEvent.EventType.MUNICIPALITY_WIN,
            municipality=winner_row.municipality,
            reference_id=f"{metric}:{previous_month}",
            payload={
                "month": previous_month,
                "metric": metric,
                "municipality": winner_row.municipality,
                "score": winner_row.score,
            },
        )

    state.last_winner_processed_month = current_month
    state.save(update_fields=["last_winner_processed_month", "updated_at"])


def _update_municipality_stats_for_user(user, stats):
    # Municipality aggregates are recomputed from user stat rows, not ad-hoc counters.
    profile = getattr(user, "profile", None)
    municipality = (profile.municipality if profile else "").strip()
    if not municipality:
        return None

    month_key = stats.last_month_calculated or _current_month_key()
    row, _ = MunicipalityStats.objects.get_or_create(municipality=municipality)

    if row.last_month_calculated != month_key:
        row.dictionary_month = 0
        row.folklore_month = 0
        row.combined_month = 0
        row.last_month_calculated = month_key

    aggregate = UserContributionStats.objects.filter(
        user__profile__municipality__iexact=municipality
    ).aggregate(
        dictionary_all_time=models.Sum("dictionary_original_total"),
        folklore_all_time=models.Sum("folklore_original_total"),
        combined_all_time=models.Sum("combined_total"),
        dictionary_month=models.Sum("dictionary_month"),
        folklore_month=models.Sum("folklore_month"),
        combined_month=models.Sum("combined_month"),
    )

    row.dictionary_all_time = aggregate["dictionary_all_time"] or 0
    row.folklore_all_time = aggregate["folklore_all_time"] or 0
    row.combined_all_time = aggregate["combined_all_time"] or 0
    row.dictionary_month = aggregate["dictionary_month"] or 0
    row.folklore_month = aggregate["folklore_month"] or 0
    row.combined_month = aggregate["combined_month"] or 0
    row.save()
    return row


def _emit_recognition_events_if_needed(*, user, previous_stats, contributor_level, reviewer_level, unlocked_badges):
    # Emit only new achievements (idempotent across repeated recomputes).
    previous_contributor_level = previous_stats.contributor_level if previous_stats else 0
    previous_reviewer_level = previous_stats.reviewer_level if previous_stats else 0
    previous_badges = set(previous_stats.unlocked_badges if previous_stats else [])

    if contributor_level.number > previous_contributor_level:
        RecognitionEvent.objects.create(
            user=user,
            event_type=RecognitionEvent.EventType.LEVEL_UP,
            reference_id=f"contributor:{contributor_level.number}",
            payload={"track": "contributor", "title": contributor_level.title},
        )

    if reviewer_level.number > previous_reviewer_level:
        RecognitionEvent.objects.create(
            user=user,
            event_type=RecognitionEvent.EventType.LEVEL_UP,
            reference_id=f"reviewer:{reviewer_level.number}",
            payload={"track": "reviewer", "title": reviewer_level.title},
        )

    for badge_key in unlocked_badges:
        if badge_key not in previous_badges:
            RecognitionEvent.objects.create(
                user=user,
                event_type=RecognitionEvent.EventType.BADGE_UNLOCK,
                reference_id=badge_key,
                payload={"badge_key": badge_key},
            )


@transaction.atomic
def recompute_user_gamification(user):
    """
    Main recalculation entry point for one user.

    Troubleshooting:
    - If totals look wrong, inspect ContributionEvent rows first.
    - If reviewer track is wrong, inspect Review/FolkloreReview rows.
    - If thresholds feel off, inspect GamificationConfig JSON values.
    """
    month_key = _current_month_key()
    _process_monthly_winner_rollover(month_key)

    rules = _ruleset()
    counters = _calculate_user_counters(user)
    monthly = _calculate_monthly_counters(user, month_key)

    previous_stats = UserContributionStats.objects.filter(user=user).first()
    stats, _ = UserContributionStats.objects.get_or_create(user=user)

    stats.combined_total = counters["combined_total"]
    stats.dictionary_original_total = counters["dictionary_original_total"]
    stats.folklore_original_total = counters["folklore_original_total"]
    stats.total_rejections = counters["total_rejections"]
    stats.review_completed_total = counters["review_completed_total"]

    stats.dictionary_month = monthly["dictionary_month"]
    stats.folklore_month = monthly["folklore_month"]
    stats.combined_month = monthly["combined_month"]
    stats.last_month_calculated = month_key

    contributor_level, _ = _compute_level(rules["contributor_levels"], stats.combined_total)
    reviewer_level, _ = _compute_level(rules["reviewer_levels"], stats.review_completed_total)

    dictionary_badges, folklore_badges, quality_badges = _calculate_badges(
        rules=rules,
        dictionary_original_total=stats.dictionary_original_total,
        folklore_original_total=stats.folklore_original_total,
        combined_total=stats.combined_total,
        total_rejections=stats.total_rejections,
    )
    unlocked_badges = _unlocked_badge_keys(dictionary_badges, folklore_badges, quality_badges)

    _emit_recognition_events_if_needed(
        user=user,
        previous_stats=previous_stats,
        contributor_level=contributor_level,
        reviewer_level=reviewer_level,
        unlocked_badges=unlocked_badges,
    )

    stats.contributor_level = contributor_level.number
    stats.reviewer_level = reviewer_level.number
    stats.unlocked_badges = unlocked_badges
    stats.save()

    _update_municipality_stats_for_user(user, stats)
    return stats


def _serialize_level(track, rules, current_value):
    current, next_rule = _compute_level(rules, current_value)
    return {
        "track": track,
        "level": current.number,
        "title": current.title,
        "current_count": current_value,
        "next_threshold": next_rule.threshold if next_rule else None,
        "next_title": next_rule.title if next_rule else None,
    }


def build_gamification_profile_payload(user):
    # Stable API payload for profile screens; keep keys backward compatible.
    rules = _ruleset()
    stats, _ = UserContributionStats.objects.get_or_create(user=user)

    contributor_level = _serialize_level(
        "contributor",
        rules["contributor_levels"],
        stats.combined_total,
    )
    reviewer_level = _serialize_level(
        "reviewer",
        rules["reviewer_levels"],
        stats.review_completed_total,
    )

    dictionary_badges, folklore_badges, quality_badges = _calculate_badges(
        rules=rules,
        dictionary_original_total=stats.dictionary_original_total,
        folklore_original_total=stats.folklore_original_total,
        combined_total=stats.combined_total,
        total_rejections=stats.total_rejections,
    )

    headline = f"You preserved {stats.dictionary_original_total} Ivatan words."
    return {
        "language": {
            "headline": headline,
            "supporting_text": "Recognition is based on approved contributions only.",
        },
        "framing": {
            "headline": headline,
            "supporting_text": "Recognition is based on approved contributions only.",
        },
        "contributor_level": contributor_level,
        "reviewer_level": reviewer_level,
        "dictionary_badges": dictionary_badges,
        "folklore_badges": folklore_badges,
        "quality_badges": quality_badges,
        "counts": {
            "combined_total": stats.combined_total,
            "dictionary_original_total": stats.dictionary_original_total,
            "folklore_original_total": stats.folklore_original_total,
            "total_rejections": stats.total_rejections,
            "review_completed_total": stats.review_completed_total,
        },
    }


def contributor_level_for_user(user):
    """
    Backward-compatible helper used by existing tests/docs.
    """
    payload = build_gamification_profile_payload(user)
    return {
        "approved_entries": payload["counts"]["dictionary_original_total"]
        + payload["counts"]["folklore_original_total"],
        "current_level": {
            "title": payload["contributor_level"]["title"],
            "number": payload["contributor_level"]["level"],
        },
        "next_level": {
            "title": payload["contributor_level"]["next_title"],
            "required_approved_entries": payload["contributor_level"]["next_threshold"],
        }
        if payload["contributor_level"]["next_threshold"] is not None
        else None,
    }


def cultural_stewardship_summary_for_user(user):
    return build_gamification_profile_payload(user)


def leaderboard_rows(*, municipality=None, metric="combined", period="all_time", request=None):
    # Fast leaderboard source:
    # reads from UserContributionStats rather than scanning all raw events.
    metric = metric if metric in {"dictionary", "folklore", "combined"} else "combined"
    period = period if period in {"all_time", "monthly"} else "all_time"

    field_name = {
        ("dictionary", "all_time"): "dictionary_original_total",
        ("folklore", "all_time"): "folklore_original_total",
        ("combined", "all_time"): "combined_total",
        ("dictionary", "monthly"): "dictionary_month",
        ("folklore", "monthly"): "folklore_month",
        ("combined", "monthly"): "combined_month",
    }[(metric, period)]

    rules = _ruleset()
    queryset = User.objects.all().select_related("profile", "contribution_stats")

    if municipality:
        queryset = queryset.filter(profile__municipality__iexact=municipality)

    rows = []
    for user in queryset:
        stats = getattr(user, "contribution_stats", None)
        if not stats:
            continue

        value = getattr(stats, field_name, 0)
        if value <= 0:
            continue

        profile = getattr(user, "profile", None)
        photo_url = ""
        if request and profile and profile.profile_photo:
            photo_url = request.build_absolute_uri(profile.profile_photo.url)

        rows.append(
            {
                "username": user.username,
                "profile_photo": photo_url,
                "municipality": profile.municipality if profile else "",
                "metric": metric,
                "period": period,
                "value": value,
                "dictionary_total": stats.dictionary_original_total,
                "folklore_total": stats.folklore_original_total,
                "combined_total": stats.combined_total,
                "total_contributions": stats.combined_total,
                "current_contributor_title": _compute_level(
                    rules["contributor_levels"],
                    stats.combined_total,
                )[0].title,
                "current_reviewer_title": _compute_level(
                    rules["reviewer_levels"],
                    stats.review_completed_total,
                )[0].title,
            }
        )

    return sorted(rows, key=lambda row: (-row["value"], row["username"]))

"""
users/views.py

User-oriented API endpoints:
- public profile and accountability labels
- role onboarding apply/decide/invite flows
- leaderboard and recognition endpoints

Guideline:
business rules live in services (role_onboarding.py, recognition.py),
while this file handles request parsing and response shaping.
"""

from django.contrib.auth import get_user_model
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods
import json

from dictionary.models import Entry, EntryStatus
from folklore.models import FolkloreEntry
from users.models import (
    ContributionEvent,
    MunicipalityMonthlyWinner,
    MunicipalityStats,
    RecognitionEvent,
    RoleApplication,
)
from users.role_onboarding import (
    can_screen_roles,
    create_role_application,
    decide_role_application,
    format_accountability_label,
    invite_user_to_role,
)
from users.recognition import (
    build_gamification_profile_payload,
    leaderboard_rows,
    recompute_user_gamification,
)
from django.core.exceptions import ValidationError


User = get_user_model()


@require_GET
def global_leaderboard_view(request):
    metric = (request.GET.get("metric") or "combined").strip().lower()
    period = (request.GET.get("period") or "all_time").strip().lower()
    rows = leaderboard_rows(metric=metric, period=period, request=request)
    return JsonResponse(
        {"leaderboard_type": "global", "metric": metric, "period": period, "rows": rows}
    )


@require_GET
def municipality_leaderboard_view(request):
    municipality = (request.GET.get("municipality") or "").strip()
    if not municipality:
        return JsonResponse(
            {"detail": "Query param 'municipality' is required."},
            status=400,
        )

    metric = (request.GET.get("metric") or "combined").strip().lower()
    period = (request.GET.get("period") or "all_time").strip().lower()
    rows = leaderboard_rows(
        municipality=municipality,
        metric=metric,
        period=period,
        request=request,
    )
    return JsonResponse(
        {
            "leaderboard_type": "municipality",
            "municipality": municipality,
            "metric": metric,
            "period": period,
            "rows": rows,
        }
    )


def _serialize_term(entry):
    return {
        "entry_id": str(entry.id),
        "term": entry.term,
        "status": entry.status,
    }


def _serialize_folklore(entry):
    return {
        "entry_id": str(entry.id),
        "title": entry.title,
        "category": entry.category,
        "status": entry.status,
    }


def _require_authenticated(request):
    # Lightweight auth guard used by JSON APIs.
    if request.user.is_authenticated:
        return None
    return JsonResponse({"detail": "Authentication required."}, status=401)


def _parse_json_body(request):
    # Defensive parser so malformed JSON returns 400 instead of 500.
    try:
        return json.loads(request.body or "{}"), None
    except json.JSONDecodeError:
        return None, JsonResponse({"detail": "Invalid JSON body."}, status=400)


@require_GET
def public_user_profile_view(request, username):
    user = User.objects.filter(username=username).first()
    if not user:
        raise Http404("User not found.")

    profile = getattr(user, "profile", None)
    photo_url = ""
    if profile and profile.profile_photo:
        photo_url = request.build_absolute_uri(profile.profile_photo.url)

    # Public profile must hide draft/rejected/review-action internals.
    visible_statuses = [EntryStatus.APPROVED, EntryStatus.APPROVED_UNDER_REVIEW]
    approved_mother_terms = Entry.objects.filter(
        initial_contributor=user,
        is_mother=True,
        status__in=visible_statuses,
    ).order_by("term")
    approved_folklore_entries = FolkloreEntry.objects.filter(
        contributor=user,
        status__in=[FolkloreEntry.Status.APPROVED, FolkloreEntry.Status.APPROVED_UNDER_REVIEW],
    ).order_by("title")

    # Revision list uses unique contribution events per entry lifetime.
    revised_entry_ids = (
        ContributionEvent.objects.filter(
            user=user,
            contribution_type=ContributionEvent.Type.REVISION,
            dictionary_entry__isnull=False,
        )
        .values_list("dictionary_entry_id", flat=True)
        .distinct()
    )
    revised_entries = Entry.objects.filter(
        id__in=revised_entry_ids,
        status__in=visible_statuses,
    ).order_by("term")

    dictionary_terms_count = approved_mother_terms.count()
    folklore_entries_count = approved_folklore_entries.count()
    revisions_count = revised_entries.count()

    # Project formula: total = dictionary_terms + folklore_entries + revisions.
    total_contributions = (
        dictionary_terms_count + folklore_entries_count + revisions_count
    )

    contributor_record = (
        user.role_onboarding_records.filter(role="contributor")
        .order_by("-created_at")
        .first()
    )
    reviewer_record = (
        user.role_onboarding_records.filter(role="reviewer")
        .order_by("-created_at")
        .first()
    )

    return JsonResponse(
        {
            "header": {
                "username": user.username,
                "profile_photo": photo_url,
                "municipality": profile.municipality if profile else "",
                "affiliation": profile.affiliation if profile else "",
                "occupation": profile.occupation if profile else "",
                "bio": profile.bio if profile else "",
                "joined_date": user.date_joined.date().isoformat(),
                "onboarding_accountability": {
                    "contributor": format_accountability_label(contributor_record),
                    "reviewer": format_accountability_label(reviewer_record),
                },
            },
            "contribution_summary": {
                "dictionary_terms": dictionary_terms_count,
                "folklore_entries": folklore_entries_count,
                "revisions": revisions_count,
                "total_contributions": total_contributions,
            },
            "gamification": build_gamification_profile_payload(user),
            "lists": {
                "approved_mother_terms": [
                    _serialize_term(entry) for entry in approved_mother_terms
                ],
                "approved_folklore_entries": [
                    _serialize_folklore(entry) for entry in approved_folklore_entries
                ],
                "entries_revised": [_serialize_term(entry) for entry in revised_entries],
            },
        }
    )


@require_GET
def user_cultural_stewardship_view(request, username):
    user = User.objects.filter(username=username).first()
    if not user:
        raise Http404("User not found.")
    recompute_user_gamification(user)
    return JsonResponse(build_gamification_profile_payload(user))


@require_GET
def user_recognition_events_view(request, username):
    user = User.objects.filter(username=username).first()
    if not user:
        raise Http404("User not found.")

    rows = (
        RecognitionEvent.objects.filter(user=user)
        .order_by("-created_at")
        .values("id", "event_type", "reference_id", "payload", "created_at")
    )
    return JsonResponse(
        {
            "rows": [
                {
                    "event_id": str(row["id"]),
                    "event_type": row["event_type"],
                    "reference_id": row["reference_id"],
                    "payload": row["payload"] or {},
                    "created_at": row["created_at"].isoformat(),
                }
                for row in rows
            ]
        }
    )


@require_GET
def municipality_stats_list_view(request):
    rows = MunicipalityStats.objects.all().order_by("-combined_all_time", "municipality")
    return JsonResponse(
        {
            "rows": [
                {
                    "municipality": row.municipality,
                    "dictionary_all_time": row.dictionary_all_time,
                    "folklore_all_time": row.folklore_all_time,
                    "combined_all_time": row.combined_all_time,
                    "dictionary_month": row.dictionary_month,
                    "folklore_month": row.folklore_month,
                    "combined_month": row.combined_month,
                    "last_month_calculated": row.last_month_calculated,
                }
                for row in rows
            ]
        }
    )


@require_GET
def municipality_monthly_winners_view(request):
    month = (request.GET.get("month") or "").strip()
    rows = MunicipalityMonthlyWinner.objects.all()
    if month:
        rows = rows.filter(month_key=month)
    rows = rows.order_by("-month_key", "metric")

    return JsonResponse(
        {
            "rows": [
                {
                    "month_key": row.month_key,
                    "metric": row.metric,
                    "municipality": row.municipality,
                    "score": row.score,
                }
                for row in rows
            ]
        }
    )


@require_http_methods(["POST"])
def create_role_application_view(request):
    # Applicant self-service endpoint (contributor or reviewer application).
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    target_role = str(payload.get("target_role", "")).strip().lower()
    try:
        application = create_role_application(
            applicant=request.user,
            target_role=target_role,
        )
    except ValidationError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    return JsonResponse(
        {
            "application_id": str(application.id),
            "status": application.status,
            "target_role": application.target_role,
        },
        status=201,
    )


@require_GET
def my_role_applications_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    rows = (
        RoleApplication.objects.filter(applicant=request.user)
        .order_by("-created_at")
        .values("id", "target_role", "status", "created_at", "decided_at")
    )
    return JsonResponse(
        {
            "rows": [
                {
                    "application_id": str(row["id"]),
                    "target_role": row["target_role"],
                    "status": row["status"],
                    "created_at": row["created_at"].isoformat(),
                    "decided_at": (
                        row["decided_at"].isoformat() if row["decided_at"] else None
                    ),
                }
                for row in rows
            ]
        }
    )


@require_http_methods(["POST"])
def decide_role_application_view(request, application_id):
    # Screening endpoint for reviewer/admin actors.
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not can_screen_roles(request.user):
        return JsonResponse({"detail": "Reviewer/admin access required."}, status=403)

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    decision = str(payload.get("decision", "")).strip().lower()
    notes = str(payload.get("notes", "") or "")

    application = RoleApplication.objects.filter(id=application_id).first()
    if not application:
        return JsonResponse({"detail": "Role application not found."}, status=404)

    try:
        decision_row, onboarding_record = decide_role_application(
            application=application,
            decided_by=request.user,
            decision=decision,
            notes=notes,
        )
    except ValidationError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    application.refresh_from_db()
    return JsonResponse(
        {
            "application_id": str(application.id),
            "application_status": application.status,
            "decision_id": str(decision_row.id),
            "onboarding_record_id": (
                str(onboarding_record.id) if onboarding_record else None
            ),
        }
    )


@require_http_methods(["POST"])
def invite_user_role_view(request):
    # Direct invite endpoint for reviewer/admin actors.
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not can_screen_roles(request.user):
        return JsonResponse({"detail": "Reviewer/admin access required."}, status=403)

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    username = str(payload.get("username", "")).strip()
    role = str(payload.get("role", "")).strip().lower()
    notes = str(payload.get("notes", "") or "")

    invitee = User.objects.filter(username=username).first()
    if not invitee:
        return JsonResponse({"detail": "Invitee user not found."}, status=404)

    try:
        record = invite_user_to_role(
            inviter=request.user,
            invitee=invitee,
            role=role,
            notes=notes,
        )
    except ValidationError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    return JsonResponse(
        {
            "onboarding_record_id": str(record.id),
            "user": invitee.username,
            "role": record.role,
            "method": record.method,
            "accountability_label": format_accountability_label(record),
        },
        status=201,
    )

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

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.http import Http404, JsonResponse
from django.db.models import Q
from django.views.decorators.csrf import ensure_csrf_cookie
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
    UserProfile,
)
from users.role_onboarding import (
    can_screen_roles,
    create_role_application,
    decide_role_application,
    format_accountability_label,
    invite_user_to_role,
    is_admin,
)
from users.recognition import (
    build_gamification_profile_payload,
    leaderboard_rows,
    recompute_user_gamification,
)
from django.core.exceptions import ValidationError


User = get_user_model()


def _safe_profile(user):
    try:
        return user.profile
    except UserProfile.DoesNotExist:
        return None


def _serialize_auth_user(user):
    profile = _safe_profile(user)
    groups = list(user.groups.order_by("name").values_list("name", flat=True))
    photo_url = ""
    if profile and profile.profile_photo:
        photo_url = profile.profile_photo.url
    return {
        "username": user.username,
        "is_authenticated": user.is_authenticated,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "groups": groups,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "municipality": profile.municipality if profile else "",
        "profile_photo": photo_url,
    }


def _serialize_private_profile(request, user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    photo_url = ""
    if profile.profile_photo:
        photo_url = request.build_absolute_uri(profile.profile_photo.url)
    return {
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "municipality": profile.municipality,
        "affiliation": profile.affiliation,
        "occupation": profile.occupation,
        "bio": profile.bio,
        "profile_photo": photo_url,
    }


def _serialize_role_application(request, application):
    applicant = application.applicant
    profile = _safe_profile(applicant)
    groups = list(applicant.groups.order_by("name").values_list("name", flat=True))
    decisions = application.decisions.select_related("decided_by").order_by("created_at")
    return {
        "application_id": str(application.id),
        "target_role": application.target_role,
        "status": application.status,
        "created_at": application.created_at.isoformat(),
        "updated_at": application.updated_at.isoformat(),
        "decided_at": application.decided_at.isoformat() if application.decided_at else None,
        "applicant": {
            "username": applicant.username,
            "first_name": applicant.first_name,
            "last_name": applicant.last_name,
            "email": applicant.email,
            "municipality": profile.municipality if profile else "",
            "affiliation": profile.affiliation if profile else "",
            "occupation": profile.occupation if profile else "",
            "groups": groups,
            "profile_photo": (
                request.build_absolute_uri(profile.profile_photo.url)
                if profile and profile.profile_photo
                else ""
            ),
        },
        "decisions": [
            {
                "decision_id": str(row.id),
                "decision": row.decision,
                "notes": row.notes,
                "decided_by": row.decided_by.username,
                "created_at": row.created_at.isoformat(),
            }
            for row in decisions
        ],
    }


def _serialize_admin_user(request, user):
    profile = _safe_profile(user)
    stats = getattr(user, "contribution_stats", None)
    groups = list(user.groups.order_by("name").values_list("name", flat=True))
    profile_photo = ""
    if profile and profile.profile_photo:
        profile_photo = request.build_absolute_uri(profile.profile_photo.url)

    return {
        "user_id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "is_active": user.is_active,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "date_joined": user.date_joined.isoformat(),
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "groups": groups,
        "profile": {
            "municipality": profile.municipality if profile else "",
            "affiliation": profile.affiliation if profile else "",
            "occupation": profile.occupation if profile else "",
            "bio": profile.bio if profile else "",
            "profile_photo": profile_photo,
        },
        "stats": {
            "combined_total": stats.combined_total if stats else 0,
            "dictionary_original_total": stats.dictionary_original_total if stats else 0,
            "folklore_original_total": stats.folklore_original_total if stats else 0,
            "review_completed_total": stats.review_completed_total if stats else 0,
            "total_rejections": stats.total_rejections if stats else 0,
        },
        "pending_applications": user.role_applications.filter(status=RoleApplication.Status.PENDING).count(),
    }


@ensure_csrf_cookie
@require_GET
def auth_csrf_view(request):
    return JsonResponse({"detail": "CSRF cookie set."})


@require_GET
def auth_me_view(request):
    if not request.user.is_authenticated:
        return JsonResponse({"is_authenticated": False})
    return JsonResponse(_serialize_auth_user(request.user))


@require_http_methods(["POST"])
def auth_login_view(request):
    payload, error = _parse_json_body(request)
    if error:
        return error

    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    if not username or not password:
        return JsonResponse({"detail": "Username and password are required."}, status=400)

    user = authenticate(request, username=username, password=password)
    if user is None:
        return JsonResponse({"detail": "Invalid username or password."}, status=400)
    if not user.is_active:
        return JsonResponse({"detail": "This account is inactive."}, status=403)

    login(request, user)
    return JsonResponse(_serialize_auth_user(user))


@require_http_methods(["POST"])
def auth_logout_view(request):
    logout(request)
    return JsonResponse({"is_authenticated": False})


@require_http_methods(["GET", "POST", "PATCH"])
def my_profile_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    user = request.user
    profile, _ = UserProfile.objects.get_or_create(user=user)

    if request.method == "GET":
        return JsonResponse(_serialize_private_profile(request, user))

    if request.content_type and request.content_type.startswith("multipart/form-data"):
        payload = request.POST
        uploaded_photo = request.FILES.get("profile_photo")
    else:
        payload, error = _parse_json_body(request)
        if error:
            return error
        uploaded_photo = None

    for field in ["first_name", "last_name", "email"]:
        if field in payload:
            setattr(user, field, (payload.get(field) or "").strip())

    for field in ["municipality", "affiliation", "occupation", "bio"]:
        if field in payload:
            setattr(profile, field, (payload.get(field) or "").strip())

    if uploaded_photo:
        profile.profile_photo = uploaded_photo

    user.save(update_fields=["first_name", "last_name", "email"])
    profile.save()
    return JsonResponse(_serialize_private_profile(request, user))


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

    profile = _safe_profile(user)
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
                "first_name": user.first_name,
                "last_name": user.last_name,
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


@require_GET
def admin_role_applications_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    status = (request.GET.get("status") or "").strip().lower()
    rows = RoleApplication.objects.select_related("applicant", "applicant__profile").prefetch_related(
        "applicant__groups",
        "decisions__decided_by",
    )
    if status:
        rows = rows.filter(status=status)
    rows = rows.order_by("-created_at")

    return JsonResponse({"rows": [_serialize_role_application(request, row) for row in rows]})


@require_GET
def admin_users_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    query = (request.GET.get("q") or "").strip()
    group = (request.GET.get("group") or "").strip()

    rows = User.objects.select_related("profile", "contribution_stats").prefetch_related("groups")
    if query:
        rows = rows.filter(
            Q(username__icontains=query)
            | Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(email__icontains=query)
            | Q(profile__municipality__icontains=query)
            | Q(profile__affiliation__icontains=query)
        )
    if group == "Admin":
        rows = rows.filter(Q(groups__name="Admin") | Q(is_superuser=True))
    elif group and group != "all":
        rows = rows.filter(groups__name=group)

    rows = rows.order_by("username").distinct()
    return JsonResponse({"rows": [_serialize_admin_user(request, row) for row in rows]})


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

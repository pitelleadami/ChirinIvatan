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

import json
import sys
import urllib.parse
import urllib.request
import uuid

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.core.mail import EmailMultiAlternatives, send_mail
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Max, Q, Sum
from django.http import Http404, JsonResponse
from django.shortcuts import redirect
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

from dictionary.models import Entry, EntryRevision, EntryStatus
from folklore.models import FolkloreEntry, FolkloreRevision
from reviews.models import FolkloreReview, Review, ReviewAdminOverride
from users.leaderboard_filters import leaderboard_participant_q
from users.models import (
    AdminAccountAction,
    ContributionEvent,
    MunicipalityMonthlyWinner,
    Notification,
    RecognitionEvent,
    RoleApplication,
    RoleApplicationDecision,
    RoleInvitation,
    RoleOnboardingRecord,
    SiteContentSettings,
    UserContributionStats,
    UserProfile,
    UserSessionEvent,
)
from users.names import (
    display_name as formatted_display_name,
)
from users.names import (
    normalize_affiliation_text,
    normalize_person_name,
    normalize_username,
)
from users.notifications import notify
from users.recognition import (
    build_gamification_profile_payload,
    leaderboard_rows,
    recompute_user_gamification,
)
from users.role_onboarding import (
    accept_email_role_invitation,
    activate_role_for_approved_application,
    can_screen_roles,
    create_consultant_profile,
    create_email_role_invitation,
    create_role_application,
    decide_role_application,
    format_accountability_label,
    invite_user_to_role,
    is_admin,
    is_reviewer,
    update_managed_consultant_profile,
)

User = get_user_model()
ADMIN_ACTIVITY_LIMIT = 500
ADMIN_OVERVIEW_RECENT_LIMIT = 5
TURNSTILE_TEST_TOKEN = "test-turnstile-token"


def _serialize_notification(notification):
    return {
        "id": str(notification.id),
        "notif_type": notification.notif_type,
        "message": notification.message,
        "target_url": notification.target_url,
        "is_read": notification.is_read,
        "created_at": notification.created_at.isoformat(),
    }


@require_GET
def notifications_list_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    queryset = Notification.objects.filter(user=request.user)
    rows = list(queryset[:40])
    return JsonResponse(
        {
            "unread_count": queryset.filter(is_read=False).count(),
            "notifications": [_serialize_notification(row) for row in rows],
        }
    )


@require_http_methods(["POST"])
def notifications_mark_read_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    payload = {}
    if request.body and request.content_type == "application/json":
        payload, parse_error = _parse_json_body(request)
        if parse_error:
            return parse_error

    queryset = Notification.objects.filter(user=request.user, is_read=False)
    ids = payload.get("ids")
    if ids:
        queryset = queryset.filter(id__in=ids)

    marked = queryset.update(is_read=True)
    return JsonResponse({"marked": marked})


EMAIL_CHANGE_SALT = "chirin-profile-email-change"
EMAIL_CHANGE_MAX_AGE_SECONDS = 3 * 24 * 60 * 60
DEFAULT_SITE_CONTENT = {
    "brand_name": "Chirin Ivatan",
    "brand_logo_url": "",
    "landing_intro_text": (
        '— from "Chirin", meaning language, and "nu Ivatan," referring to the people and culture '
        "of Batanes — is an online dictionary and folklore archive dedicated to preserving the "
        "Ivatan language, stories, and cultural heritage in the digital age."
    ),
    "landing_body_text": (
        "Developed as a community-centered initiative for cultural preservation, it welcomes "
        "Ivatans and all who wish to contribute or learn about the language and heritage to take "
        "part in safeguarding the words, stories, and living traditions that continue to shape "
        "the identity of the Ivatans."
    ),
    "footer_left_text": "© 2026 Chirin Ivatan.",
    "footer_center_text": (
        "Developed for the preservation and continuity of the Ivatan language and heritage."
    ),
    "footer_right_text": "Contact: chirinivatan@gmail.com",
    "about_heading": "About the project",
    "about_intro_paragraphs": [
        (
            "Chirin Ivatan is a community-built digital archive and dictionary "
            "dedicated to safeguarding the Ivatan language and folklore for future generations."
        ),
        (
            "Inspired by the enduring strength of the Ivatan stone house, it serves as a digital "
            "Ivatan House - a home for words, stories, and shared memory. Built in the spirit of "
            "Yaru, or cooperation, the project thrives through collective effort, by and for the "
            "Ivatan people."
        ),
    ],
    "about_body_paragraphs": [
        (
            "At its core, Chirin Ivatan unites three integral elements: a digital "
            "Ivatan-English dictionary with media attachments; a folklore archive for "
            "traditional stories, proverbs, and songs; and a community participation system "
            "that empowers native speakers, educators, and cultural advocates to contribute "
            "and review content. By transforming oral and written traditions into an accessible "
            "digital experience, the platform helps preserve linguistic and cultural heritage, "
            "inspire learning among younger generations, and support academic and community-based research."
        ),
        (
            "The project was initially developed as a graduate initiative by Kristelle Adami, "
            "an Ivatan from Uyugan, Batanes and a graduate student at the University of the "
            "Philippines Open University. Rooted in her advocacy for digital cultural preservation "
            "and her belief in the Ivatan spirit of Yaru, Chirin Ivatan is envisioned to grow as a "
            "collaborative community effort dedicated to safeguarding Ivatan language and folklore."
        ),
    ],
    "about_rationale_paragraphs": [
        (
            "The Ivatan language and folklore embody the identity, values, and worldview of the "
            "Ivatan people. Yet modernization, migration, and the growing dominance of national "
            "and global languages have weakened intergenerational transmission. With the removal "
            "of mother tongue course from the national primary education curriculum and the scarcity "
            "of accessible preservation resources, the need for a sustainable digital platform has "
            "become increasingly urgent."
        ),
        (
            "Chirin Ivatan responds to this challenge by combining information systems strategy "
            "and technology, and community collaboration to document, organize, and share Ivatan "
            "cultural knowledge. Guided by cultural sensitivity and community stewardship, the "
            "project demonstrates how technology can serve as a vessel for preservation, continuity, "
            "and cultural pride."
        ),
    ],
    "about_future_paragraphs": [
        (
            "Chirin Ivatan is envisioned as a living and evolving archive that continues to grow "
            "alongside its community. Future development may include expanded collections, "
            "interactive learning tools, and stronger collaboration with schools, cultural "
            "institutions, researchers, and heritage organizations."
        ),
        (
            "To support long-term sustainability, the project welcomes supporting organizations and collaborative "
            "support for continued innovation, maintenance, and capacity building. Chirin Ivatan also "
            "aims to become a mobile-friendly and multilingual platform that connects Ivatans across "
            "the islands and the global diaspora."
        ),
        (
            "Looking ahead, the project aspires to evolve into an open-source model that other "
            "ethnolinguistic communities may adapt, contributing to a broader movement for digital "
            "heritage preservation across the Philippines and beyond."
        ),
    ],
    "about_final_quote": (
        '"Chirin Ivatan is more than just a project. It is a shared act of remembrance built '
        "in the spirit of Yaru, where every word remembered and every story told helps keep "
        'the Ivatan heritage alive."'
    ),
    "yaru_heading": "The Digital Yaru",
    "yaru_intro_paragraphs": [
        (
            "Chirin Ivatan is built in the spirit of Yaru, the Ivatan embodiment of collective "
            "strength and shared purpose."
        ),
        (
            "The project welcomes contributors, reviewers, consultants, and supporting organizations who can lend "
            "their hands, voices, and knowledge. Whether you are a student, storyteller, educator, "
            "or simply someone who cares to help, you are invited to be part of this digital yaru."
        ),
    ],
    "support_statements": [],
    "partner_details": [],
    "faq_sections": [],
    "privacy_notice_paragraphs": [
        (
            "Chirin Ivatan collects account and contribution details only to manage role access, "
            "review submissions, credit contributors, and protect the integrity of the archive."
        ),
        (
            "Submitted names, contact details, affiliation notes, and contribution history may be "
            "reviewed by authorized stewards for moderation, accountability, and support."
        ),
    ],
    "media_upload_policy_paragraphs": [
        (
            "Upload only media you created, have permission to share, or can clearly cite from a "
            "lawful source. Photos, audio, and video should respect people, places, cultural context, "
            "and community sensitivities."
        ),
        (
            "Media attached to approved entries may become visible on public archive pages. Reviewers "
            "may request source details, remove unsuitable media, or return a submission for clarification."
        ),
    ],
    "contributor_agreement_paragraphs": [
        (
            "By applying for a role or submitting content, contributors agree to share accurate, "
            "respectful information and to provide source details when material is not personally "
            "known, created, or recorded."
        ),
        (
            "Contributors understand that submissions may be reviewed, edited for clarity, returned "
            "for changes, or declined when they do not meet archive standards."
        ),
    ],
    "maintenance_enabled": False,
    "maintenance_message": (
        "Chirin Ivatan is temporarily paused for maintenance. " "Please check back soon."
    ),
}


def _request_ip_address(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def _record_session_event(request, user, event_type):
    if not user or not user.is_authenticated:
        return
    UserSessionEvent.objects.create(
        user=user,
        event_type=event_type,
        ip_address=_request_ip_address(request),
        user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:255],
    )


def _safe_profile(user):
    try:
        return user.profile
    except UserProfile.DoesNotExist:
        return None


def _serialize_auth_user(user, request=None):
    profile = _safe_profile(user)
    groups = list(user.groups.order_by("name").values_list("name", flat=True))
    photo_url = ""
    if profile and profile.profile_photo:
        photo_url = (
            request.build_absolute_uri(profile.profile_photo.url)
            if request
            else profile.profile_photo.url
        )
    profile_complete = bool(
        str(user.first_name or "").strip()
        and str(user.last_name or "").strip()
        and profile
        and str(profile.municipality or "").strip()
    )
    return {
        "username": normalize_username(user.username),
        "is_authenticated": user.is_authenticated,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "groups": groups,
        "first_name": normalize_person_name(user.first_name),
        "last_name": normalize_person_name(user.last_name),
        "name_extension": profile.name_extension if profile else "",
        "post_nominals": profile.post_nominals if profile else "",
        "municipality": profile.municipality if profile else "",
        "profile_photo": photo_url,
        "profile_complete": profile_complete,
        "onboarding_prompt_pending": (profile.onboarding_prompt_pending if profile else False),
        "onboarding_prompt_dismissed": (profile.onboarding_prompt_dismissed if profile else False),
        "include_in_leaderboard": profile.include_in_leaderboard if profile else True,
        "show_on_yaru_chart": profile.show_on_yaru_chart if profile else True,
        "show_live_contributions": profile.show_live_contributions if profile else True,
    }


def _serialize_private_profile(request, user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    photo_url = ""
    if profile.profile_photo:
        photo_url = request.build_absolute_uri(profile.profile_photo.url)
    return {
        "username": normalize_username(user.username),
        "first_name": normalize_person_name(user.first_name),
        "last_name": normalize_person_name(user.last_name),
        "name_extension": profile.name_extension,
        "email": user.email,
        "post_nominals": profile.post_nominals,
        "municipality": profile.municipality,
        "affiliation": normalize_affiliation_text(profile.affiliation),
        "occupation": normalize_affiliation_text(profile.occupation),
        "cultural_affiliations": _profile_cultural_affiliations(profile),
        "other_affiliations": _profile_other_affiliations(profile),
        "bio": profile.bio,
        "include_in_leaderboard": profile.include_in_leaderboard,
        "show_on_yaru_chart": profile.show_on_yaru_chart,
        "show_live_contributions": profile.show_live_contributions,
        "onboarding_prompt_pending": profile.onboarding_prompt_pending,
        "onboarding_prompt_dismissed": profile.onboarding_prompt_dismissed,
        "profile_photo": photo_url,
    }


def _parse_json_value(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return []
    return value


def _sanitize_affiliation_rows(value, first_key, second_key):
    rows = _parse_json_value(value)
    if not isinstance(rows, list):
        return []

    cleaned = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        first_value = normalize_affiliation_text(row.get(first_key, ""))
        second_value = normalize_affiliation_text(row.get(second_key, ""))
        if first_value or second_value:
            cleaned.append({first_key: first_value, second_key: second_value})
    return cleaned


def _normalized_affiliation_rows(rows, first_key, second_key):
    cleaned = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        first_value = normalize_affiliation_text(row.get(first_key, ""))
        second_value = normalize_affiliation_text(row.get(second_key, ""))
        if first_value or second_value:
            cleaned.append({first_key: first_value, second_key: second_value})
    return cleaned


def _profile_cultural_affiliations(profile):
    return _normalized_affiliation_rows(
        profile.cultural_affiliations if profile else [],
        "role",
        "organization",
    )


def _profile_other_affiliations(profile):
    return _normalized_affiliation_rows(
        profile.other_affiliations if profile else [],
        "designation",
        "institution",
    )


def _sanitize_paragraphs(value):
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item or "").strip()]


def _sanitize_support_statements(value):
    if not isinstance(value, list):
        return []
    cleaned = []
    for row in value:
        if not isinstance(row, dict):
            continue
        quote = str(row.get("quote", "")).strip()
        name = str(row.get("name", "")).strip()
        role = str(row.get("role", "")).strip()
        if quote or name or role:
            cleaned.append({"quote": quote, "name": name, "role": role})
    return cleaned


def _sanitize_partner_details(value):
    if not isinstance(value, list):
        return []
    cleaned = []
    for row in value:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name", "")).strip()
        url = str(row.get("url", "")).strip()
        logo_url = str(row.get("logo_url", "")).strip()
        if name or url or logo_url:
            cleaned.append({"name": name, "url": url, "logo_url": logo_url})
    return cleaned


def _sanitize_faq_sections(value):
    if not isinstance(value, list):
        return []

    valid_roles = {"visitor", "contributor", "reviewer", "admin"}
    cleaned = []
    for section in value:
        if not isinstance(section, dict):
            continue
        title = str(section.get("title", "")).strip()
        intro = str(section.get("intro", "")).strip()
        section_id = slugify(str(section.get("id", "")).strip() or title)[:80]
        roles = section.get("roles", [])
        if not isinstance(roles, list):
            roles = []
        roles = [
            str(role).strip().lower() for role in roles if str(role).strip().lower() in valid_roles
        ]
        if not roles:
            roles = ["visitor", "contributor", "reviewer", "admin"]

        items = []
        for item in section.get("items", []):
            if not isinstance(item, dict):
                continue
            question = str(item.get("q", "")).strip()
            answer = str(item.get("a", "")).strip()
            bullets = _sanitize_paragraphs(item.get("bullets", []))
            image_url = str(item.get("image_url", "")).strip()
            image_alt = str(item.get("image_alt", "")).strip()
            if question or answer or bullets or image_url:
                items.append(
                    {
                        "q": question,
                        "a": answer,
                        "bullets": bullets,
                        "image_url": image_url,
                        "image_alt": image_alt,
                    }
                )

        if title or intro or items:
            cleaned.append(
                {
                    "id": section_id or f"faq-section-{len(cleaned) + 1}",
                    "title": title or "FAQ Section",
                    "intro": intro,
                    "roles": roles,
                    "items": items,
                }
            )
    return cleaned


def _site_content_payload(row=None):
    if not row:
        return {
            **DEFAULT_SITE_CONTENT,
            "beta_locked": True,
            "maintenance_enabled": False,
            "is_default": True,
            "updated_at": None,
            "updated_by": "",
        }
    return {
        "brand_name": row.brand_name or DEFAULT_SITE_CONTENT["brand_name"],
        "brand_logo_url": row.brand_logo_url,
        "landing_intro_text": row.landing_intro_text or DEFAULT_SITE_CONTENT["landing_intro_text"],
        "landing_body_text": row.landing_body_text or DEFAULT_SITE_CONTENT["landing_body_text"],
        "footer_left_text": row.footer_left_text or DEFAULT_SITE_CONTENT["footer_left_text"],
        "footer_center_text": row.footer_center_text or DEFAULT_SITE_CONTENT["footer_center_text"],
        "footer_right_text": row.footer_right_text or DEFAULT_SITE_CONTENT["footer_right_text"],
        "about_heading": row.about_heading,
        "about_intro_paragraphs": row.about_intro_paragraphs or [],
        "about_body_paragraphs": row.about_body_paragraphs or [],
        "about_rationale_paragraphs": row.about_rationale_paragraphs or [],
        "about_future_paragraphs": row.about_future_paragraphs or [],
        "about_final_quote": row.about_final_quote,
        "yaru_heading": row.yaru_heading,
        "yaru_intro_paragraphs": row.yaru_intro_paragraphs or [],
        "support_statements": row.support_statements or [],
        "partner_details": row.partner_details or [],
        "faq_sections": row.faq_sections or [],
        "privacy_notice_paragraphs": row.privacy_notice_paragraphs
        or DEFAULT_SITE_CONTENT["privacy_notice_paragraphs"],
        "media_upload_policy_paragraphs": (
            row.media_upload_policy_paragraphs
            or DEFAULT_SITE_CONTENT["media_upload_policy_paragraphs"]
        ),
        "contributor_agreement_paragraphs": (
            row.contributor_agreement_paragraphs
            or DEFAULT_SITE_CONTENT["contributor_agreement_paragraphs"]
        ),
        "beta_locked": bool(row.beta_locked),
        "maintenance_enabled": bool(row.maintenance_enabled),
        "maintenance_message": row.maintenance_message
        or DEFAULT_SITE_CONTENT["maintenance_message"],
        "is_default": False,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "updated_by": row.updated_by.username if row.updated_by else "",
    }


def _profile_affiliation_summary(profile):
    cultural = profile.cultural_affiliations or []
    other = profile.other_affiliations or []
    cultural_orgs = [row.get("organization", "") for row in cultural if row.get("organization")]
    other_institutions = [row.get("institution", "") for row in other if row.get("institution")]
    return ", ".join(cultural_orgs + other_institutions)[:255]


def _profile_occupation_summary(profile):
    cultural = profile.cultural_affiliations or []
    other = profile.other_affiliations or []
    cultural_roles = [row.get("role", "") for row in cultural if row.get("role")]
    other_designations = [row.get("designation", "") for row in other if row.get("designation")]
    return ", ".join(cultural_roles + other_designations)[:255]


def _public_role_label(user):
    if is_admin(user):
        return "Admin"
    if user.groups.filter(name="Consultant").exists():
        return "Consultant"
    if user.groups.filter(name="Reviewer").exists():
        return "Reviewer"
    if user.groups.filter(name="Contributor").exists():
        return "Contributor"
    return "Community Member"


def _display_name_with_post_nominals(user, profile):
    return formatted_display_name(user, profile)


def _profile_public_affiliation(profile):
    if not profile:
        return ""
    return (
        profile.affiliation
        or _profile_affiliation_summary(profile)
        or profile.occupation
        or _profile_occupation_summary(profile)
    )


def _profile_chart_affiliation(profile):
    if not profile:
        return ""
    cultural = profile.cultural_affiliations or []
    for row in cultural:
        role = str(row.get("role", "") or "").strip()
        organization = str(row.get("organization", "") or "").strip()
        if role or organization:
            return ", ".join([value for value in [role, organization] if value])
    other = profile.other_affiliations or []
    for row in other:
        designation = str(row.get("designation", "") or "").strip()
        institution = str(row.get("institution", "") or "").strip()
        if designation or institution:
            return ", ".join([value for value in [designation, institution] if value])
    return ""


def _serialize_role_application(request, application):
    applicant = application.applicant
    profile = _safe_profile(applicant)
    groups = list(applicant.groups.order_by("name").values_list("name", flat=True))
    decisions = list(application.decisions.select_related("decided_by").order_by("created_at"))
    current_user_decision = next(
        (row.decision for row in decisions if row.decided_by_id == request.user.id),
        "",
    )
    screening_status = application.status
    if (
        application.status == RoleApplication.Status.PENDING
        and current_user_decision == RoleApplicationDecision.Decision.APPROVE
    ):
        screening_status = "awaiting_quorum"
    return {
        "application_id": str(application.id),
        "target_role": application.target_role,
        "reviewer_reason": application.reviewer_reason,
        "status": application.status,
        "screening_status": screening_status,
        "current_user_decision": current_user_decision,
        "created_at": application.created_at.isoformat(),
        "updated_at": application.updated_at.isoformat(),
        "decided_at": application.decided_at.isoformat() if application.decided_at else None,
        "applicant": {
            "username": normalize_username(applicant.username),
            "first_name": normalize_person_name(applicant.first_name),
            "last_name": normalize_person_name(applicant.last_name),
            "name_extension": profile.name_extension if profile else "",
            "email": applicant.email,
            "post_nominals": profile.post_nominals if profile else "",
            "municipality": profile.municipality if profile else "",
            "affiliation": normalize_affiliation_text(profile.affiliation) if profile else "",
            "occupation": normalize_affiliation_text(profile.occupation) if profile else "",
            "cultural_affiliations": _profile_cultural_affiliations(profile),
            "other_affiliations": _profile_other_affiliations(profile),
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
                "decider_role": (
                    "admin"
                    if is_admin(row.decided_by)
                    else "reviewer" if is_reviewer(row.decided_by) else "user"
                ),
                "created_at": row.created_at.isoformat(),
            }
            for row in decisions
        ],
    }


def _serialize_public_role_application_status(application):
    approval_count = application.decisions.filter(decision="approve").count()
    if application.status == RoleApplication.Status.APPROVED:
        public_status = (
            "approved_pending_activation"
            if not application.applicant.has_usable_password()
            else "approved_final"
        )
    elif application.status == RoleApplication.Status.REJECTED:
        public_status = "rejected"
    elif approval_count:
        public_status = f"approved_by_{approval_count}"
    else:
        public_status = "pending"

    return {
        "application_id": str(application.id),
        "target_role": application.target_role,
        "reviewer_reason": application.reviewer_reason,
        "status": application.status,
        "public_status": public_status,
        "approval_count": approval_count,
        "can_claim_credentials": (
            application.status == RoleApplication.Status.APPROVED
            and not application.applicant.has_usable_password()
        ),
        "created_at": application.created_at.isoformat(),
        "decided_at": application.decided_at.isoformat() if application.decided_at else None,
    }


def _serialize_admin_user(request, user):
    profile = _safe_profile(user)
    stats = getattr(user, "contribution_stats", None)
    groups = list(user.groups.order_by("name").values_list("name", flat=True))
    profile_photo = ""
    if profile and profile.profile_photo:
        profile_photo = request.build_absolute_uri(profile.profile_photo.url)
    onboarding_records = (
        user.role_onboarding_records.select_related("invited_by")
        .prefetch_related("approved_by_reviewers", "approved_by_admins")
        .order_by("-created_at")
    )
    pending_activation_applications = (
        user.role_applications.filter(status=RoleApplication.Status.APPROVED).order_by(
            "-decided_at", "-created_at"
        )
        if not user.has_usable_password()
        else RoleApplication.objects.none()
    )
    email_actions = (
        AdminAccountAction.objects.filter(
            target_user=user,
            action__in=[
                AdminAccountAction.Action.SEND_PASSWORD_RESET,
                AdminAccountAction.Action.SEND_APPROVAL_REMINDER,
            ],
        )
        .select_related("admin")
        .order_by("-created_at")[:12]
    )

    return {
        "user_id": user.id,
        "username": normalize_username(user.username),
        "first_name": normalize_person_name(user.first_name),
        "last_name": normalize_person_name(user.last_name),
        "name_extension": profile.name_extension if profile else "",
        "email": user.email,
        "is_active": user.is_active,
        "has_usable_password": user.has_usable_password(),
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "date_joined": user.date_joined.isoformat(),
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "groups": groups,
        "profile": {
            "municipality": profile.municipality if profile else "",
            "name_extension": profile.name_extension if profile else "",
            "post_nominals": profile.post_nominals if profile else "",
            "affiliation": normalize_affiliation_text(profile.affiliation) if profile else "",
            "occupation": normalize_affiliation_text(profile.occupation) if profile else "",
            "cultural_affiliations": _profile_cultural_affiliations(profile),
            "other_affiliations": _profile_other_affiliations(profile),
            "bio": profile.bio if profile else "",
            "include_in_leaderboard": profile.include_in_leaderboard if profile else True,
            "show_on_yaru_chart": profile.show_on_yaru_chart if profile else True,
            "show_live_contributions": profile.show_live_contributions if profile else True,
            "profile_photo": profile_photo,
        },
        "stats": {
            "combined_total": stats.combined_total if stats else 0,
            "dictionary_original_total": stats.dictionary_original_total if stats else 0,
            "folklore_original_total": stats.folklore_original_total if stats else 0,
            "review_completed_total": stats.review_completed_total if stats else 0,
            "total_rejections": stats.total_rejections if stats else 0,
        },
        "onboarding_records": [
            {
                "role": record.role,
                "method": record.method,
                "accountability_label": format_accountability_label(record),
                "accountability_notes": record.accountability_notes,
                "invited_by": record.invited_by.username if record.invited_by else "",
                "approved_by_reviewers": [
                    reviewer.username
                    for reviewer in record.approved_by_reviewers.order_by("username")
                ],
                "approved_by_admins": [
                    admin.username for admin in record.approved_by_admins.order_by("username")
                ],
                "created_at": record.created_at.isoformat(),
            }
            for record in onboarding_records
        ],
        "pending_activation_applications": [
            {
                "application_id": str(application.id),
                "target_role": application.target_role,
                "access_url": _role_application_access_url(application),
                "decided_at": (
                    application.decided_at.isoformat() if application.decided_at else None
                ),
            }
            for application in pending_activation_applications
        ],
        "email_log": [
            {
                "action_id": str(action.id),
                "action": action.action,
                "label": action.get_action_display(),
                "sent_by": normalize_username(action.admin.username),
                "recipient_email": user.email,
                "notes": action.notes,
                "created_at": action.created_at.isoformat(),
            }
            for action in email_actions
        ],
        "pending_applications": user.role_applications.filter(
            status=RoleApplication.Status.PENDING
        ).count(),
        "pending_account_flags": _serialize_account_flags(user),
    }


def _activity_target_label(
    *, dictionary_entry=None, folklore_entry=None, entry_revision=None, folklore_revision=None
):
    if dictionary_entry:
        return dictionary_entry.term or str(dictionary_entry.id)
    if folklore_entry:
        return folklore_entry.title or str(folklore_entry.id)
    if entry_revision:
        proposed_data = entry_revision.proposed_data or {}
        return proposed_data.get("term") or str(entry_revision.id)
    if folklore_revision:
        proposed_data = folklore_revision.proposed_data or {}
        return proposed_data.get("title") or str(folklore_revision.id)
    return ""


def _serialize_admin_activity_row(row):
    return {
        "id": row["id"],
        "kind": row["kind"],
        "label": row["label"],
        "detail": row.get("detail", ""),
        "target_type": row.get("target_type", ""),
        "target_id": row.get("target_id", ""),
        "target_label": row.get("target_label", ""),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


def _active_admin_count():
    return (
        User.objects.filter(
            is_active=True,
        )
        .filter(Q(is_superuser=True) | Q(groups__name="Admin"))
        .distinct()
        .count()
    )


def _admin_account_action_payload(row):
    return {
        "action_id": str(row.id),
        "target_username": row.target_user.username,
        "admin": row.admin.username,
        "action": row.action,
        "role": row.role,
        "notes": row.notes,
        "status_before": row.status_before,
        "status_after": row.status_after,
        "flag_status": row.flag_status,
        "resolved_by": row.resolved_by.username if row.resolved_by else "",
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        "resolution_notes": row.resolution_notes,
        "created_at": row.created_at.isoformat(),
    }


def _pending_account_flags_for_user(user):
    return AdminAccountAction.objects.filter(
        target_user=user,
        action=AdminAccountAction.Action.FLAG_SUSPICIOUS,
        flag_status=AdminAccountAction.FlagStatus.PENDING,
    ).select_related("admin", "resolved_by")


def _serialize_account_flags(user):
    return [
        _admin_account_action_payload(row)
        for row in _pending_account_flags_for_user(user).order_by("-created_at")
    ]


def _record_admin_account_action(
    *,
    target_user,
    admin,
    action,
    notes="",
    role="",
    status_before="",
    status_after="",
    flag_status=AdminAccountAction.FlagStatus.NONE,
):
    return AdminAccountAction.objects.create(
        target_user=target_user,
        admin=admin,
        action=action,
        notes=str(notes or "").strip(),
        role=role,
        status_before=status_before,
        status_after=status_after,
        flag_status=flag_status,
    )


def _apply_role_revocation(user, role):
    role = str(role or "").strip().lower()
    group_names_by_role = {
        "contributor": ["Contributor"],
        "reviewer": ["Reviewer"],
        "consultant": ["Consultant"],
        "admin": ["Admin"],
    }
    if role not in group_names_by_role:
        raise ValidationError("Invalid role to revoke.")
    if role == "admin" and user.is_superuser:
        raise ValidationError("Superuser status must be changed in Django admin.")
    if role == "admin" and _active_admin_count() <= 1 and is_admin(user):
        raise ValidationError("Cannot revoke the final active admin.")

    groups = Group.objects.filter(name__in=group_names_by_role[role])
    removed = [group.name for group in groups if user.groups.filter(id=group.id).exists()]
    if not removed:
        raise ValidationError(f"This user does not currently have {role} group access.")
    user.groups.remove(*groups)
    if role == "reviewer":
        contributor_group, _ = Group.objects.get_or_create(name="Contributor")
        user.groups.add(contributor_group)
    if role == "admin" and user.is_staff and not user.is_superuser:
        user.is_staff = False
        user.save(update_fields=["is_staff"])
    return removed


def _revision_media_labels(revision):
    labels = []
    proposed_data = revision.proposed_data or {}
    for key, label in [
        ("photo", "photo"),
        ("photo_url", "photo"),
        ("audio_pronunciation", "audio"),
        ("audio_pronunciation_url", "audio"),
        ("media_url", "media link"),
        ("photo_upload", "photo"),
        ("audio_upload", "audio"),
    ]:
        if proposed_data.get(key) and label not in labels:
            labels.append(label)
    if getattr(revision, "photo_upload", None):
        labels.append("photo")
    if getattr(revision, "audio_upload", None):
        labels.append("audio")
    return list(dict.fromkeys(labels))


def _serialize_admin_submission_row(revision, contribution_type):
    proposed_data = revision.proposed_data or {}
    title = (
        proposed_data.get("term")
        if contribution_type == "dictionary"
        else proposed_data.get("title")
    )
    contributor = getattr(revision, "contributor", None)
    return {
        "id": str(revision.id),
        "revision_id": str(revision.id),
        "entry_id": str(revision.entry_id) if revision.entry_id else "",
        "type": contribution_type,
        "title": title or str(revision.id),
        "term": proposed_data.get("term", ""),
        "proposed_data": proposed_data,
        "status": revision.status,
        "contributor": contributor.username if contributor else "",
        "created_at": revision.created_at.isoformat() if revision.created_at else None,
        "media": _revision_media_labels(revision),
    }


def _serialize_admin_override_row(row):
    target = row.dictionary_entry if row.target_type == "dictionary" else row.folklore_entry
    target_label = ""
    if target:
        target_label = getattr(target, "term", "") or getattr(target, "title", "") or str(target.id)
    return {
        "id": str(row.id),
        "target_type": row.target_type,
        "target_label": target_label,
        "action": row.action,
        "admin": row.admin.username if row.admin else "",
        "status_before": row.status_before,
        "status_after": row.status_after,
        "notes": row.notes,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _admin_overview_payload(request):
    site_content = (
        SiteContentSettings.objects.filter(key="default").select_related("updated_by").first()
    )
    dictionary_pending = EntryRevision.objects.filter(status=EntryRevision.Status.PENDING).count()
    folklore_pending = FolkloreRevision.objects.filter(
        status=FolkloreRevision.Status.PENDING
    ).count()
    dictionary_re_review = Entry.objects.filter(status=EntryStatus.APPROVED_UNDER_REVIEW).count()
    folklore_re_review = FolkloreEntry.objects.filter(
        status=FolkloreEntry.Status.APPROVED_UNDER_REVIEW
    ).count()

    latest_dictionary = [
        _serialize_admin_submission_row(row, "dictionary")
        for row in EntryRevision.objects.select_related("contributor").order_by("-created_at")[
            :ADMIN_OVERVIEW_RECENT_LIMIT
        ]
    ]
    latest_folklore = [
        _serialize_admin_submission_row(row, "folklore")
        for row in FolkloreRevision.objects.select_related("contributor").order_by("-created_at")[
            :ADMIN_OVERVIEW_RECENT_LIMIT
        ]
    ]
    latest_submissions = sorted(
        latest_dictionary + latest_folklore,
        key=lambda row: row.get("created_at") or "",
        reverse=True,
    )[:ADMIN_OVERVIEW_RECENT_LIMIT]
    latest_media_uploads = [row for row in latest_submissions if row.get("media")][:4]

    recent_overrides = [
        _serialize_admin_override_row(row)
        for row in ReviewAdminOverride.objects.select_related(
            "admin",
            "dictionary_entry",
            "folklore_entry",
        ).order_by("-created_at")[:ADMIN_OVERVIEW_RECENT_LIMIT]
    ]

    return {
        "counts": {
            "users": User.objects.filter(is_active=True).count(),
            "contributors": User.objects.filter(is_active=True, groups__name="Contributor")
            .distinct()
            .count(),
            "reviewers": User.objects.filter(is_active=True, groups__name="Reviewer")
            .distinct()
            .count(),
            "approved_entries": (
                Entry.objects.filter(status=EntryStatus.APPROVED).count()
                + FolkloreEntry.objects.filter(status=FolkloreEntry.Status.APPROVED).count()
            ),
            "pending_entries": dictionary_pending + folklore_pending,
        },
        "queues": {
            "pending_role_applications": RoleApplication.objects.filter(
                status=RoleApplication.Status.PENDING
            ).count(),
            "pending_dictionary_reviews": dictionary_pending,
            "pending_folklore_reviews": folklore_pending,
            "entries_under_re_review": dictionary_re_review + folklore_re_review,
            "dictionary_under_re_review": dictionary_re_review,
            "folklore_under_re_review": folklore_re_review,
            "pending_account_flags": AdminAccountAction.objects.filter(
                action=AdminAccountAction.Action.FLAG_SUSPICIOUS,
                flag_status=AdminAccountAction.FlagStatus.PENDING,
            ).count(),
        },
        "maintenance": {
            "enabled": bool(site_content.maintenance_enabled) if site_content else False,
            "beta_locked": bool(site_content.beta_locked) if site_content else True,
            "message": (
                site_content.maintenance_message
                if site_content and site_content.maintenance_message
                else DEFAULT_SITE_CONTENT["maintenance_message"]
            ),
            "updated_at": (
                site_content.updated_at.isoformat()
                if site_content and site_content.updated_at
                else None
            ),
            "updated_by": (
                site_content.updated_by.username if site_content and site_content.updated_by else ""
            ),
        },
        "latest_submissions": latest_submissions,
        "latest_media_uploads": latest_media_uploads,
        "recent_admin_overrides": recent_overrides,
    }


def _admin_user_activity_rows(user):
    rows = []

    for event in UserSessionEvent.objects.filter(user=user).order_by("-created_at")[
        :ADMIN_ACTIVITY_LIMIT
    ]:
        rows.append(
            {
                "id": f"session-{event.id}",
                "kind": "session",
                "label": event.get_event_type_display(),
                "detail": "Account session",
                "target_type": "user_session",
                "target_id": str(event.id),
                "target_label": "",
                "created_at": event.created_at,
            }
        )

    for event in (
        ContributionEvent.objects.filter(user=user)
        .select_related("dictionary_entry", "folklore_entry", "entry_revision", "folklore_revision")
        .order_by("-awarded_at")[:ADMIN_ACTIVITY_LIMIT]
    ):
        target_type = (
            "dictionary" if event.dictionary_entry_id or event.entry_revision_id else "folklore"
        )
        target_id = (
            str(event.dictionary_entry_id)
            if event.dictionary_entry_id
            else (
                str(event.folklore_entry_id)
                if event.folklore_entry_id
                else (
                    str(event.entry_revision_id)
                    if event.entry_revision_id
                    else str(event.folklore_revision_id) if event.folklore_revision_id else ""
                )
            )
        )
        rows.append(
            {
                "id": f"contribution-{event.id}",
                "kind": "contribution",
                "label": event.get_contribution_type_display(),
                "detail": "Contribution credit awarded",
                "target_type": target_type,
                "target_id": target_id,
                "target_label": _activity_target_label(
                    dictionary_entry=event.dictionary_entry,
                    folklore_entry=event.folklore_entry,
                    entry_revision=event.entry_revision,
                    folklore_revision=event.folklore_revision,
                ),
                "created_at": event.awarded_at,
            }
        )

    for revision in (
        EntryRevision.objects.filter(contributor=user)
        .select_related("entry")
        .order_by("-created_at")[:ADMIN_ACTIVITY_LIMIT]
    ):
        rows.append(
            {
                "id": f"dictionary-revision-{revision.id}",
                "kind": "dictionary_revision",
                "label": "Dictionary revision",
                "detail": f"Status: {revision.status}",
                "target_type": "dictionary",
                "target_id": str(revision.entry_id or revision.id),
                "target_label": _activity_target_label(entry_revision=revision),
                "created_at": revision.created_at,
            }
        )

    for revision in (
        FolkloreRevision.objects.filter(contributor=user)
        .select_related("entry")
        .order_by("-created_at")[:ADMIN_ACTIVITY_LIMIT]
    ):
        rows.append(
            {
                "id": f"folklore-revision-{revision.id}",
                "kind": "folklore_revision",
                "label": "Folklore revision",
                "detail": f"Status: {revision.status}",
                "target_type": "folklore",
                "target_id": str(revision.entry_id or revision.id),
                "target_label": _activity_target_label(folklore_revision=revision),
                "created_at": revision.created_at,
            }
        )

    for review in (
        Review.objects.filter(reviewer=user)
        .select_related("revision", "revision__entry")
        .order_by("-created_at")[:ADMIN_ACTIVITY_LIMIT]
    ):
        rows.append(
            {
                "id": f"dictionary-review-{review.id}",
                "kind": "dictionary_review",
                "label": f"Dictionary review: {review.decision}",
                "detail": f"Round {review.review_round}",
                "target_type": "dictionary",
                "target_id": str(review.revision_id) if review.revision_id else "",
                "target_label": _activity_target_label(entry_revision=review.revision),
                "created_at": review.created_at,
            }
        )

    for review in (
        FolkloreReview.objects.filter(reviewer=user)
        .select_related("folklore_revision", "folklore_revision__entry")
        .order_by("-created_at")[:ADMIN_ACTIVITY_LIMIT]
    ):
        rows.append(
            {
                "id": f"folklore-review-{review.id}",
                "kind": "folklore_review",
                "label": f"Folklore review: {review.decision}",
                "detail": f"Round {review.review_round}",
                "target_type": "folklore",
                "target_id": str(review.folklore_revision_id),
                "target_label": _activity_target_label(folklore_revision=review.folklore_revision),
                "created_at": review.created_at,
            }
        )

    for decision in (
        RoleApplicationDecision.objects.filter(decided_by=user)
        .select_related("application", "application__applicant")
        .order_by("-created_at")[:ADMIN_ACTIVITY_LIMIT]
    ):
        rows.append(
            {
                "id": f"role-decision-{decision.id}",
                "kind": "role_decision",
                "label": f"Role application {decision.decision}",
                "detail": f"{decision.application.applicant.username} applying as {decision.application.target_role}",
                "target_type": "role_application",
                "target_id": str(decision.application_id),
                "target_label": decision.application.applicant.username,
                "created_at": decision.created_at,
            }
        )

    for invitation in (
        RoleInvitation.objects.filter(invited_by=user)
        .select_related("accepted_by")
        .order_by("-created_at")[:ADMIN_ACTIVITY_LIMIT]
    ):
        rows.append(
            {
                "id": f"role-invitation-{invitation.id}",
                "kind": "role_invitation",
                "label": f"Sent {invitation.role} invitation",
                "detail": f"{invitation.email} · {invitation.status}",
                "target_type": "role_invitation",
                "target_id": str(invitation.id),
                "target_label": invitation.email,
                "created_at": invitation.created_at,
            }
        )

    for action in (
        AdminAccountAction.objects.filter(Q(admin=user) | Q(target_user=user))
        .select_related("admin", "target_user")
        .order_by("-created_at")[:ADMIN_ACTIVITY_LIMIT]
    ):
        actor_prefix = "Admin action" if action.admin_id == user.id else "Account action"
        detail_parts = []
        if action.role:
            detail_parts.append(action.role)
        if action.flag_status != AdminAccountAction.FlagStatus.NONE:
            detail_parts.append(action.flag_status)
        if action.status_before or action.status_after:
            detail_parts.append(f"{action.status_before} -> {action.status_after}")
        rows.append(
            {
                "id": f"admin-account-action-{action.id}",
                "kind": "admin_account_action",
                "label": f"{actor_prefix}: {action.get_action_display()}",
                "detail": " · ".join(detail_parts),
                "target_type": "user",
                "target_id": str(action.target_user_id),
                "target_label": action.target_user.username,
                "created_at": action.created_at,
            }
        )

    rows.sort(key=lambda item: item["created_at"], reverse=True)
    return rows[:ADMIN_ACTIVITY_LIMIT]


@ensure_csrf_cookie
@require_GET
def auth_csrf_view(request):
    return JsonResponse({"detail": "CSRF cookie set."})


@require_GET
def auth_me_view(request):
    if not request.user.is_authenticated:
        return JsonResponse({"is_authenticated": False})
    return JsonResponse(_serialize_auth_user(request.user, request=request))


@require_GET
def admin_overview_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)
    return JsonResponse(_admin_overview_payload(request))


@require_http_methods(["POST"])
def auth_login_view(request):
    payload, error = _parse_json_body(request)
    if error:
        return error

    username = normalize_username(payload.get("username"))
    password = payload.get("password") or ""
    if not username or not password:
        return JsonResponse({"detail": "Username and password are required."}, status=400)

    stored_user = User.objects.filter(username__iexact=username).first()
    auth_username = stored_user.username if stored_user else username
    user = authenticate(request, username=auth_username, password=password)
    if user is None:
        return JsonResponse(
            {
                "detail": (
                    "Invalid username or password. Usernames are lowercase handles; "
                    "if your username used capital letters before, try it in lowercase."
                )
            },
            status=400,
        )
    if not user.is_active:
        return JsonResponse({"detail": "This account is inactive."}, status=403)

    login(request, user)
    _record_session_event(request, user, UserSessionEvent.Type.LOGIN)
    return JsonResponse(_serialize_auth_user(user, request=request))


@require_http_methods(["POST"])
def dismiss_profile_onboarding_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    profile.onboarding_prompt_pending = False
    profile.onboarding_prompt_dismissed = True
    profile.save(update_fields=["onboarding_prompt_pending", "onboarding_prompt_dismissed"])
    return JsonResponse({"dismissed": True})


@require_http_methods(["POST"])
def auth_password_reset_request_view(request):
    payload, error = _parse_json_body(request)
    if error:
        return error

    email = str(payload.get("email", "") or "").strip()
    if not email:
        return JsonResponse({"detail": "Email address is required."}, status=400)

    form = PasswordResetForm({"email": email})
    if not form.is_valid():
        return JsonResponse({"detail": "Enter a valid email address."}, status=400)

    matching_user = User.objects.filter(email__iexact=email, is_active=True).first()
    if not matching_user:
        return JsonResponse({"detail": "No active account uses that email address."}, status=404)

    try:
        _validate_captcha_payload(payload)
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)

    try:
        form.save(
            request=request,
            use_https=request.is_secure(),
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            email_template_name="registration/password_reset_email.html",
            subject_template_name="registration/password_reset_subject.txt",
        )
    except Exception as exc:
        return JsonResponse(
            {"detail": ("Password reset email could not be sent. " f"{type(exc).__name__}: {exc}")},
            status=500,
        )

    return JsonResponse({"detail": "A password reset link has been sent to that email address."})


@require_http_methods(["POST"])
def auth_logout_view(request):
    user = request.user if request.user.is_authenticated else None
    if user:
        _record_session_event(request, user, UserSessionEvent.Type.LOGOUT)
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

    pending_email = ""
    try:
        if "username" in payload:
            username = _clean_username(payload.get("username"))
            username_taken = (
                User.objects.filter(username__iexact=username).exclude(id=user.id).exists()
            )
            if username_taken:
                raise ValidationError("That username is already taken.")
            user.username = username

        for field in ["first_name", "last_name"]:
            if field in payload:
                setattr(user, field, normalize_person_name(payload.get(field)))

        if "email" in payload:
            email = _clean_email(payload.get("email"), required=False)
            if email and email != (user.email or "").strip().lower():
                existing_email = (
                    User.objects.filter(email__iexact=email).exclude(id=user.id).exists()
                )
                if existing_email:
                    raise ValidationError("That email address is already used by another account.")
                _send_email_change_verification(request, user, email)
                pending_email = email
            elif not email:
                raise ValidationError("Email address is required.")
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)
    except Exception as exc:
        return JsonResponse(
            {"detail": ("Email verification could not be sent. " f"{type(exc).__name__}: {exc}")},
            status=500,
        )

    for field in ["name_extension", "post_nominals", "municipality", "bio"]:
        if field in payload:
            setattr(profile, field, (payload.get(field) or "").strip())
    for field in ["affiliation", "occupation"]:
        if field in payload:
            setattr(profile, field, normalize_affiliation_text(payload.get(field)))

    received_structured_affiliations = False
    if "cultural_affiliations" in payload:
        received_structured_affiliations = True
        profile.cultural_affiliations = _sanitize_affiliation_rows(
            payload.get("cultural_affiliations"),
            "role",
            "organization",
        )
    if "other_affiliations" in payload:
        received_structured_affiliations = True
        profile.other_affiliations = _sanitize_affiliation_rows(
            payload.get("other_affiliations"),
            "designation",
            "institution",
        )
    if received_structured_affiliations:
        profile.affiliation = _profile_affiliation_summary(profile)
        profile.occupation = _profile_occupation_summary(profile)
    if not profile.affiliation:
        profile.affiliation = _profile_affiliation_summary(profile)
    if not profile.occupation:
        profile.occupation = _profile_occupation_summary(profile)

    if uploaded_photo:
        profile.profile_photo = uploaded_photo

    profile.onboarding_prompt_pending = False
    profile.onboarding_prompt_dismissed = True
    user.save(update_fields=["username", "first_name", "last_name"])
    profile.save()
    recompute_user_gamification(user)
    response_payload = _serialize_private_profile(request, user)
    if pending_email:
        response_payload["pending_email"] = pending_email
        response_payload["email_change_pending"] = True
        response_payload["detail"] = (
            "Profile saved. Check your new email address to verify the change."
        )
    return JsonResponse(response_payload)


@require_GET
def verify_profile_email_view(request, token):
    try:
        payload = signing.loads(
            token,
            salt=EMAIL_CHANGE_SALT,
            max_age=EMAIL_CHANGE_MAX_AGE_SECONDS,
        )
        user = User.objects.get(pk=payload.get("user_id"), is_active=True)
        current_email = str(payload.get("current_email") or "").strip().lower()
        new_email = _clean_email(payload.get("new_email"), required=True)
        if current_email and (user.email or "").strip().lower() != current_email:
            raise ValidationError("This email verification link is no longer valid.")
        if User.objects.filter(email__iexact=new_email).exclude(id=user.id).exists():
            raise ValidationError("That email address is already used by another account.")
        user.email = new_email
        user.save(update_fields=["email"])
        return redirect(f"{settings.FRONTEND_BASE_URL}/profile-edit?email_verified=1")
    except signing.SignatureExpired:
        return redirect(f"{settings.FRONTEND_BASE_URL}/profile-edit?email_verified=expired")
    except Exception:
        return redirect(f"{settings.FRONTEND_BASE_URL}/profile-edit?email_verified=invalid")


@require_http_methods(["POST", "PATCH"])
def user_leaderboard_visibility_view(request, username):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    target_user = User.objects.filter(username=username).first()
    if not target_user:
        return JsonResponse({"detail": "User not found."}, status=404)
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    payload, error = _parse_json_body(request)
    if error:
        return error
    if "include_in_leaderboard" not in payload:
        return JsonResponse({"detail": "include_in_leaderboard is required."}, status=400)

    profile, _ = UserProfile.objects.get_or_create(user=target_user)
    profile.include_in_leaderboard = _payload_bool(payload.get("include_in_leaderboard"))
    profile.save(update_fields=["include_in_leaderboard"])
    recompute_user_gamification(target_user)

    return JsonResponse(
        {
            "username": target_user.username,
            "include_in_leaderboard": profile.include_in_leaderboard,
        }
    )


@require_http_methods(["POST", "PATCH"])
def user_public_visibility_view(request, username):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    target_user = User.objects.filter(username=username).first()
    if not target_user:
        return JsonResponse({"detail": "User not found."}, status=404)

    payload, error = _parse_json_body(request)
    if error:
        return error

    allowed_fields = ["show_on_yaru_chart", "show_live_contributions"]
    update_fields = []
    profile, _ = UserProfile.objects.get_or_create(user=target_user)
    for field in allowed_fields:
        if field in payload:
            setattr(profile, field, _payload_bool(payload.get(field)))
            update_fields.append(field)

    if not update_fields:
        return JsonResponse(
            {"detail": "show_on_yaru_chart or show_live_contributions is required."},
            status=400,
        )

    profile.save(update_fields=update_fields)
    return JsonResponse(
        {
            "username": target_user.username,
            "show_on_yaru_chart": profile.show_on_yaru_chart,
            "show_live_contributions": profile.show_live_contributions,
        }
    )


@require_http_methods(["GET", "POST", "PATCH"])
def site_content_view(request):
    row = SiteContentSettings.objects.filter(key="default").select_related("updated_by").first()

    if request.method == "GET":
        return JsonResponse(_site_content_payload(row))

    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    payload, error = _parse_json_body(request)
    if error:
        return error

    row, _ = SiteContentSettings.objects.get_or_create(key="default")
    row.brand_name = (
        str(payload.get("brand_name", "")).strip() or DEFAULT_SITE_CONTENT["brand_name"]
    )
    row.brand_logo_url = str(payload.get("brand_logo_url", "")).strip()
    row.landing_intro_text = (
        str(payload.get("landing_intro_text", "")).strip()
        or DEFAULT_SITE_CONTENT["landing_intro_text"]
    )
    row.landing_body_text = (
        str(payload.get("landing_body_text", "")).strip()
        or DEFAULT_SITE_CONTENT["landing_body_text"]
    )
    row.footer_left_text = (
        str(payload.get("footer_left_text", "")).strip() or DEFAULT_SITE_CONTENT["footer_left_text"]
    )
    row.footer_center_text = (
        str(payload.get("footer_center_text", "")).strip()
        or DEFAULT_SITE_CONTENT["footer_center_text"]
    )
    row.footer_right_text = (
        str(payload.get("footer_right_text", "")).strip()
        or DEFAULT_SITE_CONTENT["footer_right_text"]
    )
    row.about_heading = str(payload.get("about_heading", "")).strip()
    row.about_intro_paragraphs = _sanitize_paragraphs(payload.get("about_intro_paragraphs", []))
    row.about_body_paragraphs = _sanitize_paragraphs(payload.get("about_body_paragraphs", []))
    row.about_rationale_paragraphs = _sanitize_paragraphs(
        payload.get("about_rationale_paragraphs", [])
    )
    row.about_future_paragraphs = _sanitize_paragraphs(payload.get("about_future_paragraphs", []))
    row.about_final_quote = str(payload.get("about_final_quote", "")).strip()
    row.yaru_heading = str(payload.get("yaru_heading", "")).strip()
    row.yaru_intro_paragraphs = _sanitize_paragraphs(payload.get("yaru_intro_paragraphs", []))
    row.support_statements = _sanitize_support_statements(payload.get("support_statements", []))
    row.partner_details = _sanitize_partner_details(payload.get("partner_details", []))
    row.faq_sections = _sanitize_faq_sections(payload.get("faq_sections", []))
    row.privacy_notice_paragraphs = _sanitize_paragraphs(
        payload.get("privacy_notice_paragraphs", [])
    )
    row.media_upload_policy_paragraphs = _sanitize_paragraphs(
        payload.get("media_upload_policy_paragraphs", [])
    )
    row.contributor_agreement_paragraphs = _sanitize_paragraphs(
        payload.get("contributor_agreement_paragraphs", [])
    )
    row.maintenance_enabled = _payload_bool(payload.get("maintenance_enabled"))
    row.maintenance_message = (
        str(payload.get("maintenance_message", "")).strip()
        or DEFAULT_SITE_CONTENT["maintenance_message"]
    )
    row.updated_by = request.user
    row.save()

    return JsonResponse(_site_content_payload(row))


@require_http_methods(["POST"])
def site_content_faq_media_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    uploaded = request.FILES.get("image")
    if not uploaded:
        return JsonResponse({"detail": "Image file is required."}, status=400)
    if not (uploaded.content_type or "").startswith("image/"):
        return JsonResponse({"detail": "Please upload an image file."}, status=400)

    extension = uploaded.name.rsplit(".", 1)[-1].lower() if "." in uploaded.name else "jpg"
    if extension not in {"jpg", "jpeg", "png", "webp", "gif"}:
        extension = "jpg"
    stored_path = default_storage.save(f"site/faq/{uuid.uuid4()}.{extension}", uploaded)
    return JsonResponse(
        {
            "url": request.build_absolute_uri(default_storage.url(stored_path)),
            "path": stored_path,
        },
        status=201,
    )


@require_http_methods(["POST"])
def site_content_partner_media_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    uploaded = request.FILES.get("image")
    if not uploaded:
        return JsonResponse({"detail": "Logo image is required."}, status=400)
    if not (uploaded.content_type or "").startswith("image/"):
        return JsonResponse({"detail": "Please upload an image file."}, status=400)

    extension = uploaded.name.rsplit(".", 1)[-1].lower() if "." in uploaded.name else "png"
    if extension not in {"jpg", "jpeg", "png", "webp", "gif"}:
        extension = "png"
    stored_path = default_storage.save(f"site/partners/{uuid.uuid4()}.{extension}", uploaded)
    return JsonResponse(
        {
            "url": request.build_absolute_uri(default_storage.url(stored_path)),
            "path": stored_path,
        },
        status=201,
    )


@require_http_methods(["POST"])
def site_content_brand_media_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    uploaded = request.FILES.get("image")
    if not uploaded:
        return JsonResponse({"detail": "Brand logo image is required."}, status=400)
    if not (uploaded.content_type or "").startswith("image/"):
        return JsonResponse({"detail": "Please upload an image file."}, status=400)

    extension = uploaded.name.rsplit(".", 1)[-1].lower() if "." in uploaded.name else "png"
    if extension not in {"jpg", "jpeg", "png", "webp", "gif"}:
        extension = "png"
    stored_path = default_storage.save(f"site/brand/{uuid.uuid4()}.{extension}", uploaded)
    return JsonResponse(
        {
            "url": request.build_absolute_uri(default_storage.url(stored_path)),
            "path": stored_path,
        },
        status=201,
    )


# ─── Beta gate ────────────────────────────────────────────────────────────────

_BETA_COOKIE = "chirin_beta"
_BETA_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days
_BETA_SALT = "chirin-beta-gate"


def _make_beta_token():
    return signing.dumps("ok", salt=_BETA_SALT)


def _valid_beta_token(token):
    try:
        signing.loads(token, salt=_BETA_SALT, max_age=_BETA_COOKIE_MAX_AGE)
        return True
    except Exception:
        return False


_CRAWLER_UA_FRAGMENTS = (
    "applebot",
    "facebookexternalhit",
    "facebot",
    "twitterbot",
    "linkedinbot",
    "whatsapp",
    "slackbot-linkexpanding",
    "telegrambot",
    "discordbot",
    "iframely",
)


@require_http_methods(["GET"])
def beta_check_view(request):
    """Called by Nginx auth_request — returns 200 (allow) or 401 (gate)."""
    ua = request.META.get("HTTP_USER_AGENT", "").lower()
    if any(f in ua for f in _CRAWLER_UA_FRAGMENTS):
        return JsonResponse({}, status=200)
    row = SiteContentSettings.objects.filter(key="default").first()
    if row and not row.beta_locked:
        return JsonResponse({}, status=200)
    token = request.COOKIES.get(_BETA_COOKIE, "")
    if _valid_beta_token(token):
        return JsonResponse({}, status=200)
    return JsonResponse({}, status=401)


@csrf_exempt
@require_http_methods(["POST"])
def beta_login_view(request):
    """Validates beta password and sets a signed cookie."""
    beta_password = getattr(settings, "BETA_PASSWORD", "")
    if not beta_password:
        # No password configured — open access
        response = JsonResponse({"ok": True})
        response.set_cookie(
            _BETA_COOKIE,
            _make_beta_token(),
            max_age=_BETA_COOKIE_MAX_AGE,
            secure=True,
            httponly=True,
            samesite="Lax",
        )
        return response
    try:
        payload = json.loads(request.body)
    except Exception:
        return JsonResponse({"error": "Invalid request."}, status=400)
    password = str(payload.get("password", "")).strip()
    if not password or password != beta_password:
        return JsonResponse({"error": "Wrong password."}, status=401)
    response = JsonResponse({"ok": True})
    response.set_cookie(
        _BETA_COOKIE,
        _make_beta_token(),
        max_age=_BETA_COOKIE_MAX_AGE,
        secure=True,
        httponly=True,
        samesite="Lax",
    )
    return response


@csrf_exempt
@require_http_methods(["POST"])
def beta_logout_view(request):
    """Clears the beta cookie (used when the admin removes the gate)."""
    response = JsonResponse({"ok": True})
    response.delete_cookie(_BETA_COOKIE)
    return response


# ─── Admin: site mode (open / beta / maintenance) ─────────────────────────────


@require_http_methods(["POST"])
def admin_maintenance_toggle_view(request):
    """Set site mode: open | beta | maintenance."""
    if not request.user.is_authenticated or not is_admin(request.user):
        return JsonResponse({"detail": "Forbidden."}, status=403)
    try:
        payload = json.loads(request.body)
    except Exception:
        return JsonResponse({"detail": "Invalid JSON."}, status=400)
    mode = str(payload.get("mode", "")).strip()
    if mode not in ("open", "beta", "maintenance"):
        return JsonResponse({"detail": "mode must be open, beta, or maintenance."}, status=400)
    row, _ = SiteContentSettings.objects.get_or_create(key="default")
    row.beta_locked = mode in ("beta", "maintenance")
    row.maintenance_enabled = mode == "maintenance"
    row.updated_by = request.user
    row.save(update_fields=["beta_locked", "maintenance_enabled", "updated_by", "updated_at"])
    return JsonResponse(
        {
            "mode": mode,
            "beta_locked": row.beta_locked,
            "maintenance_enabled": row.maintenance_enabled,
        }
    )


@require_GET
def yaru_members_view(request):
    rows = list(
        User.objects.filter(
            is_active=True,
            password__isnull=False,
            profile__isnull=False,
            profile__show_on_yaru_chart=True,
        )
        .exclude(password="")
        .exclude(password__startswith="!")
        .filter(
            Q(is_superuser=True)
            | Q(groups__name__in=["Admin", "Consultant", "Reviewer", "Contributor"])
        )
        .select_related("profile")
        .prefetch_related("groups")
        .order_by("first_name", "last_name", "username")
        .distinct()
    )

    superusers = [user for user in rows if user.is_superuser]
    admins = [user for user in rows if any(group.name == "Admin" for group in user.groups.all())]
    project_candidates = superusers or admins
    project_proponent_id = (
        sorted(project_candidates, key=lambda user: (user.date_joined, user.id))[0].id
        if project_candidates
        else None
    )

    payload = []
    for user in rows:
        profile = _safe_profile(user)
        group_names = {group.name for group in user.groups.all()}
        if user.id == project_proponent_id:
            org_chart_group = "project_proponent"
            role_label = "Project Proponent"
        elif user.is_superuser or "Admin" in group_names:
            org_chart_group = "administrators"
            role_label = "Administrator"
        elif "Consultant" in group_names:
            org_chart_group = "consultants"
            role_label = "Consultant"
        elif "Reviewer" in group_names:
            org_chart_group = "reviewers"
            role_label = "Reviewer"
        else:
            org_chart_group = "contributors"
            role_label = "Contributor"
        photo_url = ""
        if profile and profile.profile_photo:
            photo_url = request.build_absolute_uri(profile.profile_photo.url)
        payload.append(
            {
                "username": normalize_username(user.username),
                "display_name": _display_name_with_post_nominals(user, profile),
                "role": role_label,
                "org_chart_group": org_chart_group,
                "municipality": profile.municipality if profile else "",
                "affiliation": _profile_chart_affiliation(profile),
                "profile_photo": photo_url,
            }
        )

    return JsonResponse({"rows": payload})


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
        "subcategory": entry.subcategory,
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


def _validate_captcha_payload(payload):
    turnstile_token = str(payload.get("turnstile_token", "") or "").strip()
    if not turnstile_token:
        raise ValidationError("Turnstile verification is required.")
    _validate_turnstile_token(turnstile_token)


def _validate_turnstile_token(token):
    if token == TURNSTILE_TEST_TOKEN and (settings.DEBUG or "test" in sys.argv):
        return

    secret = str(getattr(settings, "TURNSTILE_SECRET_KEY", "") or "").strip()
    if not secret:
        raise ValidationError("Turnstile is not configured.")

    encoded = urllib.parse.urlencode(
        {
            "secret": secret,
            "response": token,
        }
    ).encode()
    request = urllib.request.Request(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        data=encoded,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise ValidationError("Turnstile could not be verified. Please try again.") from exc

    if not result.get("success"):
        raise ValidationError("Turnstile verification failed. Please try again.")


def _payload_bool(value):
    return value in [True, "true", "True", "1", 1, "on"]


def _clean_email(value, *, required=True):
    email = str(value or "").strip().lower()
    if not email:
        if required:
            raise ValidationError("Email address is required.")
        return ""
    validate_email(email)
    domain = email.rsplit("@", 1)[-1]
    if "." not in domain or domain.startswith(".") or domain.endswith(".") or ".." in domain:
        raise ValidationError("Enter a valid email domain.")
    return email


def _validation_detail(exc):
    return "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)


def _actor_display_name(user):
    if not user:
        return ""
    profile = _safe_profile(user)
    return _display_name_with_post_nominals(user, profile) or normalize_username(user.username)


def _serialize_actor_link(user):
    if not user:
        return None
    return {
        "username": normalize_username(user.username),
        "display_name": _actor_display_name(user),
    }


def _serialize_onboarding_accountability(record):
    if not record:
        return None
    reviewers = [
        _serialize_actor_link(user) for user in record.approved_by_reviewers.order_by("username")
    ]
    admins = [
        _serialize_actor_link(user) for user in record.approved_by_admins.order_by("username")
    ]
    return {
        "role": record.role,
        "method": record.method,
        "label": format_accountability_label(record),
        "invited_by": _serialize_actor_link(record.invited_by),
        "approved_by": [actor for actor in [*reviewers, *admins] if actor],
    }


def _clean_username(value):
    username = normalize_username(value)
    if not username:
        raise ValidationError("Username is required.")
    username_field = User._meta.get_field("username")
    max_username_length = getattr(username_field, "max_length", 150) or 150
    if len(username) > max_username_length:
        raise ValidationError(f"Username must be at most {max_username_length} characters.")
    username_field.clean(username, None)
    return username


def _email_change_verify_url(user, email):
    token = signing.dumps(
        {
            "user_id": user.pk,
            "current_email": user.email,
            "new_email": email,
        },
        salt=EMAIL_CHANGE_SALT,
    )
    return f"{settings.FRONTEND_BASE_URL}/api/profile/email/verify/{token}"


def _send_email_change_verification(request, user, email):
    verify_url = _email_change_verify_url(user, email)
    subject = "Verify your new Chirin Ivatan email address"
    message = (
        "We received a request to use this email address for your Chirin Ivatan account.\n\n"
        "Open this link to verify the new address:\n"
        f"{verify_url}\n\n"
        "If you did not request this change, you can ignore this email. "
        "Your current account email will remain unchanged."
    )
    send_mail(
        subject,
        message,
        getattr(settings, "DEFAULT_FROM_EMAIL", None),
        [email],
        fail_silently=False,
    )


def _invitation_accept_url(invitation):
    return f"{settings.FRONTEND_BASE_URL}/roles?invite={invitation.token}"


def _send_role_invitation_email(invitation):
    role_name = {
        "consultant": "Consultant",
        "reviewer": "Reviewer",
    }.get(invitation.role, "Contributor")
    accept_url = _invitation_accept_url(invitation)

    inviter = invitation.invited_by
    inviter_name = formatted_display_name(inviter, _safe_profile(inviter))

    subject = f"You're invited to join Chirin Ivatan as {role_name}"
    text_message = (
        "Chirin Ivatan\n\n"
        f"You have been invited by {inviter_name} to join Chirin Ivatan as {role_name}.\n\n"
        f"{inviter_name} personally vouched for you, with the belief that you are the right person for this role "
        f"and that your contribution will matter to the preservation of Ivatan language and culture.\n\n"
        "Use this secure invitation link to create your login and activate your access:\n"
        f"{accept_url}\n\n"
        "After activation, a short welcome guide will show you where to complete your profile and begin.\n\n"
        "This invitation bypasses the public role approval process because it was sent by an authorized steward."
    )
    role_summary = {
        "consultant": "Share cultural guidance and help validate sensitive knowledge.",
        "reviewer": "Review submitted entries and help maintain the archive's quality.",
    }.get(
        invitation.role,
        "Document Ivatan words, stories, traditions, and community knowledge.",
    )
    html_message = render_to_string(
        "users/emails/role_invitation.html",
        {
            "accept_url": accept_url,
            "inviter_name": inviter_name,
            "role_name": role_name,
            "role_summary": role_summary,
            "recipient_email": invitation.email,
        },
    )
    email = EmailMultiAlternatives(
        subject=subject,
        body=text_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[invitation.email],
    )
    email.attach_alternative(html_message, "text/html")
    email.send(fail_silently=False)


def _role_application_access_url(application):
    query = urllib.parse.urlencode(
        {
            "status_email": application.applicant.email,
            "application": str(application.id),
        }
    )
    return f"{settings.FRONTEND_BASE_URL}/roles?{query}"


def _actor_display_name(user):
    return formatted_display_name(user, _safe_profile(user))


def _send_role_application_approval_email(application, onboarding_record, *, reminder=False):
    role_name = {
        RoleApplication.TargetRole.REVIEWER: "Reviewer",
        RoleApplication.TargetRole.CONTRIBUTOR: "Contributor",
    }.get(application.target_role, "Contributor")
    applicant = application.applicant
    recipient = applicant.email
    if not recipient:
        return

    approvers = []
    if onboarding_record:
        approvers = [
            _actor_display_name(user)
            for user in onboarding_record.approved_by_reviewers.order_by(
                "first_name", "last_name", "username"
            )
        ] + [
            _actor_display_name(user)
            for user in onboarding_record.approved_by_admins.order_by(
                "first_name", "last_name", "username"
            )
        ]
    approver_text = ", ".join(approvers) if approvers else "the Chirin Ivatan review team"
    access_url = _role_application_access_url(application)
    applicant_name = formatted_display_name(applicant, _safe_profile(applicant)) or "there"

    if reminder:
        subject = "Complete your Chirin Ivatan account setup"
        message = (
            f"Hi {applicant_name},\n\n"
            f"Your Chirin Ivatan account has been approved as {role_name}.\n\n"
            "It looks like you have not completed your profile setup yet. "
            "Please finish your account setup so you can access the platform and participate "
            "in your approved role.\n\n"
            f"Approved by: {approver_text}\n\n"
            "Complete your profile here:\n"
            f"{access_url}\n\n"
            "If you already completed this, you can ignore this email.\n\n"
            "Thank you,\n"
            "Chirin Ivatan Team"
        )
    else:
        subject = f"Your Chirin Ivatan {role_name} application was approved"
        message = (
            f"Hi {applicant_name},\n\n"
            f"Your application to join Chirin Ivatan as {role_name} has been approved.\n\n"
            f"Approved by: {approver_text}\n\n"
            "Open this link to activate your account or check your approved application:\n"
            f"{access_url}\n\n"
            "After activating your login, please update your profile so the community can recognize your contribution properly."
        )
    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [recipient],
        fail_silently=False,
    )


def _unique_username(seed):
    base = slugify(seed or "applicant").replace("-", ".")[:24].strip(".") or "applicant"
    candidate = base
    suffix = 2
    while User.objects.filter(username=candidate).exists():
        candidate = f"{base}.{suffix}"
        suffix += 1
    return candidate


def _applicant_from_public_payload(payload):
    first_name = normalize_person_name(payload.get("first_name", ""))
    last_name = normalize_person_name(payload.get("last_name", ""))
    name_extension = str(payload.get("name_extension", "")).strip()
    email = _clean_email(payload.get("email", ""))
    municipality = str(payload.get("municipality", "")).strip()
    affiliation = normalize_affiliation_text(payload.get("affiliation", ""))
    occupation = normalize_affiliation_text(payload.get("occupation", ""))
    bio = str(payload.get("bio", "")).strip()
    cultural_affiliations = _sanitize_affiliation_rows(
        payload.get("cultural_affiliations", []),
        "role",
        "organization",
    )
    other_affiliations = _sanitize_affiliation_rows(
        payload.get("other_affiliations", []),
        "designation",
        "institution",
    )

    if not first_name or not last_name or not email or not municipality:
        raise ValidationError("Name, email, and municipality are required.")

    user = User.objects.filter(email__iexact=email).first()
    created = False
    if user is None:
        username_seed = (
            payload.get("username") or email.split("@")[0] or f"{first_name}.{last_name}"
        )
        user = User.objects.create_user(
            username=_unique_username(username_seed),
            email=email,
            first_name=first_name,
            last_name=last_name,
        )
        user.set_unusable_password()
        user.save(update_fields=["password"])
        created = True
    else:
        update_fields = []
        if first_name and not user.first_name:
            user.first_name = first_name
            update_fields.append("first_name")
        if last_name and not user.last_name:
            user.last_name = last_name
            update_fields.append("last_name")
        if update_fields:
            user.save(update_fields=update_fields)

    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.name_extension = name_extension
    profile.municipality = municipality
    profile.affiliation = affiliation
    profile.occupation = occupation
    profile.cultural_affiliations = cultural_affiliations
    profile.other_affiliations = other_affiliations
    if not profile.affiliation:
        profile.affiliation = _profile_affiliation_summary(profile)
    if not profile.occupation:
        profile.occupation = _profile_occupation_summary(profile)
    if bio:
        profile.bio = bio
    profile.save()
    return user, created


@require_GET
def public_user_profile_view(request, username):
    user = User.objects.filter(username__iexact=username).first()
    if not user:
        raise Http404("User not found.")

    profile = _safe_profile(user)
    is_own_profile = request.user.is_authenticated and request.user.pk == user.pk
    can_view_hidden_contributions = is_own_profile or (
        request.user.is_authenticated and is_admin(request.user)
    )
    show_live_contributions = profile.show_live_contributions if profile else True
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

    if not show_live_contributions and not can_view_hidden_contributions:
        approved_mother_terms = approved_mother_terms.none()
        approved_folklore_entries = approved_folklore_entries.none()
        revised_entries = revised_entries.none()

    dictionary_terms_count = approved_mother_terms.count()
    folklore_entries_count = approved_folklore_entries.count()
    revisions_count = revised_entries.count()

    # Project formula: total = dictionary_terms + folklore_entries + revisions.
    total_contributions = dictionary_terms_count + folklore_entries_count + revisions_count

    contributor_record = (
        user.role_onboarding_records.filter(role="contributor").order_by("-created_at").first()
    )
    reviewer_record = (
        user.role_onboarding_records.filter(role="reviewer").order_by("-created_at").first()
    )
    consultant_record = (
        user.role_onboarding_records.filter(role="consultant").order_by("-created_at").first()
    )

    gamification = build_gamification_profile_payload(user)
    if not is_own_profile:
        for badge_group in ("dictionary_badges", "folklore_badges", "quality_badges"):
            gamification[badge_group] = [
                badge for badge in gamification.get(badge_group, []) if badge.get("unlocked")
            ]

    return JsonResponse(
        {
            "header": {
                "username": normalize_username(user.username),
                "first_name": normalize_person_name(user.first_name),
                "last_name": normalize_person_name(user.last_name),
                "name_extension": profile.name_extension if profile else "",
                "post_nominals": profile.post_nominals if profile else "",
                "role": _public_role_label(user),
                "profile_photo": photo_url,
                "municipality": profile.municipality if profile else "",
                "affiliation": normalize_affiliation_text(profile.affiliation) if profile else "",
                "occupation": normalize_affiliation_text(profile.occupation) if profile else "",
                "cultural_affiliations": _profile_cultural_affiliations(profile),
                "other_affiliations": _profile_other_affiliations(profile),
                "bio": profile.bio if profile else "",
                "include_in_leaderboard": profile.include_in_leaderboard if profile else True,
                "show_on_yaru_chart": profile.show_on_yaru_chart if profile else True,
                "show_live_contributions": show_live_contributions,
                "joined_date": user.date_joined.date().isoformat(),
                "onboarding_accountability": {
                    "contributor": format_accountability_label(contributor_record),
                    "reviewer": format_accountability_label(reviewer_record),
                    "consultant": format_accountability_label(consultant_record),
                },
                "onboarding_accountability_details": {
                    "contributor": _serialize_onboarding_accountability(contributor_record),
                    "reviewer": _serialize_onboarding_accountability(reviewer_record),
                    "consultant": _serialize_onboarding_accountability(consultant_record),
                },
            },
            "contribution_summary": {
                "dictionary_terms": dictionary_terms_count,
                "folklore_entries": folklore_entries_count,
                "revisions": revisions_count,
                "total_contributions": total_contributions,
            },
            "gamification": gamification,
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
    eligible_user_ids = User.objects.filter(leaderboard_participant_q()).distinct().values("id")
    rows = (
        UserContributionStats.objects.filter(user_id__in=eligible_user_ids)
        .exclude(user__profile__municipality="")
        .values("user__profile__municipality")
        .annotate(
            dictionary_all_time=Sum("dictionary_original_total"),
            folklore_all_time=Sum("folklore_original_total"),
            combined_all_time=Sum("combined_total"),
            dictionary_month=Sum("dictionary_month"),
            folklore_month=Sum("folklore_month"),
            combined_month=Sum("combined_month"),
            last_month_calculated=Max("last_month_calculated"),
        )
        .order_by("-combined_all_time", "user__profile__municipality")
    )
    return JsonResponse(
        {
            "rows": [
                {
                    "municipality": row["user__profile__municipality"],
                    "dictionary_all_time": row["dictionary_all_time"] or 0,
                    "folklore_all_time": row["folklore_all_time"] or 0,
                    "combined_all_time": row["combined_all_time"] or 0,
                    "dictionary_month": row["dictionary_month"] or 0,
                    "folklore_month": row["folklore_month"] or 0,
                    "combined_month": row["combined_month"] or 0,
                    "last_month_calculated": row["last_month_calculated"] or "",
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
    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    target_role = str(payload.get("target_role", "")).strip().lower()
    try:
        _validate_captcha_payload(payload)
        if request.user.is_authenticated:
            applicant = request.user
            created_applicant = False
        else:
            applicant, created_applicant = _applicant_from_public_payload(payload)

        application = create_role_application(
            applicant=applicant,
            target_role=target_role,
            reviewer_reason=payload.get("reviewer_reason", ""),
        )
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)

    return JsonResponse(
        {
            "application_id": str(application.id),
            "status": application.status,
            "public_status": "pending",
            "approval_count": 0,
            "target_role": application.target_role,
            "reviewer_reason": application.reviewer_reason,
            "created_at": application.created_at.isoformat(),
            "decided_at": None,
            "applicant_username": applicant.username,
            "created_applicant": created_applicant,
        },
        status=201,
    )


@require_http_methods(["POST"])
def public_role_application_status_view(request):
    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    try:
        email = _clean_email(payload.get("email", ""))
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)
    if not email:
        return JsonResponse({"detail": "Email address is required."}, status=400)

    rows = (
        RoleApplication.objects.filter(applicant__email__iexact=email)
        .prefetch_related("decisions")
        .order_by("-created_at")
    )
    return JsonResponse(
        {"rows": [_serialize_public_role_application_status(application) for application in rows]}
    )


@require_http_methods(["POST"])
def public_claim_role_access_view(request):
    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    try:
        email = _clean_email(payload.get("email", ""))
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)
    application_id = str(payload.get("application_id", "")).strip()
    username = normalize_username(payload.get("username", ""))
    password = str(payload.get("password", ""))
    password_confirm = str(payload.get("password_confirm", ""))

    if not email or not application_id or not username or not password or not password_confirm:
        return JsonResponse(
            {
                "detail": (
                    "Email, application reference, username, password, and confirmation "
                    "are required."
                )
            },
            status=400,
        )
    if password != password_confirm:
        return JsonResponse({"detail": "Password confirmation does not match."}, status=400)

    username_field = User._meta.get_field("username")
    max_username_length = getattr(username_field, "max_length", 150) or 150
    if len(username) > max_username_length:
        return JsonResponse(
            {"detail": f"Username must be at most {max_username_length} characters."},
            status=400,
        )

    try:
        username_field.clean(username, None)
    except ValidationError as exc:
        return JsonResponse({"detail": "; ".join(exc.messages)}, status=400)

    with transaction.atomic():
        user = User.objects.select_for_update().filter(email__iexact=email).first()
        if not user:
            return JsonResponse(
                {"detail": "No approved application was found for this email."},
                status=404,
            )

        approved_application = RoleApplication.objects.filter(
            id=application_id,
            applicant=user,
            status=RoleApplication.Status.APPROVED,
        ).first()
        if not approved_application:
            return JsonResponse(
                {"detail": "Approved application reference not found for this email."},
                status=400,
            )

        if user.has_usable_password():
            return JsonResponse(
                {
                    "detail": (
                        f"Credentials were already set for @{user.username}. "
                        "Please log in with that account."
                    )
                },
                status=400,
            )

        username_taken = User.objects.filter(username__iexact=username).exclude(id=user.id).exists()
        if username_taken:
            return JsonResponse({"detail": "That username is already taken."}, status=400)

        user.username = username
        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            return JsonResponse({"detail": "; ".join(exc.messages)}, status=400)

        user.set_password(password)
        user.is_active = True
        user.save(update_fields=["username", "password", "is_active"])
        activate_role_for_approved_application(approved_application)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.onboarding_prompt_pending = True
        profile.onboarding_prompt_dismissed = False
        profile.save(
            update_fields=[
                "onboarding_prompt_pending",
                "onboarding_prompt_dismissed",
            ]
        )

    return JsonResponse(
        {
            "detail": "Credentials created. You can now log in.",
            "username": normalize_username(user.username),
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
        .values("id", "target_role", "reviewer_reason", "status", "created_at", "decided_at")
    )
    return JsonResponse(
        {
            "rows": [
                {
                    "application_id": str(row["id"]),
                    "target_role": row["target_role"],
                    "reviewer_reason": row["reviewer_reason"],
                    "status": row["status"],
                    "created_at": row["created_at"].isoformat(),
                    "decided_at": (row["decided_at"].isoformat() if row["decided_at"] else None),
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
    if not can_screen_roles(request.user):
        return JsonResponse({"detail": "Reviewer or admin access required."}, status=403)

    status = (request.GET.get("status") or "").strip().lower()
    rows = RoleApplication.objects.select_related(
        "applicant", "applicant__profile"
    ).prefetch_related(
        "applicant__groups",
        "decisions__decided_by",
    )
    if status == RoleApplication.Status.PENDING:
        rows = rows.filter(status=RoleApplication.Status.PENDING).exclude(
            decisions__decided_by=request.user
        )
    elif status == "awaiting_quorum":
        rows = rows.filter(
            status=RoleApplication.Status.PENDING,
            decisions__decided_by=request.user,
            decisions__decision=RoleApplicationDecision.Decision.APPROVE,
        )
    elif status == RoleApplication.Status.APPROVED:
        rows = rows.filter(status=RoleApplication.Status.APPROVED)
    elif status == RoleApplication.Status.REJECTED:
        rows = rows.filter(status=RoleApplication.Status.REJECTED)
    elif status and status != "all":
        rows = rows.none()
    rows = rows.order_by("-created_at").distinct()

    return JsonResponse({"rows": [_serialize_role_application(request, row) for row in rows]})


@require_http_methods(["POST"])
def admin_role_application_release_email_view(request, application_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    application = (
        RoleApplication.objects.select_related("applicant", "applicant__profile")
        .prefetch_related("applicant__groups", "decisions__decided_by")
        .filter(id=application_id)
        .first()
    )
    if not application:
        return JsonResponse({"detail": "Application not found."}, status=404)
    if application.status != RoleApplication.Status.REJECTED:
        return JsonResponse(
            {"detail": "Only rejected applications can release an email."}, status=400
        )

    applicant = application.applicant
    if not applicant.email:
        return JsonResponse(
            {"detail": "This rejected application has no email to release."}, status=400
        )
    if applicant.has_usable_password() or applicant.groups.exists():
        return JsonResponse(
            {
                "detail": (
                    "This applicant has login credentials or active roles. "
                    "Edit that user directly instead of releasing the email from the application."
                )
            },
            status=400,
        )

    released_email = applicant.email
    applicant.email = ""
    applicant.save(update_fields=["email"])

    return JsonResponse(
        {
            "detail": f"{released_email} is now available for another account.",
            "released_email": released_email,
            "application": _serialize_role_application(request, application),
        }
    )


@require_GET
def admin_users_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    query = (request.GET.get("q") or "").strip()
    group = (request.GET.get("group") or "").strip()

    approved_roles = [
        RoleOnboardingRecord.Role.ADMIN,
        RoleOnboardingRecord.Role.CONSULTANT,
        RoleOnboardingRecord.Role.REVIEWER,
        RoleOnboardingRecord.Role.CONTRIBUTOR,
    ]
    approved_groups = ["Admin", "Consultant", "Reviewer", "Contributor"]
    rows = (
        User.objects.select_related("profile", "contribution_stats")
        .prefetch_related("groups")
        .filter(
            Q(is_superuser=True)
            | Q(groups__name__in=approved_groups)
            | Q(role_onboarding_records__role__in=approved_roles)
        )
    )
    if query:
        rows = rows.filter(
            Q(username__icontains=query)
            | Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(email__icontains=query)
            | Q(profile__name_extension__icontains=query)
            | Q(profile__post_nominals__icontains=query)
            | Q(profile__municipality__icontains=query)
            | Q(profile__affiliation__icontains=query)
        )
    if group == "Admin":
        rows = rows.filter(
            Q(groups__name="Admin")
            | Q(is_superuser=True)
            | Q(role_onboarding_records__role=RoleOnboardingRecord.Role.ADMIN)
        )
    elif group and group != "all":
        rows = rows.filter(Q(groups__name=group) | Q(role_onboarding_records__role=group.lower()))

    rows = rows.order_by("username").distinct()
    return JsonResponse({"rows": [_serialize_admin_user(request, row) for row in rows]})


@require_http_methods(["POST"])
def admin_consultant_profile_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    if request.content_type and request.content_type.startswith("multipart/form-data"):
        payload = request.POST
        uploaded_photo = request.FILES.get("profile_photo")
    else:
        payload, parse_error = _parse_json_body(request)
        if parse_error:
            return parse_error
        uploaded_photo = None

    try:
        cultural_affiliations = _sanitize_affiliation_rows(
            payload.get("cultural_affiliations", []),
            "role",
            "organization",
        )
        other_affiliations = _sanitize_affiliation_rows(
            payload.get("other_affiliations", []),
            "designation",
            "institution",
        )
        user, record = create_consultant_profile(
            created_by=request.user,
            first_name=payload.get("first_name", ""),
            last_name=payload.get("last_name", ""),
            name_extension=payload.get("name_extension", ""),
            email=payload.get("email", ""),
            municipality=payload.get("municipality", ""),
            post_nominals=payload.get("post_nominals", ""),
            affiliation=payload.get("affiliation", ""),
            occupation=payload.get("occupation", ""),
            cultural_affiliations=cultural_affiliations,
            other_affiliations=other_affiliations,
            bio=payload.get("bio", ""),
            profile_photo=uploaded_photo,
            notes=payload.get("notes", ""),
        )
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)

    return JsonResponse(
        {
            "user": _serialize_admin_user(request, user),
            "onboarding_record_id": str(record.id),
            "accountability_label": format_accountability_label(record),
        },
        status=201,
    )


@require_http_methods(["POST"])
def admin_consultant_profile_detail_view(request, username):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    user = User.objects.filter(username__iexact=username).first()
    if not user:
        return JsonResponse({"detail": "Consultant profile not found."}, status=404)

    if request.content_type and request.content_type.startswith("multipart/form-data"):
        payload = request.POST
        uploaded_photo = request.FILES.get("profile_photo")
    else:
        payload, parse_error = _parse_json_body(request)
        if parse_error:
            return parse_error
        uploaded_photo = None

    try:
        cultural_affiliations = _sanitize_affiliation_rows(
            payload.get("cultural_affiliations", []),
            "role",
            "organization",
        )
        other_affiliations = _sanitize_affiliation_rows(
            payload.get("other_affiliations", []),
            "designation",
            "institution",
        )
        user, record = update_managed_consultant_profile(
            updated_by=request.user,
            user=user,
            first_name=payload.get("first_name", ""),
            last_name=payload.get("last_name", ""),
            name_extension=payload.get("name_extension", ""),
            email=payload.get("email", ""),
            municipality=payload.get("municipality", ""),
            post_nominals=payload.get("post_nominals", ""),
            affiliation=payload.get("affiliation", ""),
            occupation=payload.get("occupation", ""),
            cultural_affiliations=cultural_affiliations,
            other_affiliations=other_affiliations,
            bio=payload.get("bio", ""),
            profile_photo=uploaded_photo,
            notes=payload.get("notes") if "notes" in payload else None,
        )
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)

    return JsonResponse(
        {
            "user": _serialize_admin_user(request, user),
            "onboarding_record_id": str(record.id),
            "accountability_label": format_accountability_label(record),
        }
    )


@require_GET
def admin_user_activity_view(request, username):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    user = User.objects.filter(username=username).first()
    if not user:
        return JsonResponse({"detail": "User not found."}, status=404)

    rows = _admin_user_activity_rows(user)
    return JsonResponse(
        {
            "username": normalize_username(user.username),
            "limit": ADMIN_ACTIVITY_LIMIT,
            "rows": [_serialize_admin_activity_row(row) for row in rows],
        }
    )


@require_http_methods(["POST"])
def admin_user_status_view(request, username):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    target_user = User.objects.filter(username=username).first()
    if not target_user:
        return JsonResponse({"detail": "User not found."}, status=404)

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error
    if "is_active" not in payload:
        return JsonResponse({"detail": "is_active is required."}, status=400)

    next_active = _payload_bool(payload.get("is_active"))
    notes = str(payload.get("notes", "") or "").strip()
    if not next_active and not notes:
        return JsonResponse({"detail": "Deactivation requires notes."}, status=400)
    if (
        next_active
        and not target_user.has_usable_password()
        and target_user.role_applications.filter(status=RoleApplication.Status.APPROVED).exists()
    ):
        return JsonResponse(
            {
                "detail": (
                    "This approved account is awaiting activation. "
                    "The applicant must create credentials from the approval link first."
                )
            },
            status=400,
        )
    if target_user.id == request.user.id and not next_active:
        return JsonResponse({"detail": "You cannot deactivate your own account."}, status=400)
    if not next_active and is_admin(target_user) and _active_admin_count() <= 1:
        return JsonResponse({"detail": "Cannot deactivate the final active admin."}, status=400)

    before = "active" if target_user.is_active else "inactive"
    target_user.is_active = next_active
    target_user.save(update_fields=["is_active"])
    after = "active" if target_user.is_active else "inactive"
    action = (
        AdminAccountAction.Action.REACTIVATE
        if next_active
        else AdminAccountAction.Action.DEACTIVATE
    )
    _record_admin_account_action(
        target_user=target_user,
        admin=request.user,
        action=action,
        notes=notes,
        status_before=before,
        status_after=after,
    )
    return JsonResponse({"user": _serialize_admin_user(request, target_user)})


@require_http_methods(["POST"])
def admin_user_password_reset_view(request, username):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    target_user = User.objects.filter(username=username).first()
    if not target_user:
        return JsonResponse({"detail": "User not found."}, status=404)
    if not target_user.email:
        return JsonResponse(
            {"detail": "This account has no email address for password reset."}, status=400
        )
    if not target_user.is_active:
        return JsonResponse(
            {"detail": "Reactivate the account before sending a password reset."}, status=400
        )

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error
    notes = str(payload.get("notes", "") or "").strip()

    form = PasswordResetForm({"email": target_user.email})
    if not form.is_valid():
        return JsonResponse({"detail": "Password reset email could not be prepared."}, status=400)
    try:
        form.save(
            request=request,
            use_https=request.is_secure(),
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            email_template_name="registration/password_reset_email.html",
            subject_template_name="registration/password_reset_subject.txt",
        )
    except Exception as exc:
        return JsonResponse(
            {"detail": ("Password reset action was not sent. " f"{type(exc).__name__}: {exc}")},
            status=500,
        )

    _record_admin_account_action(
        target_user=target_user,
        admin=request.user,
        action=AdminAccountAction.Action.SEND_PASSWORD_RESET,
        notes=notes,
        status_before="email_available",
        status_after="reset_link_sent",
    )
    return JsonResponse(
        {
            "detail": f"Password reset link sent to {target_user.email}.",
            "user": _serialize_admin_user(request, target_user),
        }
    )


@require_http_methods(["POST"])
def admin_user_approval_reminder_view(request, username):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    target_user = User.objects.filter(username=username).first()
    if not target_user:
        return JsonResponse({"detail": "User not found."}, status=404)
    if not target_user.email:
        return JsonResponse(
            {"detail": "This approved account has no email address for a reminder."}, status=400
        )
    if target_user.has_usable_password():
        return JsonResponse(
            {"detail": "This account has already created login credentials."}, status=400
        )

    application = (
        target_user.role_applications.filter(status=RoleApplication.Status.APPROVED)
        .order_by("-decided_at", "-created_at")
        .first()
    )
    if not application:
        return JsonResponse(
            {"detail": "No approved unclaimed application was found for this account."}, status=400
        )

    onboarding_record = (
        application.onboarding_records.prefetch_related(
            "approved_by_reviewers", "approved_by_admins"
        )
        .order_by("-created_at")
        .first()
    )
    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error
    notes = str(payload.get("notes", "") or "").strip()

    try:
        _send_role_application_approval_email(application, onboarding_record, reminder=True)
    except Exception as exc:
        return JsonResponse(
            {"detail": ("Approval reminder was not sent. " f"{type(exc).__name__}: {exc}")},
            status=500,
        )

    _record_admin_account_action(
        target_user=target_user,
        admin=request.user,
        action=AdminAccountAction.Action.SEND_APPROVAL_REMINDER,
        role=application.target_role,
        notes=notes,
        status_before="approved_pending_activation",
        status_after="approval_reminder_sent",
    )
    return JsonResponse(
        {
            "detail": f"Approval reminder sent to {target_user.email}.",
            "access_url": _role_application_access_url(application),
            "user": _serialize_admin_user(request, target_user),
        }
    )


@require_http_methods(["POST"])
def admin_user_revoke_role_view(request, username):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    target_user = User.objects.filter(username=username).prefetch_related("groups").first()
    if not target_user:
        return JsonResponse({"detail": "User not found."}, status=404)

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error
    role = str(payload.get("role", "") or "").strip().lower()
    notes = str(payload.get("notes", "") or "").strip()
    if not notes:
        return JsonResponse({"detail": "Role revocation requires notes."}, status=400)
    if target_user.id == request.user.id and role == "admin":
        return JsonResponse({"detail": "You cannot revoke your own admin access."}, status=400)

    before_groups = (
        ", ".join(target_user.groups.order_by("name").values_list("name", flat=True)) or "none"
    )
    try:
        removed_groups = _apply_role_revocation(target_user, role)
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)
    target_user.refresh_from_db()
    after_groups = (
        ", ".join(target_user.groups.order_by("name").values_list("name", flat=True)) or "none"
    )
    _record_admin_account_action(
        target_user=target_user,
        admin=request.user,
        action=AdminAccountAction.Action.REVOKE_ROLE,
        notes=notes,
        role=role,
        status_before=before_groups,
        status_after=after_groups,
    )
    return JsonResponse(
        {
            "user": _serialize_admin_user(request, target_user),
            "removed_groups": removed_groups,
        }
    )


@require_http_methods(["POST"])
def admin_user_suspicious_flag_view(request, username):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    target_user = User.objects.filter(username=username).first()
    if not target_user:
        return JsonResponse({"detail": "User not found."}, status=404)

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error
    notes = str(payload.get("notes", "") or "").strip()
    if not notes:
        return JsonResponse({"detail": "Suspicious-account flag requires notes."}, status=400)
    if _pending_account_flags_for_user(target_user).exists():
        return JsonResponse(
            {"detail": "This account already has a pending suspicious-account flag."}, status=400
        )

    action = _record_admin_account_action(
        target_user=target_user,
        admin=request.user,
        action=AdminAccountAction.Action.FLAG_SUSPICIOUS,
        notes=notes,
        status_before="normal",
        status_after="flagged_for_review",
        flag_status=AdminAccountAction.FlagStatus.PENDING,
    )
    return JsonResponse(
        {
            "flag": _admin_account_action_payload(action),
            "user": _serialize_admin_user(request, target_user),
        },
        status=201,
    )


@require_http_methods(["POST"])
def public_user_suspicious_flag_view(request, username):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error

    target_user = User.objects.filter(username=username).first()
    if not target_user:
        return JsonResponse({"detail": "User not found."}, status=404)
    if target_user.pk == request.user.pk:
        return JsonResponse({"detail": "You cannot flag your own account."}, status=400)

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error
    try:
        _validate_captcha_payload(payload)
    except ValidationError as error:
        return JsonResponse({"detail": error.messages[0]}, status=400)

    notes = str(payload.get("notes", "") or "").strip()
    if not notes:
        return JsonResponse({"detail": "Suspicious-account flag requires a reason."}, status=400)
    if _pending_account_flags_for_user(target_user).exists():
        return JsonResponse(
            {"detail": "This account already has a pending suspicious-account flag."}, status=400
        )

    action = _record_admin_account_action(
        target_user=target_user,
        admin=request.user,
        action=AdminAccountAction.Action.FLAG_SUSPICIOUS,
        notes=notes,
        status_before="normal",
        status_after="flagged_for_review",
        flag_status=AdminAccountAction.FlagStatus.PENDING,
    )
    return JsonResponse(
        {
            "detail": "Account flag sent for admin review.",
            "flag": _admin_account_action_payload(action),
        },
        status=201,
    )


@require_http_methods(["POST"])
def admin_account_flag_resolution_view(request, action_id):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    flag = (
        AdminAccountAction.objects.select_related("target_user", "admin", "resolved_by")
        .filter(
            id=action_id,
            action=AdminAccountAction.Action.FLAG_SUSPICIOUS,
        )
        .first()
    )
    if not flag:
        return JsonResponse({"detail": "Suspicious-account flag not found."}, status=404)
    if flag.flag_status != AdminAccountAction.FlagStatus.PENDING:
        return JsonResponse({"detail": "This flag has already been resolved."}, status=400)

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error
    decision = str(payload.get("decision", "") or "").strip().lower()
    notes = str(payload.get("notes", "") or "").strip()
    if decision not in ["clear", "confirm"]:
        return JsonResponse({"detail": "decision must be clear or confirm."}, status=400)
    if not notes:
        return JsonResponse({"detail": "Flag resolution requires notes."}, status=400)

    if decision == "clear":
        flag.flag_status = AdminAccountAction.FlagStatus.CLEARED
        resolution_action = AdminAccountAction.Action.CLEAR_SUSPICIOUS_FLAG
        status_after = "flag_cleared"
    else:
        flag.flag_status = AdminAccountAction.FlagStatus.CONFIRMED
        resolution_action = AdminAccountAction.Action.CONFIRM_SUSPICIOUS_FLAG
        status_after = "flag_confirmed"
    flag.resolved_by = request.user
    flag.resolved_at = timezone.now()
    flag.resolution_notes = notes
    flag.save(update_fields=["flag_status", "resolved_by", "resolved_at", "resolution_notes"])

    _record_admin_account_action(
        target_user=flag.target_user,
        admin=request.user,
        action=resolution_action,
        notes=notes,
        status_before="flagged_for_review",
        status_after=status_after,
    )
    return JsonResponse(
        {
            "flag": _admin_account_action_payload(flag),
            "user": _serialize_admin_user(request, flag.target_user),
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
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)

    application.refresh_from_db()
    if application.status in {
        RoleApplication.Status.APPROVED,
        RoleApplication.Status.REJECTED,
    }:
        notify(
            user=application.applicant,
            notif_type=Notification.Type.ROLE_DECIDED,
            message=f"Your application for the {application.target_role} role has been {application.status}.",
            target_url="/roles",
        )
    if onboarding_record:
        transaction.on_commit(
            lambda: _send_role_application_approval_email(application, onboarding_record)
        )
    return JsonResponse(
        {
            "application_id": str(application.id),
            "application_status": application.status,
            "decision_id": str(decision_row.id),
            "onboarding_record_id": (str(onboarding_record.id) if onboarding_record else None),
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

    username = normalize_username(payload.get("username", ""))
    role = str(payload.get("role", "")).strip().lower()
    notes = str(payload.get("notes", "") or "")

    invitee = User.objects.filter(username__iexact=username).first()
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
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)

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


def _serialize_role_invitation(invitation):
    return {
        "invitation_id": str(invitation.id),
        "email": invitation.email,
        "role": invitation.role,
        "status": invitation.status,
        "accept_url": _invitation_accept_url(invitation),
        "invited_by": invitation.invited_by.username,
        "accepted_by": invitation.accepted_by.username if invitation.accepted_by else "",
        "created_at": invitation.created_at.isoformat(),
        "expires_at": invitation.expires_at.isoformat() if invitation.expires_at else None,
        "accepted_at": invitation.accepted_at.isoformat() if invitation.accepted_at else None,
    }


@require_http_methods(["GET", "POST"])
def admin_email_role_invitation_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not can_screen_roles(request.user):
        return JsonResponse({"detail": "Reviewer or admin access required."}, status=403)

    if request.method == "GET":
        rows = (
            RoleInvitation.objects.select_related("invited_by", "accepted_by")
            .filter(invited_by=request.user)
            .order_by("-created_at")[:50]
        )
        return JsonResponse({"rows": [_serialize_role_invitation(row) for row in rows]})

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    try:
        _validate_captcha_payload(payload)
        email = _clean_email(payload.get("email", ""))
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)
    role = str(payload.get("role", "")).strip().lower()
    first_name = normalize_person_name(payload.get("first_name", ""))
    last_name = normalize_person_name(payload.get("last_name", ""))
    name_extension = str(payload.get("name_extension", "") or "").strip()
    municipality = str(payload.get("municipality", "") or "").strip()
    notes = str(payload.get("notes", "") or "")

    try:
        invitation = create_email_role_invitation(
            inviter=request.user,
            email=email,
            role=role,
            first_name=first_name,
            last_name=last_name,
            name_extension=name_extension,
            municipality=municipality,
            notes=notes,
        )
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)

    email_sent = True
    warning = ""
    try:
        _send_role_invitation_email(invitation)
    except Exception as exc:
        email_sent = False
        warning = (
            "Invitation was saved, but the email could not be delivered. "
            f"Check the email settings, then copy the invite link from Recent Invitations. ({exc})"
        )

    return JsonResponse(
        {
            "invitation_id": str(invitation.id),
            "email": invitation.email,
            "role": invitation.role,
            "status": invitation.status,
            "accept_url": _invitation_accept_url(invitation),
            "expires_at": invitation.expires_at.isoformat() if invitation.expires_at else None,
            "email_sent": email_sent,
            "warning": warning,
        },
        status=201 if email_sent else 202,
    )


@require_GET
def public_role_invitation_view(request, token):
    invitation = RoleInvitation.objects.select_related("invited_by").filter(token=token).first()
    if not invitation:
        return JsonResponse({"detail": "Invitation was not found."}, status=404)

    return JsonResponse(
        {
            "email": invitation.email,
            "role": invitation.role,
            "status": invitation.status,
            "expires_at": invitation.expires_at.isoformat() if invitation.expires_at else None,
            "first_name": normalize_person_name(invitation.first_name),
            "last_name": normalize_person_name(invitation.last_name),
            "name_extension": invitation.name_extension,
            "municipality": invitation.municipality,
        }
    )


@require_http_methods(["POST"])
def public_accept_role_invitation_view(request, token):
    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    first_name = normalize_person_name(payload.get("first_name", ""))
    last_name = normalize_person_name(payload.get("last_name", ""))
    name_extension = str(payload.get("name_extension", "") or "").strip()
    municipality = str(payload.get("municipality", "") or "").strip()
    username = normalize_username(payload.get("username", ""))
    password = str(payload.get("password", ""))
    password_confirm = str(payload.get("password_confirm", ""))

    try:
        _validate_captcha_payload(payload)
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)

    if not username or not password or not password_confirm:
        return JsonResponse(
            {"detail": "Username, password, and confirmation are required."}, status=400
        )
    if password != password_confirm:
        return JsonResponse({"detail": "Password confirmation does not match."}, status=400)

    username_field = User._meta.get_field("username")
    max_username_length = getattr(username_field, "max_length", 150) or 150
    if len(username) > max_username_length:
        return JsonResponse(
            {"detail": f"Username must be at most {max_username_length} characters."},
            status=400,
        )
    try:
        username_field.clean(username, None)
    except ValidationError as exc:
        return JsonResponse({"detail": "; ".join(exc.messages)}, status=400)
    try:
        validate_password(password)
        invitation, record = accept_email_role_invitation(
            token=token,
            first_name=first_name,
            last_name=last_name,
            name_extension=name_extension,
            municipality=municipality,
            username=username,
            password=password,
        )
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)

    return JsonResponse(
        {
            "detail": "Invitation accepted. You can now log in.",
            "username": record.user.username,
            "role": invitation.role,
            "accountability_label": format_accountability_label(record),
        },
        status=201,
    )

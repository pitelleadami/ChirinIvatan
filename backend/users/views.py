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

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.validators import validate_email
from django.core.files.storage import default_storage
from django.core.mail import send_mail
from django.http import Http404, JsonResponse
from django.db import transaction
from django.db.models import Max, Q, Sum
from django.utils.text import slugify
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods
import json
import uuid

from dictionary.models import Entry, EntryRevision, EntryStatus
from folklore.models import FolkloreEntry, FolkloreRevision
from reviews.models import FolkloreReview, Review
from users.models import (
    ContributionEvent,
    MunicipalityMonthlyWinner,
    RecognitionEvent,
    RoleApplication,
    RoleApplicationDecision,
    RoleInvitation,
    SiteContentSettings,
    UserSessionEvent,
    UserContributionStats,
    UserProfile,
)
from users.leaderboard_filters import leaderboard_participant_q
from users.role_onboarding import (
    accept_email_role_invitation,
    can_screen_roles,
    create_consultant_profile,
    create_email_role_invitation,
    create_role_application,
    decide_role_application,
    format_accountability_label,
    invite_user_to_role,
    is_admin,
    is_reviewer,
)
from users.recognition import (
    build_gamification_profile_payload,
    leaderboard_rows,
    recompute_user_gamification,
)
from django.core.exceptions import ValidationError


User = get_user_model()
ADMIN_ACTIVITY_LIMIT = 500
DEFAULT_SITE_CONTENT = {
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
            "To support long-term sustainability, the project welcomes partnerships and collaborative "
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
        "\"Chirin Ivatan is more than just a project. It is a shared act of remembrance built "
        "in the spirit of Yaru, where every word remembered and every story told helps keep "
        "the Ivatan heritage alive.\""
    ),
    "yaru_heading": "The Digital Yaru",
    "yaru_intro_paragraphs": [
        (
            "Chirin Ivatan is built in the spirit of Yaru, the Ivatan embodiment of collective "
            "strength and shared purpose."
        ),
        (
            "The project welcomes contributors, reviewers, consultants, and partners who can lend "
            "their hands, voices, and knowledge. Whether you are a student, storyteller, educator, "
            "or simply someone who cares to help, you are invited to be part of this digital yaru."
        ),
    ],
    "support_statements": [],
    "partner_details": [],
    "faq_sections": [],
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
        "username": user.username,
        "is_authenticated": user.is_authenticated,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "groups": groups,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "post_nominals": profile.post_nominals if profile else "",
        "municipality": profile.municipality if profile else "",
        "profile_photo": photo_url,
        "profile_complete": profile_complete,
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
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "post_nominals": profile.post_nominals,
        "municipality": profile.municipality,
        "affiliation": profile.affiliation,
        "occupation": profile.occupation,
        "cultural_affiliations": profile.cultural_affiliations or [],
        "other_affiliations": profile.other_affiliations or [],
        "bio": profile.bio,
        "include_in_leaderboard": profile.include_in_leaderboard,
        "show_on_yaru_chart": profile.show_on_yaru_chart,
        "show_live_contributions": profile.show_live_contributions,
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
        first_value = str(row.get(first_key, "")).strip()
        second_value = str(row.get(second_key, "")).strip()
        if first_value or second_value:
            cleaned.append({first_key: first_value, second_key: second_value})
    return cleaned


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
        description = str(row.get("description", "")).strip()
        url = str(row.get("url", "")).strip()
        if name or description or url:
            cleaned.append({"name": name, "description": description, "url": url})
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
        roles = [str(role).strip().lower() for role in roles if str(role).strip().lower() in valid_roles]
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
        return {**DEFAULT_SITE_CONTENT, "is_default": True, "updated_at": None, "updated_by": ""}
    return {
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
    full_name = user.get_full_name().strip() or user.username
    post_nominals = str(profile.post_nominals if profile else "").strip()
    return f"{full_name}, {post_nominals}" if post_nominals else full_name


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
    decisions = application.decisions.select_related("decided_by").order_by("created_at")
    return {
        "application_id": str(application.id),
        "target_role": application.target_role,
        "reviewer_reason": application.reviewer_reason,
        "status": application.status,
        "created_at": application.created_at.isoformat(),
        "updated_at": application.updated_at.isoformat(),
        "decided_at": application.decided_at.isoformat() if application.decided_at else None,
        "applicant": {
            "username": applicant.username,
            "first_name": applicant.first_name,
            "last_name": applicant.last_name,
            "email": applicant.email,
            "post_nominals": profile.post_nominals if profile else "",
            "municipality": profile.municipality if profile else "",
            "affiliation": profile.affiliation if profile else "",
            "occupation": profile.occupation if profile else "",
            "cultural_affiliations": profile.cultural_affiliations if profile else [],
            "other_affiliations": profile.other_affiliations if profile else [],
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
                    else "reviewer"
                    if is_reviewer(row.decided_by)
                    else "user"
                ),
                "created_at": row.created_at.isoformat(),
            }
            for row in decisions
        ],
    }


def _serialize_public_role_application_status(application):
    approval_count = application.decisions.filter(decision="approve").count()
    if application.status == RoleApplication.Status.APPROVED:
        public_status = "approved_final"
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
            "post_nominals": profile.post_nominals if profile else "",
            "affiliation": profile.affiliation if profile else "",
            "occupation": profile.occupation if profile else "",
            "cultural_affiliations": profile.cultural_affiliations if profile else [],
            "other_affiliations": profile.other_affiliations if profile else [],
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
                "invited_by": record.invited_by.username if record.invited_by else "",
                "approved_by_reviewers": [
                    reviewer.username for reviewer in record.approved_by_reviewers.order_by("username")
                ],
                "approved_by_admins": [
                    admin.username for admin in record.approved_by_admins.order_by("username")
                ],
                "created_at": record.created_at.isoformat(),
            }
            for record in onboarding_records
        ],
        "pending_applications": user.role_applications.filter(status=RoleApplication.Status.PENDING).count(),
    }


def _activity_target_label(*, dictionary_entry=None, folklore_entry=None, entry_revision=None, folklore_revision=None):
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


def _admin_user_activity_rows(user):
    rows = []

    for event in UserSessionEvent.objects.filter(user=user).order_by("-created_at")[:ADMIN_ACTIVITY_LIMIT]:
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
        target_type = "dictionary" if event.dictionary_entry_id or event.entry_revision_id else "folklore"
        target_id = (
            str(event.dictionary_entry_id)
            if event.dictionary_entry_id
            else str(event.folklore_entry_id)
            if event.folklore_entry_id
            else str(event.entry_revision_id)
            if event.entry_revision_id
            else str(event.folklore_revision_id)
            if event.folklore_revision_id
            else ""
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
    _record_session_event(request, user, UserSessionEvent.Type.LOGIN)
    return JsonResponse(_serialize_auth_user(user, request=request))


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

    try:
        for field in ["first_name", "last_name", "email"]:
            if field in payload:
                value = _clean_email(payload.get(field), required=False) if field == "email" else (payload.get(field) or "").strip()
                setattr(user, field, value)
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)

    for field in ["post_nominals", "municipality", "affiliation", "occupation", "bio"]:
        if field in payload:
            setattr(profile, field, (payload.get(field) or "").strip())

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

    user.save(update_fields=["first_name", "last_name", "email"])
    profile.save()
    recompute_user_gamification(user)
    return JsonResponse(_serialize_private_profile(request, user))


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
    row.about_heading = str(payload.get("about_heading", "")).strip()
    row.about_intro_paragraphs = _sanitize_paragraphs(payload.get("about_intro_paragraphs", []))
    row.about_body_paragraphs = _sanitize_paragraphs(payload.get("about_body_paragraphs", []))
    row.about_rationale_paragraphs = _sanitize_paragraphs(payload.get("about_rationale_paragraphs", []))
    row.about_future_paragraphs = _sanitize_paragraphs(payload.get("about_future_paragraphs", []))
    row.about_final_quote = str(payload.get("about_final_quote", "")).strip()
    row.yaru_heading = str(payload.get("yaru_heading", "")).strip()
    row.yaru_intro_paragraphs = _sanitize_paragraphs(payload.get("yaru_intro_paragraphs", []))
    row.support_statements = _sanitize_support_statements(payload.get("support_statements", []))
    row.partner_details = _sanitize_partner_details(payload.get("partner_details", []))
    row.faq_sections = _sanitize_faq_sections(payload.get("faq_sections", []))
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


@require_GET
def yaru_members_view(request):
    rows = list(
        User.objects.filter(
            is_active=True,
            profile__isnull=False,
            profile__show_on_yaru_chart=True,
        )
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
    admins = [
        user
        for user in rows
        if any(group.name == "Admin" for group in user.groups.all())
    ]
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
                "username": user.username,
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


def _invitation_accept_url(invitation):
    return f"{settings.FRONTEND_BASE_URL}/roles?invite={invitation.token}"


def _send_role_invitation_email(invitation):
    role_name = {
        "consultant": "Consultant",
        "reviewer": "Reviewer",
    }.get(invitation.role, "Contributor")
    accept_url = _invitation_accept_url(invitation)
    subject = f"You're invited to join Chirin Ivatan as {role_name}"
    message = (
        f"You have been invited to join Chirin Ivatan as {role_name}.\n\n"
        "Use this secure invitation link to create your login and activate your access:\n"
        f"{accept_url}\n\n"
        "This invitation bypasses the public role approval process because it was sent by an administrator."
    )
    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [invitation.email],
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
    first_name = str(payload.get("first_name", "")).strip()
    last_name = str(payload.get("last_name", "")).strip()
    email = _clean_email(payload.get("email", ""))
    municipality = str(payload.get("municipality", "")).strip()
    affiliation = str(payload.get("affiliation", "")).strip()
    occupation = str(payload.get("occupation", "")).strip()
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
        username_seed = payload.get("username") or email.split("@")[0] or f"{first_name}.{last_name}"
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
    user = User.objects.filter(username=username).first()
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
    consultant_record = (
        user.role_onboarding_records.filter(role="consultant")
        .order_by("-created_at")
        .first()
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
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "post_nominals": profile.post_nominals if profile else "",
                "role": _public_role_label(user),
                "profile_photo": photo_url,
                "municipality": profile.municipality if profile else "",
                "affiliation": profile.affiliation if profile else "",
                "occupation": profile.occupation if profile else "",
                "cultural_affiliations": profile.cultural_affiliations if profile else [],
                "other_affiliations": profile.other_affiliations if profile else [],
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
        {
            "rows": [
                _serialize_public_role_application_status(application)
                for application in rows
            ]
        }
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
    username = str(payload.get("username", "")).strip()
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

        approved_row_exists = RoleApplication.objects.filter(
            id=application_id,
            applicant=user,
            status=RoleApplication.Status.APPROVED,
        ).exists()
        if not approved_row_exists:
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
        user.save(update_fields=["username", "password"])

    return JsonResponse(
        {
            "detail": "Credentials created. You can now log in.",
            "username": user.username,
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
    if not can_screen_roles(request.user):
        return JsonResponse({"detail": "Reviewer or admin access required."}, status=403)

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
            | Q(profile__post_nominals__icontains=query)
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
def admin_consultant_profile_view(request):
    auth_error = _require_authenticated(request)
    if auth_error:
        return auth_error
    if not is_admin(request.user):
        return JsonResponse({"detail": "Admin access required."}, status=403)

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    try:
        user, record = create_consultant_profile(
            created_by=request.user,
            first_name=payload.get("first_name", ""),
            last_name=payload.get("last_name", ""),
            email=payload.get("email", ""),
            municipality=payload.get("municipality", ""),
            post_nominals=payload.get("post_nominals", ""),
            affiliation=payload.get("affiliation", ""),
            occupation=payload.get("occupation", ""),
            bio=payload.get("bio", ""),
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
            "username": user.username,
            "limit": ADMIN_ACTIVITY_LIMIT,
            "rows": [_serialize_admin_activity_row(row) for row in rows],
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
        rows = RoleInvitation.objects.select_related("invited_by", "accepted_by").order_by("-created_at")[:50]
        return JsonResponse({"rows": [_serialize_role_invitation(row) for row in rows]})

    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    try:
        email = _clean_email(payload.get("email", ""))
    except ValidationError as exc:
        return JsonResponse({"detail": _validation_detail(exc)}, status=400)
    role = str(payload.get("role", "")).strip().lower()
    first_name = str(payload.get("first_name", "") or "").strip()
    last_name = str(payload.get("last_name", "") or "").strip()
    municipality = str(payload.get("municipality", "") or "").strip()
    notes = str(payload.get("notes", "") or "")

    try:
        invitation = create_email_role_invitation(
            inviter=request.user,
            email=email,
            role=role,
            first_name=first_name,
            last_name=last_name,
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
            "first_name": invitation.first_name,
            "last_name": invitation.last_name,
            "municipality": invitation.municipality,
        }
    )


@require_http_methods(["POST"])
def public_accept_role_invitation_view(request, token):
    payload, parse_error = _parse_json_body(request)
    if parse_error:
        return parse_error

    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    password_confirm = str(payload.get("password_confirm", ""))

    if not username or not password or not password_confirm:
        return JsonResponse({"detail": "Username, password, and confirmation are required."}, status=400)
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

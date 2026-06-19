"""
users/urls.py

User-facing endpoints for:
- public profiles
- onboarding flows (apply/decide/invite)
- gamification and leaderboard feeds
"""

from django.urls import path

from users.views import (
    admin_account_flag_resolution_view,
    admin_consultant_profile_detail_view,
    admin_consultant_profile_view,
    admin_email_role_invitation_view,
    admin_maintenance_toggle_view,
    admin_overview_view,
    admin_role_applications_view,
    admin_user_activity_view,
    admin_user_password_reset_view,
    admin_user_revoke_role_view,
    admin_user_status_view,
    admin_user_suspicious_flag_view,
    admin_users_view,
    auth_csrf_view,
    auth_login_view,
    auth_logout_view,
    auth_me_view,
    auth_password_reset_request_view,
    beta_check_view,
    beta_login_view,
    beta_logout_view,
    create_role_application_view,
    decide_role_application_view,
    dismiss_profile_onboarding_view,
    global_leaderboard_view,
    invite_user_role_view,
    municipality_leaderboard_view,
    municipality_monthly_winners_view,
    municipality_stats_list_view,
    my_profile_view,
    my_role_applications_view,
    notifications_list_view,
    notifications_mark_read_view,
    public_accept_role_invitation_view,
    public_claim_role_access_view,
    public_role_application_status_view,
    public_role_invitation_view,
    public_user_profile_view,
    public_user_suspicious_flag_view,
    site_content_brand_media_view,
    site_content_faq_media_view,
    site_content_partner_media_view,
    site_content_view,
    user_cultural_stewardship_view,
    user_leaderboard_visibility_view,
    user_public_visibility_view,
    user_recognition_events_view,
    verify_profile_email_view,
    yaru_members_view,
)

urlpatterns = [
    path("api/beta/check", beta_check_view, name="beta_check"),
    path("api/beta/login", beta_login_view, name="beta_login"),
    path("api/beta/logout", beta_logout_view, name="beta_logout"),
    path(
        "api/admin/maintenance-toggle",
        admin_maintenance_toggle_view,
        name="admin_maintenance_toggle",
    ),
    path("api/auth/csrf", auth_csrf_view, name="auth_csrf"),
    path("api/auth/login", auth_login_view, name="auth_login"),
    path("api/auth/logout", auth_logout_view, name="auth_logout"),
    path("api/auth/me", auth_me_view, name="auth_me"),
    path(
        "api/auth/password-reset",
        auth_password_reset_request_view,
        name="auth_password_reset_request",
    ),
    path(
        "api/profile/onboarding/dismiss",
        dismiss_profile_onboarding_view,
        name="dismiss_profile_onboarding",
    ),
    path("api/notifications", notifications_list_view, name="notifications_list"),
    path(
        "api/notifications/mark-read", notifications_mark_read_view, name="notifications_mark_read"
    ),
    path("api/site-content", site_content_view, name="site_content"),
    path("api/site-content/faq-media", site_content_faq_media_view, name="site_content_faq_media"),
    path(
        "api/site-content/partner-media",
        site_content_partner_media_view,
        name="site_content_partner_media",
    ),
    path(
        "api/site-content/brand-media",
        site_content_brand_media_view,
        name="site_content_brand_media",
    ),
    path("api/yaru/members", yaru_members_view, name="yaru_members"),
    path("api/profile/my", my_profile_view, name="my_profile"),
    path(
        "api/profile/email/verify/<str:token>",
        verify_profile_email_view,
        name="verify_profile_email",
    ),
    path(
        "api/admin/overview",
        admin_overview_view,
        name="admin_overview",
    ),
    path(
        "api/admin/role-applications",
        admin_role_applications_view,
        name="admin_role_applications",
    ),
    path("api/admin/users", admin_users_view, name="admin_users"),
    path(
        "api/admin/consultant-profiles",
        admin_consultant_profile_view,
        name="admin_consultant_profiles",
    ),
    path(
        "api/admin/consultant-profiles/<str:username>",
        admin_consultant_profile_detail_view,
        name="admin_consultant_profile_detail",
    ),
    path(
        "api/admin/users/<str:username>/activity",
        admin_user_activity_view,
        name="admin_user_activity",
    ),
    path(
        "api/admin/users/<str:username>/status",
        admin_user_status_view,
        name="admin_user_status",
    ),
    path(
        "api/admin/users/<str:username>/password-reset",
        admin_user_password_reset_view,
        name="admin_user_password_reset",
    ),
    path(
        "api/admin/users/<str:username>/roles/revoke",
        admin_user_revoke_role_view,
        name="admin_user_revoke_role",
    ),
    path(
        "api/admin/users/<str:username>/suspicious-flag",
        admin_user_suspicious_flag_view,
        name="admin_user_suspicious_flag",
    ),
    path(
        "api/admin/account-flags/<uuid:action_id>/resolve",
        admin_account_flag_resolution_view,
        name="admin_account_flag_resolution",
    ),
    path(
        "api/users/<str:username>/suspicious-flag",
        public_user_suspicious_flag_view,
        name="public_user_suspicious_flag",
    ),
    path(
        "api/admin/role-invitations/email",
        admin_email_role_invitation_view,
        name="admin_email_role_invitation",
    ),
    path("leaderboard/global", global_leaderboard_view, name="leaderboard_global"),
    path("api/leaderboard/global", global_leaderboard_view, name="api_leaderboard_global"),
    path(
        "leaderboard/municipality",
        municipality_leaderboard_view,
        name="leaderboard_municipality",
    ),
    path(
        "api/leaderboard/municipality",
        municipality_leaderboard_view,
        name="api_leaderboard_municipality",
    ),
    path(
        "api/users/role-applications",
        create_role_application_view,
        name="create_role_application",
    ),
    path(
        "api/users/role-applications/my",
        my_role_applications_view,
        name="my_role_applications",
    ),
    path(
        "api/users/role-applications/status",
        public_role_application_status_view,
        name="public_role_application_status",
    ),
    path(
        "api/users/role-applications/claim-access",
        public_claim_role_access_view,
        name="public_claim_role_access",
    ),
    path(
        "api/users/role-applications/<uuid:application_id>/decide",
        decide_role_application_view,
        name="decide_role_application",
    ),
    path(
        "api/users/role-invitations",
        invite_user_role_view,
        name="invite_user_role",
    ),
    path(
        "api/users/role-invitations/<uuid:token>",
        public_role_invitation_view,
        name="public_role_invitation",
    ),
    path(
        "api/users/role-invitations/<uuid:token>/accept",
        public_accept_role_invitation_view,
        name="public_accept_role_invitation",
    ),
    path(
        "api/users/<str:username>/cultural-stewardship",
        user_cultural_stewardship_view,
        name="user_cultural_stewardship",
    ),
    path(
        "api/users/<str:username>/recognition-events",
        user_recognition_events_view,
        name="user_recognition_events",
    ),
    path(
        "api/users/<str:username>/leaderboard-visibility",
        user_leaderboard_visibility_view,
        name="user_leaderboard_visibility",
    ),
    path(
        "api/users/<str:username>/public-visibility",
        user_public_visibility_view,
        name="user_public_visibility",
    ),
    path(
        "leaderboard/municipalities",
        municipality_stats_list_view,
        name="municipality_stats_list",
    ),
    path(
        "api/leaderboard/municipalities",
        municipality_stats_list_view,
        name="api_municipality_stats_list",
    ),
    path(
        "leaderboard/municipality-winners",
        municipality_monthly_winners_view,
        name="municipality_monthly_winners",
    ),
    path(
        "api/leaderboard/municipality-winners",
        municipality_monthly_winners_view,
        name="api_municipality_monthly_winners",
    ),
    path("api/users/<str:username>", public_user_profile_view, name="public_user_profile"),
]

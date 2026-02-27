"""
users/urls.py

User-facing endpoints for:
- public profiles
- onboarding flows (apply/decide/invite)
- gamification and leaderboard feeds
"""

from django.urls import path

from users.views import (
    create_role_application_view,
    decide_role_application_view,
    global_leaderboard_view,
    invite_user_role_view,
    municipality_stats_list_view,
    my_role_applications_view,
    municipality_leaderboard_view,
    municipality_monthly_winners_view,
    public_user_profile_view,
    user_recognition_events_view,
    user_cultural_stewardship_view,
)


urlpatterns = [
    path("leaderboard/global", global_leaderboard_view, name="leaderboard_global"),
    path(
        "leaderboard/municipality",
        municipality_leaderboard_view,
        name="leaderboard_municipality",
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
        "leaderboard/municipalities",
        municipality_stats_list_view,
        name="municipality_stats_list",
    ),
    path(
        "leaderboard/municipality-winners",
        municipality_monthly_winners_view,
        name="municipality_monthly_winners",
    ),
    path("api/users/<str:username>", public_user_profile_view, name="public_user_profile"),
]

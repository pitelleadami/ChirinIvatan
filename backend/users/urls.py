from django.urls import path

from users.views import (
    global_leaderboard_view,
    municipality_leaderboard_view,
    public_user_profile_view,
)


urlpatterns = [
    path("leaderboard/global", global_leaderboard_view, name="leaderboard_global"),
    path(
        "leaderboard/municipality",
        municipality_leaderboard_view,
        name="leaderboard_municipality",
    ),
    path("api/users/<str:username>", public_user_profile_view, name="public_user_profile"),
]

"""
reviews/urls.py

Review governance endpoints:
- reviewer dashboard
- decision submission
- admin override
"""

from django.urls import path

from reviews.views import (
    admin_archive_entries_view,
    admin_override_view,
    reviewer_dashboard_view,
    submit_dictionary_review_view,
    submit_folklore_review_view,
)


urlpatterns = [
    path("api/reviews/dashboard", reviewer_dashboard_view, name="reviewer_dashboard"),
    path("api/reviews/admin/archive", admin_archive_entries_view, name="admin_archive_entries"),
    path("api/reviews/admin/override", admin_override_view, name="admin_override"),
    path(
        "api/reviews/dictionary/submit",
        submit_dictionary_review_view,
        name="submit_dictionary_review",
    ),
    path(
        "api/reviews/folklore/submit",
        submit_folklore_review_view,
        name="submit_folklore_review",
    ),
]

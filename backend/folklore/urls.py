"""
folklore/urls.py

Folklore API route map.
Includes both revision-centric and legacy entry-centric aliases for compatibility.
"""

from django.urls import path

from folklore.views import (
    create_folklore_entry_view,
    delete_folklore_revision_view,
    folklore_comment_create_view,
    folklore_comment_delete_view,
    folklore_comments_list_view,
    folklore_entries_list_view,
    folklore_entry_detail_view,
    my_folklore_entries_view,
    start_folklore_entry_revision_view,
    start_folklore_variant_view,
    submit_folklore_entry_view,
    update_folklore_draft_view,
    upload_folklore_revision_media_view,
)

urlpatterns = [
    # Canonical endpoints (recommended for new clients)
    path("api/folklore/entries", folklore_entries_list_view, name="folklore_entries_list"),
    path(
        "api/folklore/revisions/my",
        my_folklore_entries_view,
        name="my_folklore_revisions",
    ),
    path(
        "api/folklore/revisions/create",
        create_folklore_entry_view,
        name="create_folklore_revision",
    ),
    path(
        "api/folklore/revisions/<uuid:revision_id>",
        update_folklore_draft_view,
        name="update_folklore_revision_draft",
    ),
    path(
        "api/folklore/revisions/<uuid:revision_id>/submit",
        submit_folklore_entry_view,
        name="submit_folklore_revision",
    ),
    path(
        "api/folklore/revisions/<uuid:revision_id>/media",
        upload_folklore_revision_media_view,
        name="upload_folklore_revision_media",
    ),
    path(
        "api/folklore/revisions/<uuid:revision_id>/delete",
        delete_folklore_revision_view,
        name="delete_folklore_revision",
    ),
    path(
        "api/folklore/entries/my",
        my_folklore_entries_view,
        name="my_folklore_entries",
    ),
    # Backward-compatible aliases retained for existing clients/docs.
    path(
        "api/folklore/entries/create",
        create_folklore_entry_view,
        name="create_folklore_entry",
    ),
    path(
        "api/folklore/entries/<uuid:revision_id>/draft",
        update_folklore_draft_view,
        name="update_folklore_draft",
    ),
    path(
        "api/folklore/entries/<uuid:revision_id>/submit",
        submit_folklore_entry_view,
        name="submit_folklore_entry",
    ),
    path(
        "api/folklore/entries/<uuid:entry_id>/revisions/start",
        start_folklore_entry_revision_view,
        name="start_folklore_entry_revision",
    ),
    path(
        "api/folklore/entries/<uuid:entry_id>/variants/start",
        start_folklore_variant_view,
        name="start_folklore_variant",
    ),
    path(
        "api/folklore/entries/<uuid:entry_id>",
        folklore_entry_detail_view,
        name="folklore_entry_detail",
    ),
    path(
        "api/folklore/entries/<uuid:entry_id>/comments",
        folklore_comments_list_view,
        name="folklore_comments_list",
    ),
    path(
        "api/folklore/entries/<uuid:entry_id>/comments/create",
        folklore_comment_create_view,
        name="folklore_comment_create",
    ),
    path(
        "api/folklore/comments/<uuid:comment_id>/delete",
        folklore_comment_delete_view,
        name="folklore_comment_delete",
    ),
]

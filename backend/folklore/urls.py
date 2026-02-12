from django.urls import path

from folklore.views import (
    create_folklore_entry_view,
    folklore_entries_list_view,
    folklore_entry_detail_view,
    my_folklore_entries_view,
    submit_folklore_entry_view,
    update_folklore_draft_view,
)


urlpatterns = [
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
        "api/folklore/entries/my",
        my_folklore_entries_view,
        name="my_folklore_entries",
    ),
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
        "api/folklore/entries/<uuid:entry_id>",
        folklore_entry_detail_view,
        name="folklore_entry_detail",
    ),
]

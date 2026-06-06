"""
dictionary/urls.py

Dictionary API route map.
Keep path names stable because frontend and docs reference these endpoints.
"""

from django.urls import path

from dictionary.views import (
    create_dictionary_revision_view,
    delete_dictionary_revision_view,
    dictionary_entries_list_view,
    dictionary_english_terms_view,
    dictionary_entry_detail_view,
    my_dictionary_revisions_view,
    start_dictionary_entry_revision_view,
    submit_dictionary_revision_view,
    update_dictionary_revision_view,
)


urlpatterns = [
    path(
        "api/dictionary/entries",
        dictionary_entries_list_view,
        name="dictionary_entries_list",
    ),
    path(
        "api/dictionary/english-terms",
        dictionary_english_terms_view,
        name="dictionary_english_terms",
    ),
    path(
        "api/dictionary/revisions/my",
        my_dictionary_revisions_view,
        name="my_dictionary_revisions",
    ),
    path(
        "api/dictionary/revisions/create",
        create_dictionary_revision_view,
        name="create_dictionary_revision",
    ),
    path(
        "api/dictionary/revisions/<uuid:revision_id>",
        update_dictionary_revision_view,
        name="update_dictionary_revision",
    ),
    path(
        "api/dictionary/revisions/<uuid:revision_id>/submit",
        submit_dictionary_revision_view,
        name="submit_dictionary_revision",
    ),
    path(
        "api/dictionary/revisions/<uuid:revision_id>/delete",
        delete_dictionary_revision_view,
        name="delete_dictionary_revision",
    ),
    path(
        "api/dictionary/entries/<uuid:entry_id>/revisions/start",
        start_dictionary_entry_revision_view,
        name="start_dictionary_entry_revision",
    ),
    path(
        "api/dictionary/entries/<uuid:entry_id>",
        dictionary_entry_detail_view,
        name="dictionary_entry_detail",
    ),
]

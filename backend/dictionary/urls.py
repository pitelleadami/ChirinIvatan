from django.urls import path

from dictionary.views import dictionary_entry_detail_view


urlpatterns = [
    path(
        "api/dictionary/entries/<uuid:entry_id>",
        dictionary_entry_detail_view,
        name="dictionary_entry_detail",
    ),
]

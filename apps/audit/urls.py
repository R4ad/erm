from django.urls import path

from . import views

app_name = "audit"

urlpatterns = [
    path("", views.EventListView.as_view(), name="event_list"),
    path("export/", views.event_export, name="event_export"),
    path("changes/", views.ChangeListView.as_view(), name="change_list"),
]

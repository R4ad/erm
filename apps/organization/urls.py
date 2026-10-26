from django.urls import path

from . import views

app_name = "organization"

urlpatterns = [
    path("", views.OrgUnitListView.as_view(), name="unit_list"),
    path("new/", views.OrgUnitCreateView.as_view(), name="unit_create"),
    path("<int:pk>/edit/", views.OrgUnitUpdateView.as_view(), name="unit_update"),
]

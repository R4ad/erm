from django.urls import path

from . import views

app_name = "methodology"

urlpatterns = [
    path("", views.VersionDetailView.as_view(), name="active"),
    path("<int:number>/", views.VersionDetailView.as_view(), name="version_detail"),
    path("<int:number>/reference/", views.VersionDetailView.as_view(), name="version_reference"),
]

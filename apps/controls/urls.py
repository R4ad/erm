from django.urls import path

from . import views

app_name = "controls"

urlpatterns = [
    path("", views.ControlListView.as_view(), name="control_list"),
    path("new/", views.ControlCreateView.as_view(), name="control_create"),
    path("<int:pk>/", views.ControlDetailView.as_view(), name="control_detail"),
    path("<int:pk>/edit/", views.ControlUpdateView.as_view(), name="control_update"),
    path("<int:pk>/effectiveness/new/", views.ControlAssessmentCreateView.as_view(), name="control_assessment_create"),
    path("effectiveness/<int:pk>/", views.ControlAssessmentDetailView.as_view(), name="control_assessment_detail"),
    path("effectiveness/<int:pk>/edit/", views.ControlAssessmentUpdateView.as_view(), name="control_assessment_update"),
    path("soa/", views.SoaListView.as_view(), name="soa_list"),
    path("soa/<int:pk>/", views.SoaDetailView.as_view(), name="soa_detail"),
    path("soa/<int:pk>/edit/", views.SoaUpdateView.as_view(), name="soa_update"),
]

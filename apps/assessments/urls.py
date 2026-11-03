from django.urls import path

from . import views

app_name = "assessments"

urlpatterns = [
    path("risks/<int:risk_pk>/new/", views.AssessmentCreateView.as_view(), name="assessment_create"),
    path("<int:pk>/", views.AssessmentDetailView.as_view(), name="assessment_detail"),
    path("<int:pk>/edit/", views.AssessmentUpdateView.as_view(), name="assessment_update"),
    path("<int:pk>/impacts/", views.ImpactProfileView.as_view(), name="impact_profile"),
]

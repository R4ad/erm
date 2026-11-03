from django.urls import path

from . import views

app_name = "assessments"

urlpatterns = [
    path("risks/<int:risk_pk>/new/", views.AssessmentCreateView.as_view(), name="assessment_create"),
    path("<int:pk>/", views.AssessmentDetailView.as_view(), name="assessment_detail"),
    path("<int:pk>/edit/", views.AssessmentUpdateView.as_view(), name="assessment_update"),
    path("<int:pk>/impacts/", views.ImpactProfileView.as_view(), name="impact_profile"),
    path("<int:pk>/initiator/", views.InitiatorView.as_view(), name="initiator"),
    path("<int:pk>/submit/", views.SubmitView.as_view(), name="submit"),
    path("<int:pk>/review/", views.ReviewView.as_view(), name="review"),
    path("<int:pk>/referral/", views.ReferralView.as_view(), name="referral"),
    path("<int:pk>/paths/new/", views.PathCreateView.as_view(), name="path_create"),
    path("paths/<int:pk>/edit/", views.PathUpdateView.as_view(), name="path_update"),
    path("paths/<int:pk>/delete/", views.PathDeleteView.as_view(), name="path_delete"),
]

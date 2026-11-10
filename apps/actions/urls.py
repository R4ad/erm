from django.urls import path

from . import views, monitoring_views

app_name = "actions"

urlpatterns = [
    path("notices/", monitoring_views.notice_list, name="notices"),
    path("notices/<int:pk>/read/", monitoring_views.notice_read, name="notice_read"),
    path("risks/<int:risk_pk>/review/new/", monitoring_views.review_create, name="review_create"),
    path("reviews/<int:pk>/", monitoring_views.review_detail, name="review_detail"),
    path("", views.ActionListView.as_view(), name="action_list"),
    path("mine/", views.my_work_view, name="my_work"),
    path("risks/<int:risk_pk>/plan/new/", views.PlanCreateView.as_view(), name="plan_create"),
    path("plans/<int:pk>/", views.PlanDetailView.as_view(), name="plan_detail"),
    path("plans/<int:pk>/edit/", views.PlanUpdateView.as_view(), name="plan_update"),
    path("plans/<int:pk>/approve/", views.PlanApproveView.as_view(), name="plan_approve"),
    path("plans/<int:plan_pk>/actions/new/", views.ActionCreateView.as_view(), name="action_create"),
    path("plans/<int:plan_pk>/reassess/", views.ReassessmentCreateView.as_view(), name="reassessment_create"),
    path("risks/<int:risk_pk>/acceptance/new/", views.AcceptanceCreateView.as_view(), name="acceptance_create"),
    path("acceptances/", views.AcceptanceListView.as_view(), name="acceptance_list"),
    path("acceptances/<int:pk>/", views.AcceptanceDetailView.as_view(), name="acceptance_detail"),
    path("acceptances/<int:pk>/edit/", views.AcceptanceUpdateView.as_view(), name="acceptance_update"),
    path("acceptances/<int:pk>/submit/", views.AcceptanceSubmitView.as_view(), name="acceptance_submit"),
    path("acceptances/<int:pk>/sign/", views.AcceptanceSignView.as_view(), name="acceptance_sign"),
    path("acceptances/<int:pk>/revoke/", views.AcceptanceRevokeView.as_view(), name="acceptance_revoke"),
    path("<int:pk>/", views.ActionDetailView.as_view(), name="action_detail"),
    path("<int:pk>/edit/", views.ActionUpdateView.as_view(), name="action_update"),
    path("<int:pk>/move/", views.ActionMoveView.as_view(), name="action_move"),
]

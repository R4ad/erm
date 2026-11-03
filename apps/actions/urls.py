from django.urls import path

from . import views

app_name = "actions"

urlpatterns = [
    path("", views.ActionListView.as_view(), name="action_list"),
    path("mine/", views.my_work_view, name="my_work"),
    path("risks/<int:risk_pk>/plan/new/", views.PlanCreateView.as_view(), name="plan_create"),
    path("plans/<int:pk>/", views.PlanDetailView.as_view(), name="plan_detail"),
    path("plans/<int:pk>/edit/", views.PlanUpdateView.as_view(), name="plan_update"),
    path("plans/<int:pk>/approve/", views.PlanApproveView.as_view(), name="plan_approve"),
    path("plans/<int:plan_pk>/actions/new/", views.ActionCreateView.as_view(), name="action_create"),
    path("<int:pk>/", views.ActionDetailView.as_view(), name="action_detail"),
    path("<int:pk>/edit/", views.ActionUpdateView.as_view(), name="action_update"),
    path("<int:pk>/move/", views.ActionMoveView.as_view(), name="action_move"),
]

from django.urls import path

from . import views

app_name = "workflow"

urlpatterns = [
    path("risks/<int:risk_pk>/transition/<slug:name>/", views.TransitionView.as_view(), name="transition"),
    path(
        "risks/<int:risk_pk>/requests/<slug:kind>/",
        views.ChangeRequestCreateView.as_view(),
        name="change_request_create",
    ),
    path("requests/", views.ChangeRequestListView.as_view(), name="change_request_list"),
    path("requests/<int:pk>/", views.ChangeRequestDetailView.as_view(), name="change_request_detail"),
    path("questions/", views.QuestionListView.as_view(), name="question_list"),
    path("questions/<int:pk>/answer/", views.QuestionAnswerView.as_view(), name="question_answer"),
]

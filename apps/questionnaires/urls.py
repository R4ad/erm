from django.urls import path

from . import views

app_name = "questionnaires"

urlpatterns = [
    path("", views.AnswerHomeView.as_view(), name="answer_home"),
    path("<int:questionnaire_pk>/respond/", views.ResponseStartView.as_view(), name="response_start"),
    path("manage/", views.QuestionnaireListView.as_view(), name="questionnaire_list"),
    path("manage/new/", views.QuestionnaireCreateView.as_view(), name="questionnaire_create"),
    path("manage/<int:pk>/", views.QuestionnaireDetailView.as_view(), name="questionnaire_detail"),
    path("manage/<int:pk>/edit/", views.QuestionnaireUpdateView.as_view(), name="questionnaire_update"),
    path("manage/<int:questionnaire_pk>/questions/new/", views.QuestionCreateView.as_view(), name="question_create"),
    path("questions/<int:pk>/edit/", views.QuestionUpdateView.as_view(), name="question_update"),
    path("responses/", views.ResponseListView.as_view(), name="response_list"),
    path("responses/<int:pk>/", views.ResponseDetailView.as_view(), name="response_detail"),
    path("responses/<int:pk>/answer/", views.ResponseAnswerView.as_view(), name="response_answer"),
    path("responses/<int:pk>/return/", views.ResponseReturnView.as_view(), name="response_return"),
    path("responses/<int:pk>/reviewed/", views.ResponseMarkReviewedView.as_view(), name="response_reviewed"),
    path("responses/<int:pk>/pending/new/", views.PendingRiskCreateView.as_view(), name="pending_create"),
    path("pending/<int:pk>/convert/", views.PendingRiskConvertView.as_view(), name="pending_convert"),
    path("pending/<int:pk>/dismiss/", views.PendingRiskDismissView.as_view(), name="pending_dismiss"),
]

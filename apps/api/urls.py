from django.urls import path

from . import mywork, questionnaires, risks, session

app_name = "api"

urlpatterns = [
    path("session/", session.SessionView.as_view(), name="session"),
    path("my-work/", mywork.MyWorkView.as_view(), name="my_work"),
    path("risks/", risks.RiskListView.as_view(), name="risk_list"),
    path("risks/filters/", risks.RiskFiltersView.as_view(), name="risk_filters"),
    path("risks/<int:pk>/", risks.RiskDetailView.as_view(), name="risk_detail"),
    path("questionnaires/", questionnaires.AnswerHomeView.as_view(), name="answer_home"),
    path("questionnaires/<int:pk>/start/", questionnaires.ResponseStartView.as_view(), name="response_start"),
    path("responses/<int:pk>/", questionnaires.ResponseDetailView.as_view(), name="response_detail"),
    path("risk-questions/", questionnaires.RiskQuestionListView.as_view(), name="risk_question_list"),
    path(
        "risk-questions/<int:pk>/answer/",
        questionnaires.RiskQuestionAnswerView.as_view(),
        name="risk_question_answer",
    ),
]

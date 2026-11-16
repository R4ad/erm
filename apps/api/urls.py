from django.urls import path

from . import analysis, assessment_workspace, auth, bridge, identification, mywork
from . import questionnaires, reports, risks, session

app_name = "api"

urlpatterns = [
    path("auth/csrf/", auth.CsrfView.as_view(), name="csrf"),
    path("auth/login/", auth.LoginView.as_view(), name="login"),
    path("auth/logout/", auth.LogoutView.as_view(), name="logout"),
    path("session/", session.SessionView.as_view(), name="session"),
    path("forms/", bridge.FormBridgeView.as_view(), name="form_bridge"),
    path("pages/", bridge.PageBridgeView.as_view(), name="page_bridge"),
    path("my-work/", mywork.MyWorkView.as_view(), name="my_work"),
    path("reports/management/", reports.ManagementReportView.as_view(), name="management_report"),
    path("reports/management/export/", reports.ManagementExportView.as_view(), name="management_export"),
    path("risks/", risks.RiskListView.as_view(), name="risk_list"),
    path("risks/filters/", risks.RiskFiltersView.as_view(), name="risk_filters"),
    path("risks/export/", risks.RiskExportView.as_view(), name="risk_export"),
    path("risks/coverage/export/", risks.CoverageExportView.as_view(), name="coverage_export"),
    path("risks/bulk-transition/", risks.RiskBulkTransitionView.as_view(), name="risk_bulk_transition"),
    path("risks/<int:pk>/", risks.RiskDetailView.as_view(), name="risk_detail"),
    path("assessments/", assessment_workspace.AssessmentListView.as_view(), name="assessment_list"),
    path("assessments/candidates/", assessment_workspace.AssessmentCandidatesView.as_view(), name="assessment_candidates"),
    path("assessments/risks/<int:pk>/start/", assessment_workspace.StartAssessmentView.as_view(), name="assessment_start"),
    path("identification/", identification.IdentificationView.as_view(), name="identification"),
    path("analysis/", analysis.AnalysisIndexView.as_view(), name="analysis_index"),
    path("analysis/<int:pk>/", analysis.AnalysisView.as_view(), name="analysis"),
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

from django.urls import path

from . import analysis, assessment_workspace, auth, bridge, evaluation, identification, method_definition, mywork
from . import action_verification, committee, post_action, control_test, monitoring_inbox, org_chart, scenario_library, user_roles
from . import reports, risk_questions, risks, session, treatment, treatment_board, treatment_targets
from . import ad_sync, impact_levels, method_diff, user_profile

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
    path("evaluation/", evaluation.EvaluationView.as_view(), name="evaluation"),
    path("treatment/required/", treatment.ActionRequiredView.as_view(), name="action_required"),
    path("treatment/required/escalate/", treatment.EscalateView.as_view(), name="action_required_escalate"),
    path("treatment/board/", treatment_board.TreatmentBoardView.as_view(), name="treatment_board"),
    path("treatment/targets/", treatment_targets.TargetRisksView.as_view(), name="treatment_targets"),
    path("org/chart/", org_chart.OrgChartView.as_view(), name="org_chart"),
    path("org/ad-sync/", ad_sync.AdSyncView.as_view(), name="ad_sync"),
    path("accounts/roles/", user_roles.UsersRolesView.as_view(), name="users_roles"),
    path("accounts/users/<int:pk>/", user_profile.UserProfileView.as_view(), name="user_profile"),
    path("monitoring/inbox/", monitoring_inbox.MonitoringInboxView.as_view(), name="monitoring_inbox"),
    path("monitoring/inbox/read/", monitoring_inbox.NoticeReadView.as_view(), name="notices_read_all"),
    path("monitoring/inbox/<int:pk>/read/", monitoring_inbox.NoticeReadView.as_view(), name="notice_read"),
    path("monitoring/channels/", monitoring_inbox.NoticeChannelsView.as_view(), name="notice_channels"),
    path("scenarios/library/", scenario_library.ScenarioLibraryView.as_view(), name="scenario_library"),
    path("controls/effectiveness/<int:pk>/test/", control_test.ControlTestView.as_view(), name="control_test"),
    path(
        "actions/<int:pk>/verification/",
        action_verification.ActionVerificationView.as_view(),
        name="action_verification",
    ),
    path("actions/plans/<int:pk>/post-action/", post_action.PostActionView.as_view(), name="post_action"),
    path("committee/meetings/current/", committee.MeetingView.as_view(), name="committee_current"),
    path("committee/meetings/<int:pk>/", committee.MeetingView.as_view(), name="committee_meeting"),
    path("committee/meetings/<int:pk>/close/", committee.MeetingCloseView.as_view(), name="committee_close"),
    path("committee/meetings/<int:pk>/items/", committee.MeetingItemsView.as_view(), name="committee_items"),
    path("committee/items/<int:pk>/<str:action>/", committee.ItemActionView.as_view(), name="committee_item_action"),
    path("scenarios/proposals/", scenario_library.ScenarioProposalView.as_view(), name="scenario_proposals"),
    path(
        "scenarios/proposals/<int:pk>/decide/", scenario_library.ScenarioDecisionView.as_view(), name="scenario_decide"
    ),
    path("method/definition/", method_definition.MethodDefinitionView.as_view(), name="method_definition"),
    path(
        "method/definition/<int:number>/parameters/",
        method_definition.MethodParametersView.as_view(),
        name="method_parameters",
    ),
    path("method/definition/<int:number>/submit/", method_definition.MethodSubmitView.as_view(), name="method_submit"),
    path("method/definition/<int:number>/copy/", method_definition.MethodCopyView.as_view(), name="method_copy"),
    path("method/definition/<int:number>/diff/", method_diff.MethodDiffView.as_view(), name="method_diff"),
    path(
        "method/definition/<int:number>/impact/<str:code>/",
        impact_levels.ImpactLevelsView.as_view(),
        name="impact_levels",
    ),
    path("risk-questions/", risk_questions.RiskQuestionListView.as_view(), name="risk_question_list"),
    path(
        "risk-questions/<int:pk>/answer/",
        risk_questions.RiskQuestionAnswerView.as_view(),
        name="risk_question_answer",
    ),
]

import type { ComponentType } from "react";
import { useLocation, useParams, type RouteObject } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { PageSkeleton } from "@/components/ui/skeleton";
import { RouteError } from "@/features/errors/RouteError";

/** صفحه‌ای که state محلی دارد (پیش‌نویس پاسخ، فرم شروع) با عوض شدن :id از نو ساخته می‌شود، نه با state صفحه‌ی قبلی. */
function keyedById(Page: ComponentType) {
  return function Keyed() {
    const { id } = useParams();
    return <Page key={id} />;
  };
}

/** مثل keyedById برای صفحه‌هایی که نشانی‌شان چند پارامتر دارد (فرم‌ها و پرونده‌ها). */
function keyedByPath(Page: ComponentType) {
  return function Keyed() {
    const { pathname } = useLocation();
    return <Page key={pathname} />;
  };
}

// فرم‌های جنگو که فرم عمومی رابط نشان می‌دهد (apps/api/bridge_pages.py)، با همان نشانی جنگو بدون / آخر.
const FORM_ROUTES = [
  "risks/new",
  "risks/:pk/edit",
  "risks/:risk_pk/links/new",
  "risks/links/:pk/edit",
  "risks/evidence/new",
  "risks/evidence/:pk/edit",
  "risks/scenarios/new",
  "risks/scenarios/:pk/edit",
  "risks/categories/new",
  "risks/categories/:pk/edit",
  "risks/coverage/:service_pk/:category_pk",
  "workflow/risks/:risk_pk/transition/:name",
  "workflow/risks/:risk_pk/requests/:kind",
  "attachments/:content_type/:object_id/new",
  "comments/:pk/edit",
  "assessments/risks/:risk_pk/new",
  "assessments/:pk/edit",
  "assessments/:pk/initiator",
  "assessments/:pk/paths/new",
  "assessments/paths/:pk/edit",
  "actions/risks/:risk_pk/plan/new",
  "actions/plans/:pk/edit",
  "actions/plans/:plan_pk/actions/new",
  "actions/:pk/edit",
  "actions/risks/:risk_pk/acceptance/new",
  "actions/acceptances/:pk/edit",
  "actions/risks/:risk_pk/review/new",
  "questionnaires/manage/new",
  "questionnaires/manage/:pk/edit",
  "questionnaires/responses/:pk/return",
  "questionnaires/responses/:pk/pending/new",
  "questionnaires/pending/:pk/dismiss",
  "controls/new",
  "controls/:pk/edit",
  "controls/:pk/effectiveness/new",
  "controls/effectiveness/:pk/edit",
  "controls/soa/:pk/edit",
  "catalog/customers/new",
  "catalog/customers/:pk/edit",
  "catalog/services/new",
  "catalog/services/:pk/edit",
  "catalog/services/:service_pk/customers/new",
  "catalog/services/customers/:pk/edit",
  "catalog/services/:service_pk/dependencies/new/:kind",
  "catalog/services/dependencies/:pk/edit",
  "catalog/commitments/new",
  "catalog/commitments/:pk/edit",
  "catalog/suppliers/new",
  "catalog/suppliers/:pk/edit",
  "catalog/assets/new",
  "catalog/assets/:pk/edit",
  "units/new",
  "units/:pk/edit",
  "holidays/new",
  "holidays/:pk/edit",
];

const formPage = async () => ({ Component: keyedByPath((await import("@/features/forms/FormPage")).FormPage) });
const questionFormPage = async () => ({
  Component: keyedByPath((await import("@/features/questionnaires/QuestionFormPage")).QuestionFormPage),
});

// هر صفحه بخش جدای کد خودش است و فقط وقتی باز می‌شود دانلود می‌شود.
export const routes: RouteObject[] = [
  {
    path: "/login",
    lazy: async () => ({ Component: (await import("@/features/auth/LoginPage")).LoginPage }),
    errorElement: <RouteError />,
    HydrateFallback: () => null,
  },
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    HydrateFallback: () => null,
    children: [
      {
        errorElement: <RouteError inline />,
        hydrateFallbackElement: <PageSkeleton />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import("@/features/my-work/MyWorkPage")).MyWorkPage }),
          },
          {
            path: "reports",
            lazy: async () => ({
              Component: (await import("@/features/reports/ManagementReportPage")).ManagementReportPage,
            }),
          },
          {
            path: "risks",
            lazy: async () => ({ Component: (await import("@/features/risks/RiskListPage")).RiskListPage }),
          },
          {
            path: "risks/:id",
            lazy: async () => ({ Component: (await import("@/features/risks/RiskDetailPage")).RiskDetailPage }),
          },
          {
            path: "risks/evidence",
            lazy: async () => ({ Component: (await import("@/features/evidence/EvidencePages")).EvidenceListPage }),
          },
          {
            path: "risks/evidence/:id",
            lazy: async () => ({
              Component: keyedById((await import("@/features/evidence/EvidencePages")).EvidenceDetailPage),
            }),
          },
          {
            path: "risks/scenarios",
            lazy: async () => ({ Component: (await import("@/features/scenarios/ScenarioPages")).ScenarioListPage }),
          },
          {
            path: "risks/scenarios/:id",
            lazy: async () => ({
              Component: keyedById((await import("@/features/scenarios/ScenarioPages")).ScenarioDetailPage),
            }),
          },
          {
            path: "risks/categories",
            lazy: async () => ({
              Component: (await import("@/features/categories/CategoryListPage")).CategoryListPage,
            }),
          },
          {
            path: "risks/coverage",
            lazy: async () => ({ Component: (await import("@/features/coverage/CoveragePage")).CoveragePage }),
          },
          {
            path: "workflow/requests",
            lazy: async () => ({
              Component: (await import("@/features/change-requests/ChangeRequestPages")).ChangeRequestListPage,
            }),
          },
          {
            path: "workflow/requests/:id",
            lazy: async () => ({
              Component: keyedById(
                (await import("@/features/change-requests/ChangeRequestPages")).ChangeRequestDetailPage,
              ),
            }),
          },
          {
            path: "assessments",
            lazy: async () => ({
              Component: (await import("@/features/assessments/AssessmentWorkspacePage")).AssessmentWorkspacePage,
            }),
          },
          {
            path: "assessments/new",
            lazy: async () => ({
              Component: (await import("@/features/assessments/AssessmentWorkspacePage")).AssessmentCandidatesPage,
            }),
          },
          {
            path: "assessments/compare",
            lazy: async () => ({ Component: (await import("@/features/assessments/ComparePage")).ComparePage }),
          },
          {
            path: "assessments/:pk",
            lazy: async () => ({
              Component: keyedByPath(
                (await import("@/features/assessments/AssessmentDetailPage")).AssessmentDetailPage,
              ),
            }),
          },
          {
            path: "assessments/:pk/impacts",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/assessments/ImpactProfilePage")).ImpactProfilePage),
            }),
          },
          {
            path: "actions",
            lazy: async () => ({ Component: (await import("@/features/actions/ListPages")).ActionListPage }),
          },
          {
            path: "actions/acceptances",
            lazy: async () => ({ Component: (await import("@/features/actions/ListPages")).AcceptanceListPage }),
          },
          {
            path: "actions/plans/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/actions/PlanDetailPage")).PlanDetailPage),
            }),
          },
          {
            path: "actions/plans/:plan_pk/reassess",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/actions/ReassessmentPage")).ReassessmentPage),
            }),
          },
          {
            path: "actions/acceptances/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/actions/AcceptanceDetailPage")).AcceptanceDetailPage),
            }),
          },
          {
            path: "controls",
            lazy: async () => ({ Component: (await import("@/features/controls/ControlPages")).ControlListPage }),
          },
          {
            path: "controls/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/controls/ControlPages")).ControlDetailPage),
            }),
          },
          {
            path: "controls/effectiveness/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/controls/ControlPages")).ControlAssessmentDetailPage),
            }),
          },
          {
            path: "controls/soa",
            lazy: async () => ({ Component: (await import("@/features/controls/SoaPages")).SoaListPage }),
          },
          {
            path: "controls/soa/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/controls/SoaPages")).SoaDetailPage),
            }),
          },
          {
            path: "catalog/services",
            lazy: async () => ({ Component: (await import("@/features/catalog/ListPages")).ServiceListPage }),
          },
          {
            path: "catalog/services/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/catalog/ServiceDetailPage")).ServiceDetailPage),
            }),
          },
          {
            path: "catalog/commitments",
            lazy: async () => ({ Component: (await import("@/features/catalog/ListPages")).CommitmentListPage }),
          },
          {
            path: "catalog/assets",
            lazy: async () => ({ Component: (await import("@/features/catalog/ListPages")).AssetListPage }),
          },
          {
            path: "catalog/assets/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/catalog/RecordPages")).AssetDetailPage),
            }),
          },
          {
            path: "catalog/suppliers",
            lazy: async () => ({ Component: (await import("@/features/catalog/ListPages")).SupplierListPage }),
          },
          {
            path: "catalog/suppliers/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/catalog/RecordPages")).SupplierDetailPage),
            }),
          },
          {
            path: "catalog/customers",
            lazy: async () => ({ Component: (await import("@/features/catalog/ListPages")).CustomerListPage }),
          },
          {
            path: "units",
            lazy: async () => ({ Component: (await import("@/features/organization/UnitListPage")).UnitListPage }),
          },
          {
            path: "method",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/methodology/MethodPage")).MethodPage),
            }),
          },
          {
            path: "method/:number",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/methodology/MethodPage")).MethodPage),
            }),
          },
          {
            path: "accounts/users",
            lazy: async () => ({ Component: (await import("@/features/admin/UserListPage")).UserListPage }),
          },
          {
            path: "accounts/staff-import",
            lazy: async () => ({ Component: (await import("@/features/admin/StaffImportPage")).StaffImportPage }),
          },
          {
            path: "holidays",
            lazy: async () => ({ Component: (await import("@/features/admin/HolidayListPage")).HolidayListPage }),
          },
          {
            path: "audit",
            lazy: async () => ({ Component: (await import("@/features/admin/AuditPages")).AuditEventListPage }),
          },
          {
            path: "audit/changes",
            lazy: async () => ({ Component: (await import("@/features/admin/AuditPages")).AuditChangeListPage }),
          },
          {
            path: "actions/notices",
            lazy: async () => ({ Component: (await import("@/features/monitoring/MonitoringPages")).NoticeListPage }),
          },
          {
            path: "actions/reviews/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/monitoring/MonitoringPages")).ReviewDetailPage),
            }),
          },
          {
            path: "actions/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/actions/ActionDetailPage")).ActionDetailPage),
            }),
          },
          ...FORM_ROUTES.map((path) => ({ path, lazy: formPage })),
          {
            path: "questionnaires",
            lazy: async () => ({
              Component: (await import("@/features/questionnaires/AnswerHomePage")).AnswerHomePage,
            }),
          },
          {
            path: "questionnaires/risk-questions",
            lazy: async () => ({
              Component: (await import("@/features/questionnaires/RiskQuestionsPage")).RiskQuestionsPage,
            }),
          },
          {
            path: "questionnaires/manage",
            lazy: async () => ({
              Component: (await import("@/features/questionnaires/QuestionnairePages")).QuestionnaireListPage,
            }),
          },
          {
            path: "questionnaires/manage/:pk",
            lazy: async () => ({
              Component: keyedByPath(
                (await import("@/features/questionnaires/QuestionnairePages")).QuestionnaireDetailPage,
              ),
            }),
          },
          {
            path: "questionnaires/manage/:questionnaire_pk/questions/new",
            lazy: questionFormPage,
          },
          {
            path: "questionnaires/questions/:pk/edit",
            lazy: questionFormPage,
          },
          {
            path: "questionnaires/responses",
            lazy: async () => ({
              Component: (await import("@/features/questionnaires/ReviewPages")).ResponseListPage,
            }),
          },
          {
            path: "questionnaires/responses/:pk",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/questionnaires/ReviewPages")).ResponseReviewPage),
            }),
          },
          {
            path: "questionnaires/pending/:pk/convert",
            lazy: async () => ({
              Component: keyedByPath((await import("@/features/questionnaires/PendingConvertPage")).PendingConvertPage),
            }),
          },
          {
            path: "questionnaires/:id/start",
            lazy: async () => ({
              Component: keyedById((await import("@/features/questionnaires/ResponseStartPage")).ResponseStartPage),
            }),
          },
          {
            path: "responses/:id",
            lazy: async () => ({
              Component: keyedById((await import("@/features/questionnaires/ResponseFormPage")).ResponseFormPage),
            }),
          },
          {
            // فرمی که بعداً به جدول پیوندهای سرور اضافه شود، بی‌تغییر این فهرست هم با فرم عمومی باز می‌شود.
            path: "*",
            lazy: async () => ({ Component: (await import("@/features/errors/FallbackPage")).FallbackPage }),
          },
        ],
      },
    ],
  },
];

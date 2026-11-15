// داده‌ی آزمون، فقط برای Vitest و Playwright. هیچ صفحه‌ای از برنامه این فایل را نمی‌خواند و رابط همیشه داده را از
// API جنگو می‌گیرد. شکل هر جواب همان شکل apps/api است (lib/types.ts) و نام‌ها عمداً «آزمون» دارند تا با داده‌ی
// واقعی اشتباه نشوند. هر تابع نسخه‌ی تازه می‌سازد تا تغییر یک آزمون به آزمون دیگر نرسد.

import type {
  AcceptanceDetail,
  AcceptanceList,
  AcceptanceRow,
  ActionDetail,
  ActionList,
  ActionRow,
  AnswerHome,
  AssessmentDetail,
  AssetDetail,
  AssetList,
  AuditChangeList,
  AuditEventList,
  ChangeDetail,
  CommitmentList,
  ComparePage,
  ControlAssessmentDetail,
  ControlDetail,
  ControlList,
  CoverageCell,
  CoveragePage,
  CsrfState,
  CustomerList,
  EvidenceDetail,
  EvidenceList,
  EvidenceRow,
  FormField,
  FormPageData,
  FormSchema,
  HolidayList,
  ImpactRow,
  Level,
  MethodPage,
  ManagementReport,
  MyWork,
  WorkTask,
  NoticeList,
  PlanDetail,
  QuestionnaireDetail,
  QuestionnaireList,
  ResponseDetail,
  ResponseReview,
  ReviewDetail,
  ReviewList,
  RiskBrief,
  RiskDetail,
  RiskFilters,
  RiskPage,
  RiskQuestion,
  RiskRow,
  RouteEntry,
  ServiceDetail,
  ServiceList,
  Session,
  SoaDetail,
  SoaList,
  StaffImportResult,
  StartForm,
  SupplierDetail,
  SupplierList,
  UnitList,
  UserList,
} from "../lib/types";

export const levels = {
  critical: { rank: 4, name: "بحرانی", color: "#dc3545", text_color: "#fff" },
  high: { rank: 3, name: "بالا", color: "#fd7e14", text_color: "#000" },
  medium: { rank: 2, name: "متوسط", color: "#ffc107", text_color: "#000" },
  low: { rank: 1, name: "پایین", color: "#198754", text_color: "#fff" },
} satisfies Record<string, Level>;

const today = { iso: "2026-11-04", jalali: "1405/08/13", weekday: "چهارشنبه" };
const tester = { id: 3, name: "کاربر آزمون" };
const reviewer = { id: 1, name: "بازبین آزمون" };

/** همان جدول پیوندهای apps/api/routes.py (route_table) در زمان نوشتن آزمون‌ها. */
export const routeTable: RouteEntry[] = [
  { name: "actions:my_work", pattern: "^/actions/mine/$", route: "/", form: false },
  { name: "questionnaires:answer_home", pattern: "^/questionnaires/$", route: "/questionnaires", form: false },
  {
    name: "questionnaires:response_start",
    pattern: "^/questionnaires/(?<questionnaire_pk>[0-9]+)/respond/$",
    route: "/questionnaires/:questionnaire_pk/start",
    form: false,
  },
  {
    name: "questionnaires:response_answer",
    pattern: "^/questionnaires/responses/(?<pk>[0-9]+)/answer/$",
    route: "/responses/:pk",
    form: false,
  },
  { name: "assessments:assessment_list", pattern: "^/assessments/$", route: "/assessments", form: false },
  { name: "assessments:candidates", pattern: "^/assessments/new/$", route: "/assessments/new", form: false },
  {
    name: "workflow:question_list",
    pattern: "^/workflow/questions/$",
    route: "/questionnaires/risk-questions",
    form: false,
  },
  { name: "risks:risk_list", pattern: "^/risks/$", route: "/risks", form: false },
  { name: "risks:risk_detail", pattern: "^/risks/(?<pk>[0-9]+)/$", route: "/risks/:pk", form: false },
  { name: "risks:evidence_list", pattern: "^/risks/evidence/$", route: "/risks/evidence", form: false },
  {
    name: "risks:evidence_detail",
    pattern: "^/risks/evidence/(?<pk>[0-9]+)/$",
    route: "/risks/evidence/:pk",
    form: false,
  },
  { name: "risks:scenario_list", pattern: "^/risks/scenarios/$", route: "/risks/scenarios", form: false },
  {
    name: "risks:scenario_detail",
    pattern: "^/risks/scenarios/(?<pk>[0-9]+)/$",
    route: "/risks/scenarios/:pk",
    form: false,
  },
  { name: "risks:category_list", pattern: "^/risks/categories/$", route: "/risks/categories", form: false },
  { name: "risks:coverage", pattern: "^/risks/coverage/$", route: "/risks/coverage", form: false },
  { name: "workflow:change_request_list", pattern: "^/workflow/requests/$", route: "/workflow/requests", form: false },
  {
    name: "workflow:change_request_detail",
    pattern: "^/workflow/requests/(?<pk>[0-9]+)/$",
    route: "/workflow/requests/:pk",
    form: false,
  },
  {
    name: "assessments:assessment_detail",
    pattern: "^/assessments/(?<pk>[0-9]+)/$",
    route: "/assessments/:pk",
    form: false,
  },
  { name: "assessments:compare", pattern: "^/assessments/compare/$", route: "/assessments/compare", form: false },
  { name: "actions:action_list", pattern: "^/actions/$", route: "/actions", form: false },
  { name: "actions:acceptance_list", pattern: "^/actions/acceptances/$", route: "/actions/acceptances", form: false },
  { name: "actions:plan_detail", pattern: "^/actions/plans/(?<pk>[0-9]+)/$", route: "/actions/plans/:pk", form: false },
  { name: "actions:action_detail", pattern: "^/actions/(?<pk>[0-9]+)/$", route: "/actions/:pk", form: false },
  {
    name: "actions:acceptance_detail",
    pattern: "^/actions/acceptances/(?<pk>[0-9]+)/$",
    route: "/actions/acceptances/:pk",
    form: false,
  },
  { name: "actions:notices", pattern: "^/actions/notices/$", route: "/actions/notices", form: false },
  {
    name: "actions:review_detail",
    pattern: "^/actions/reviews/(?<pk>[0-9]+)/$",
    route: "/actions/reviews/:pk",
    form: false,
  },
  {
    name: "questionnaires:questionnaire_list",
    pattern: "^/questionnaires/manage/$",
    route: "/questionnaires/manage",
    form: false,
  },
  {
    name: "questionnaires:questionnaire_detail",
    pattern: "^/questionnaires/manage/(?<pk>[0-9]+)/$",
    route: "/questionnaires/manage/:pk",
    form: false,
  },
  {
    name: "questionnaires:response_list",
    pattern: "^/questionnaires/responses/$",
    route: "/questionnaires/responses",
    form: false,
  },
  {
    name: "questionnaires:response_detail",
    pattern: "^/questionnaires/responses/(?<pk>[0-9]+)/$",
    route: "/questionnaires/responses/:pk",
    form: false,
  },
  { name: "controls:control_list", pattern: "^/controls/$", route: "/controls", form: false },
  { name: "controls:control_detail", pattern: "^/controls/(?<pk>[0-9]+)/$", route: "/controls/:pk", form: false },
  {
    name: "controls:control_assessment_detail",
    pattern: "^/controls/effectiveness/(?<pk>[0-9]+)/$",
    route: "/controls/effectiveness/:pk",
    form: false,
  },
  { name: "controls:soa_list", pattern: "^/controls/soa/$", route: "/controls/soa", form: false },
  { name: "controls:soa_detail", pattern: "^/controls/soa/(?<pk>[0-9]+)/$", route: "/controls/soa/:pk", form: false },
  { name: "catalog:customer_list", pattern: "^/catalog/customers/$", route: "/catalog/customers", form: false },
  { name: "catalog:service_list", pattern: "^/catalog/services/$", route: "/catalog/services", form: false },
  {
    name: "catalog:service_detail",
    pattern: "^/catalog/services/(?<pk>[0-9]+)/$",
    route: "/catalog/services/:pk",
    form: false,
  },
  { name: "catalog:supplier_list", pattern: "^/catalog/suppliers/$", route: "/catalog/suppliers", form: false },
  {
    name: "catalog:supplier_detail",
    pattern: "^/catalog/suppliers/(?<pk>[0-9]+)/$",
    route: "/catalog/suppliers/:pk",
    form: false,
  },
  { name: "catalog:asset_list", pattern: "^/catalog/assets/$", route: "/catalog/assets", form: false },
  {
    name: "catalog:asset_detail",
    pattern: "^/catalog/assets/(?<pk>[0-9]+)/$",
    route: "/catalog/assets/:pk",
    form: false,
  },
  { name: "catalog:commitment_list", pattern: "^/catalog/commitments/$", route: "/catalog/commitments", form: false },
  { name: "organization:unit_list", pattern: "^/units/$", route: "/units", form: false },
  { name: "methodology:active", pattern: "^/method/$", route: "/method", form: false },
  {
    name: "methodology:version_detail",
    pattern: "^/method/(?<number>[0-9]+)/$",
    route: "/method/:number",
    form: false,
  },
  { name: "accounts:user_list", pattern: "^/accounts/users/$", route: "/accounts/users", form: false },
  { name: "workcalendar:holiday_list", pattern: "^/holidays/$", route: "/holidays", form: false },
  { name: "audit:event_list", pattern: "^/audit/$", route: "/audit", form: false },
  { name: "audit:change_list", pattern: "^/audit/changes/$", route: "/audit/changes", form: false },
  { name: "risks:risk_create", pattern: "^/risks/new/$", route: "/risks/new", form: true },
  { name: "risks:risk_update", pattern: "^/risks/(?<pk>[0-9]+)/edit/$", route: "/risks/:pk/edit", form: true },
  {
    name: "risks:link_create",
    pattern: "^/risks/(?<risk_pk>[0-9]+)/links/new/$",
    route: "/risks/:risk_pk/links/new",
    form: true,
  },
  {
    name: "risks:link_update",
    pattern: "^/risks/links/(?<pk>[0-9]+)/edit/$",
    route: "/risks/links/:pk/edit",
    form: true,
  },
  { name: "risks:evidence_create", pattern: "^/risks/evidence/new/$", route: "/risks/evidence/new", form: true },
  {
    name: "risks:evidence_update",
    pattern: "^/risks/evidence/(?<pk>[0-9]+)/edit/$",
    route: "/risks/evidence/:pk/edit",
    form: true,
  },
  { name: "risks:scenario_create", pattern: "^/risks/scenarios/new/$", route: "/risks/scenarios/new", form: true },
  {
    name: "risks:scenario_update",
    pattern: "^/risks/scenarios/(?<pk>[0-9]+)/edit/$",
    route: "/risks/scenarios/:pk/edit",
    form: true,
  },
  { name: "risks:category_create", pattern: "^/risks/categories/new/$", route: "/risks/categories/new", form: true },
  {
    name: "risks:category_update",
    pattern: "^/risks/categories/(?<pk>[0-9]+)/edit/$",
    route: "/risks/categories/:pk/edit",
    form: true,
  },
  {
    name: "risks:coverage_update",
    pattern: "^/risks/coverage/(?<service_pk>[0-9]+)/(?<category_pk>[0-9]+)/$",
    route: "/risks/coverage/:service_pk/:category_pk",
    form: true,
  },
  {
    name: "workflow:transition",
    pattern: "^/workflow/risks/(?<risk_pk>[0-9]+)/transition/(?<name>[-a-zA-Z0-9_]+)/$",
    route: "/workflow/risks/:risk_pk/transition/:name",
    form: true,
  },
  {
    name: "workflow:change_request_create",
    pattern: "^/workflow/risks/(?<risk_pk>[0-9]+)/requests/(?<kind>[-a-zA-Z0-9_]+)/$",
    route: "/workflow/risks/:risk_pk/requests/:kind",
    form: true,
  },
  {
    name: "core:attachment_upload",
    pattern: "^/attachments/(?<content_type>[0-9]+)/(?<object_id>[0-9]+)/new/$",
    route: "/attachments/:content_type/:object_id/new",
    form: true,
  },
  { name: "core:comment_update", pattern: "^/comments/(?<pk>[0-9]+)/edit/$", route: "/comments/:pk/edit", form: true },
  {
    name: "assessments:assessment_create",
    pattern: "^/assessments/risks/(?<risk_pk>[0-9]+)/new/$",
    route: "/assessments/risks/:risk_pk/new",
    form: true,
  },
  {
    name: "assessments:assessment_update",
    pattern: "^/assessments/(?<pk>[0-9]+)/edit/$",
    route: "/assessments/:pk/edit",
    form: true,
  },
  {
    name: "assessments:initiator",
    pattern: "^/assessments/(?<pk>[0-9]+)/initiator/$",
    route: "/assessments/:pk/initiator",
    form: true,
  },
  {
    name: "assessments:path_create",
    pattern: "^/assessments/(?<pk>[0-9]+)/paths/new/$",
    route: "/assessments/:pk/paths/new",
    form: true,
  },
  {
    name: "assessments:path_update",
    pattern: "^/assessments/paths/(?<pk>[0-9]+)/edit/$",
    route: "/assessments/paths/:pk/edit",
    form: true,
  },
  {
    name: "assessments:impact_profile",
    pattern: "^/assessments/(?<pk>[0-9]+)/impacts/$",
    route: "/assessments/:pk/impacts",
    form: true,
  },
  {
    name: "actions:plan_create",
    pattern: "^/actions/risks/(?<risk_pk>[0-9]+)/plan/new/$",
    route: "/actions/risks/:risk_pk/plan/new",
    form: true,
  },
  {
    name: "actions:plan_update",
    pattern: "^/actions/plans/(?<pk>[0-9]+)/edit/$",
    route: "/actions/plans/:pk/edit",
    form: true,
  },
  {
    name: "actions:action_create",
    pattern: "^/actions/plans/(?<plan_pk>[0-9]+)/actions/new/$",
    route: "/actions/plans/:plan_pk/actions/new",
    form: true,
  },
  { name: "actions:action_update", pattern: "^/actions/(?<pk>[0-9]+)/edit/$", route: "/actions/:pk/edit", form: true },
  {
    name: "actions:acceptance_create",
    pattern: "^/actions/risks/(?<risk_pk>[0-9]+)/acceptance/new/$",
    route: "/actions/risks/:risk_pk/acceptance/new",
    form: true,
  },
  {
    name: "actions:acceptance_update",
    pattern: "^/actions/acceptances/(?<pk>[0-9]+)/edit/$",
    route: "/actions/acceptances/:pk/edit",
    form: true,
  },
  {
    name: "actions:reassessment_create",
    pattern: "^/actions/plans/(?<plan_pk>[0-9]+)/reassess/$",
    route: "/actions/plans/:plan_pk/reassess",
    form: true,
  },
  {
    name: "actions:review_create",
    pattern: "^/actions/risks/(?<risk_pk>[0-9]+)/review/new/$",
    route: "/actions/risks/:risk_pk/review/new",
    form: true,
  },
  {
    name: "questionnaires:questionnaire_create",
    pattern: "^/questionnaires/manage/new/$",
    route: "/questionnaires/manage/new",
    form: true,
  },
  {
    name: "questionnaires:questionnaire_update",
    pattern: "^/questionnaires/manage/(?<pk>[0-9]+)/edit/$",
    route: "/questionnaires/manage/:pk/edit",
    form: true,
  },
  {
    name: "questionnaires:question_create",
    pattern: "^/questionnaires/manage/(?<questionnaire_pk>[0-9]+)/questions/new/$",
    route: "/questionnaires/manage/:questionnaire_pk/questions/new",
    form: true,
  },
  {
    name: "questionnaires:question_update",
    pattern: "^/questionnaires/questions/(?<pk>[0-9]+)/edit/$",
    route: "/questionnaires/questions/:pk/edit",
    form: true,
  },
  {
    name: "questionnaires:response_return",
    pattern: "^/questionnaires/responses/(?<pk>[0-9]+)/return/$",
    route: "/questionnaires/responses/:pk/return",
    form: true,
  },
  {
    name: "questionnaires:pending_create",
    pattern: "^/questionnaires/responses/(?<pk>[0-9]+)/pending/new/$",
    route: "/questionnaires/responses/:pk/pending/new",
    form: true,
  },
  {
    name: "questionnaires:pending_convert",
    pattern: "^/questionnaires/pending/(?<pk>[0-9]+)/convert/$",
    route: "/questionnaires/pending/:pk/convert",
    form: true,
  },
  {
    name: "questionnaires:pending_dismiss",
    pattern: "^/questionnaires/pending/(?<pk>[0-9]+)/dismiss/$",
    route: "/questionnaires/pending/:pk/dismiss",
    form: true,
  },
  { name: "controls:control_create", pattern: "^/controls/new/$", route: "/controls/new", form: true },
  {
    name: "controls:control_update",
    pattern: "^/controls/(?<pk>[0-9]+)/edit/$",
    route: "/controls/:pk/edit",
    form: true,
  },
  {
    name: "controls:control_assessment_create",
    pattern: "^/controls/(?<pk>[0-9]+)/effectiveness/new/$",
    route: "/controls/:pk/effectiveness/new",
    form: true,
  },
  {
    name: "controls:control_assessment_update",
    pattern: "^/controls/effectiveness/(?<pk>[0-9]+)/edit/$",
    route: "/controls/effectiveness/:pk/edit",
    form: true,
  },
  {
    name: "controls:soa_update",
    pattern: "^/controls/soa/(?<pk>[0-9]+)/edit/$",
    route: "/controls/soa/:pk/edit",
    form: true,
  },
  {
    name: "catalog:customer_create",
    pattern: "^/catalog/customers/new/$",
    route: "/catalog/customers/new",
    form: true,
  },
  {
    name: "catalog:customer_update",
    pattern: "^/catalog/customers/(?<pk>[0-9]+)/edit/$",
    route: "/catalog/customers/:pk/edit",
    form: true,
  },
  { name: "catalog:service_create", pattern: "^/catalog/services/new/$", route: "/catalog/services/new", form: true },
  {
    name: "catalog:service_update",
    pattern: "^/catalog/services/(?<pk>[0-9]+)/edit/$",
    route: "/catalog/services/:pk/edit",
    form: true,
  },
  {
    name: "catalog:service_customer_create",
    pattern: "^/catalog/services/(?<service_pk>[0-9]+)/customers/new/$",
    route: "/catalog/services/:service_pk/customers/new",
    form: true,
  },
  {
    name: "catalog:service_customer_update",
    pattern: "^/catalog/services/customers/(?<pk>[0-9]+)/edit/$",
    route: "/catalog/services/customers/:pk/edit",
    form: true,
  },
  {
    name: "catalog:dependency_create",
    pattern: "^/catalog/services/(?<service_pk>[0-9]+)/dependencies/new/(?<kind>[^/]+)/$",
    route: "/catalog/services/:service_pk/dependencies/new/:kind",
    form: true,
  },
  {
    name: "catalog:dependency_update",
    pattern: "^/catalog/services/dependencies/(?<pk>[0-9]+)/edit/$",
    route: "/catalog/services/dependencies/:pk/edit",
    form: true,
  },
  {
    name: "catalog:commitment_create",
    pattern: "^/catalog/commitments/new/$",
    route: "/catalog/commitments/new",
    form: true,
  },
  {
    name: "catalog:commitment_update",
    pattern: "^/catalog/commitments/(?<pk>[0-9]+)/edit/$",
    route: "/catalog/commitments/:pk/edit",
    form: true,
  },
  {
    name: "catalog:supplier_create",
    pattern: "^/catalog/suppliers/new/$",
    route: "/catalog/suppliers/new",
    form: true,
  },
  {
    name: "catalog:supplier_update",
    pattern: "^/catalog/suppliers/(?<pk>[0-9]+)/edit/$",
    route: "/catalog/suppliers/:pk/edit",
    form: true,
  },
  { name: "catalog:asset_create", pattern: "^/catalog/assets/new/$", route: "/catalog/assets/new", form: true },
  {
    name: "catalog:asset_update",
    pattern: "^/catalog/assets/(?<pk>[0-9]+)/edit/$",
    route: "/catalog/assets/:pk/edit",
    form: true,
  },
  { name: "organization:unit_create", pattern: "^/units/new/$", route: "/units/new", form: true },
  { name: "organization:unit_update", pattern: "^/units/(?<pk>[0-9]+)/edit/$", route: "/units/:pk/edit", form: true },
  { name: "workcalendar:holiday_create", pattern: "^/holidays/new/$", route: "/holidays/new", form: true },
  {
    name: "workcalendar:holiday_update",
    pattern: "^/holidays/(?<pk>[0-9]+)/edit/$",
    route: "/holidays/:pk/edit",
    form: true,
  },
  { name: "accounts:staff_import", pattern: "^/accounts/staff-import/$", route: "/accounts/staff-import", form: true },
];

export function csrf(authenticated = false): CsrfState {
  return { csrf_token: "test-csrf-token", authenticated };
}

export function session(): Session {
  return {
    user: { ...tester, username: "tester", roles: ["مدیر واحد"], job_title: "نقش آزمون", org_unit: "واحد آزمون" },
    today,
    navigation: {
      desk: {
        title: "میز کار",
        items: [
          { key: "actions:my_work", label: "کارهای من", href: "/actions/mine/", route: "/", count: null, tone: null },
          { key: "risks:risk_list", label: "رجیستر ریسک", href: "/risks/", route: "/risks", count: null, tone: null },
          {
            key: "actions:notices",
            label: "اعلان‌های پایش",
            href: "/actions/notices/",
            route: "/actions/notices",
            count: 3,
            tone: "gold",
          },
          {
            key: "reports:management",
            label: "گزارش مدیریتی",
            href: "/reports/",
            route: null,
            count: null,
            tone: null,
          },
        ],
      },
      modules: [
        {
          key: "assessment",
          title: "ارزیابی ریسک",
          items: [
            {
              key: "module:identification",
              label: "شناسایی ریسک",
              href: "/app/identification",
              route: "/identification",
              count: null,
              tone: null,
            },
            {
              key: "module:analysis",
              label: "آنالیز ریسک",
              href: "/app/analysis",
              route: "/analysis",
              count: null,
              tone: null,
            },
            {
              key: "module:evaluation",
              label: "سنجش ریسک",
              href: "/app/evaluation",
              route: "/evaluation",
              count: null,
              tone: null,
            },
          ],
        },
        {
          key: "treatment",
          title: "برطرف‌سازی ریسک",
          items: [
            {
              key: "module:action_required",
              label: "ریسک‌های نیازمند اقدام",
              href: "/app/treatment/required",
              route: "/treatment/required",
              count: 12,
              tone: "red",
            },
            {
              key: "module:in_treatment",
              label: "ریسک‌های در حال درمان",
              href: "/app/treatment/board",
              route: "/treatment/board",
              count: 8,
              tone: "gold",
            },
            {
              key: "module:targets",
              label: "لیست ریسک‌های هدف",
              href: "/app/treatment/targets",
              route: "/treatment/targets",
              count: null,
              tone: null,
            },
          ],
        },
        {
          key: "config",
          title: "پیکربندی سامانه",
          items: [
            {
              key: "methodology:active",
              label: "تعریف متدولوژی",
              href: "/method/",
              route: "/method",
              count: null,
              tone: null,
            },
            {
              key: "organization:unit_list",
              label: "چارت سازمانی",
              href: "/units/",
              route: "/units",
              count: null,
              tone: null,
            },
          ],
        },
      ],
    },
    cycle: { year: 1405, assessed: 24, total: 35 },
    method: { number: 1, title: "روش v5", route: "/method" },
    routes: routeTable,
    logout_url: "/api/auth/logout/",
    classic_home: "/",
    csrf_token: "test-csrf-token",
  };
}

/** API بخش خالی را نمی‌فرستد؛ پس این‌جا هم هر بخش دست‌کم یک مورد دارد. */
export function myWork(): MyWork {
  const risk = { id: 2, code: "RK-1405-0002", title: "ریسک آزمون دوم" };
  const task = (overrides: Partial<WorkTask> & Pick<WorkTask, "key" | "category" | "title">): WorkTask => ({
    kind: "اقدام",
    context: risk.title,
    code: "TR-1405-0002",
    href: "/actions/2/",
    route: null,
    icon: "check-square",
    tone: "brand",
    cta: "ثبت پیشرفت",
    cta_style: "primary",
    level: null,
    due: null,
    due_text: null,
    no_due: "بدون مهلت",
    ...overrides,
  });
  return {
    today,
    first_name: "کاربر",
    kpis: {
      waiting: { count: 3, note: "۲ اقدام · ۱ بررسی" },
      due_today: { count: 0, note: "امروز سررسیدی ندارید" },
      overdue: { count: 1, note: "قدیمی‌ترین: ۳ روز تأخیر" },
      to_verify: { count: 0, note: "به‌عنوان تأییدکننده‌ی اقدام" },
    },
    categories: [
      { key: "actions", label: "اقدام‌ها", count: 2 },
      { key: "signoff", label: "امضا و تأیید", count: 0 },
      { key: "assessments", label: "ارزیابی‌ها", count: 0 },
      { key: "questions", label: "پرسش‌ها", count: 1 },
      { key: "acceptances", label: "پذیرش‌ها", count: 0 },
    ],
    tasks: [
      task({
        key: "action-2",
        category: "actions",
        title: "اقدام آزمون عقب‌افتاده",
        tone: "danger",
        due: { iso: "2026-11-01", jalali: "1405/08/10", days_left: -3, overdue: true },
      }),
      task({
        key: "question-4",
        category: "questions",
        title: "پاسخ به پرسش ریسک: پرسش آزمون درباره‌ی پایش",
        kind: "پرسش ریسک",
        context: "واحد آزمون",
        code: "RK-1405-0003",
        href: "/workflow/questions/4/answer/",
        route: "/questionnaires/risk-questions",
        icon: "chat",
        tone: "neutral",
        cta: "پاسخ",
        cta_style: "secondary",
        level: levels.high,
        due: { iso: "2026-11-06", jalali: "1405/08/15", days_left: 2, overdue: false },
      }),
      task({
        key: "action-3",
        category: "actions",
        title: "اقدام آزمون نزدیک مهلت",
        code: "TR-1405-0003",
        href: "/actions/3/",
        due: { iso: "2026-11-09", jalali: "1405/08/18", days_left: 5, overdue: false },
      }),
    ],
    plans: [
      {
        key: "plan-risk-2",
        code: risk.code,
        title: risk.title,
        level: levels.high,
        note: "مهلت طرح: ۱ روز کاری",
        state: "بدون طرح",
        tone: "danger",
        route: "/risks/2",
      },
    ],
    acceptances: [
      {
        key: "acc-1",
        code: "AC-1405-0001",
        risk_code: risk.code,
        owner: "کاربر آزمون",
        label: "منقضی‌شده",
        tone: "danger",
        route: "/actions/acceptances/1",
      },
    ],
    sections: [
      {
        key: "my_actions",
        title: "اقدام‌های من",
        hint: "اقدام‌هایی که مالک یا مجری آن‌ها هستید.",
        items: [
          {
            key: "action-2",
            label: "TR-1405-0002 اقدام آزمون عقب‌افتاده",
            href: "/actions/2/",
            route: null,
            risk,
            level: null,
            due: { iso: "2026-11-01", jalali: "1405/08/10", days_left: -3, overdue: true },
            status: "در اجرا",
            meta: "مالک کاربر آزمون",
          },
          {
            key: "action-3",
            label: "TR-1405-0003 اقدام آزمون نزدیک مهلت",
            href: "/actions/3/",
            route: null,
            risk,
            level: null,
            due: { iso: "2026-11-09", jalali: "1405/08/18", days_left: 5, overdue: false },
            status: "در اجرا",
            meta: null,
          },
        ],
      },
      {
        key: "questions",
        title: "پرسش‌های ریسک منتظر جواب",
        hint: "عضو GRC این‌ها را پرسیده است.",
        items: [
          {
            key: "question-4",
            label: "پرسش آزمون درباره‌ی پایش",
            href: "/workflow/questions/4/answer/",
            route: "/questionnaires/risk-questions",
            risk: { id: 3, code: "RK-1405-0003", title: "ریسک آزمون سوم" },
            level: levels.high,
            due: { iso: "2026-11-06", jalali: "1405/08/15", days_left: 2, overdue: false },
            status: null,
            meta: null,
          },
        ],
      },
    ],
  };
}

/** داده‌ی صفحه‌ی گزارش مدیریتی، به همان شکل apps/api/reports.py. */
export function managementReport(months = 6): ManagementReport {
  const cell = (likelihood: number, impact: number) => {
    const score = likelihood * impact;
    const level = score >= 16 ? levels.critical : score >= 10 ? levels.high : score >= 5 ? levels.medium : levels.low;
    const count = likelihood === 4 && impact === 5 ? 2 : likelihood === 3 && impact === 3 ? 1 : 0;
    return { impact, count, level };
  };
  return {
    today,
    months,
    periods: [1, 3, 6, 12],
    start: { iso: "2026-05-15", jalali: "1405/02/25" },
    kpis: {
      active: { count: 16, note: "۷ هنوز ارزیابی جاری تأییدشده ندارند" },
      critical: { count: 2, note: "۱ ریسک هنوز طرح مواجهه ندارند" },
      high: { count: 2, note: "۰ پذیرش موقت و استثنایی" },
      coverage: { percent: 50, note: "۳ از ۶ خدمت حیاتی · شرط: ارزیابی جاری کامل" },
      key_controls: { percent: null, note: "۰ از ۰ کنترل کلیدی مرتبط با مسیرها" },
    },
    distribution: [
      { level: levels.critical, label: "بحرانی", count: 2, delta: 0, up_is_good: false },
      { level: levels.high, label: "بالا", count: 2, delta: 0, up_is_good: false },
      { level: levels.medium, label: "متوسط", count: 4, delta: 3, up_is_good: false },
      { level: levels.low, label: "پایین", count: 1, delta: 0, up_is_good: true },
      { level: null, label: "ارزیابی‌نشده", count: 7, delta: -3, up_is_good: false },
    ],
    matrix: {
      rows: [5, 4, 3, 2, 1].map((likelihood) => ({
        likelihood,
        cells: [1, 2, 3, 4, 5].map((impact) => cell(likelihood, impact)),
      })),
      unassessed: 7,
    },
    overdue: [
      {
        key: "action-28",
        code: "TR-1405-0009",
        title: "ثبت جلسه‌های ممتاز و بازبینی هفتگی",
        level: levels.critical,
        owner: "کاربر آزمون",
        service: "خدمت آزمون",
        days: 3,
        route: "/actions/28",
      },
    ],
    acceptances: [
      { key: "expired", label: "منقضی‌شده", icon: "clock", tone: "danger", count: 1, route: "/actions/acceptances" },
      {
        key: "unsigned",
        label: "فاقد امضای لازم",
        icon: "signature",
        tone: "warning",
        count: 1,
        route: "/actions/acceptances",
      },
    ],
    changes: [
      {
        key: "change-9",
        code: "RK-1405-0004",
        title: "ریسک آزمون چهارم",
        before: levels.high,
        after: levels.medium,
        reason: { label: "پس از اقدام", tone: "success" },
        route: "/risks/4",
      },
    ],
    concentration: [{ key: "dep-0", target: "شبکه‌ی مرکزی", risks: 7, services: 5, shared: false }],
  };
}

function riskRow(id: number, overrides: Partial<RiskRow> = {}): RiskRow {
  return {
    id,
    code: `RK-1405-${String(id).padStart(4, "0")}`,
    title: `ریسک آزمون شماره‌ی ${id}`,
    status: { value: "assessment", label: "در ارزیابی" },
    is_active: true,
    needs_completion: false,
    level: levels.medium,
    category: { code: "T1", name: "دسته‌ی آزمون" },
    service: { code: "IPG", name: "خدمت آزمون" },
    org_unit: "واحد آزمون",
    owner: tester,
    channel: { value: "interview", label: "مصاحبه" },
    created_at: { iso: "2026-11-04", jalali: "1405/08/13" },
    ...overrides,
  };
}

export function riskPage(overrides: Partial<RiskPage> = {}): RiskPage {
  return {
    count: 3,
    page: 1,
    pages: 1,
    ordering: "newest",
    results: [
      riskRow(7, { needs_completion: true }),
      riskRow(4, { level: null }),
      riskRow(1, { level: levels.high, status: { value: "treatment_plan", label: "برنامه‌ی درمان" } }),
    ],
    can_create: false,
    create_url: "/risks/scenarios/",
    ...overrides,
  };
}

export function riskFilters(): RiskFilters {
  return {
    status: {
      label: "وضعیت",
      choices: [
        { value: "assessment", label: "در ارزیابی" },
        { value: "treatment_plan", label: "برنامه‌ی درمان" },
      ],
    },
    category: { label: "دسته", choices: [{ value: "1", label: "T1 دسته‌ی آزمون" }] },
    service: { label: "خدمت", choices: [{ value: "1", label: "IPG - خدمت آزمون" }] },
    unit: { label: "واحد", choices: [{ value: "1", label: "واحد آزمون" }] },
    tag: { label: "برچسب", choices: [] },
    channel: { label: "کانال ورود", choices: [{ value: "interview", label: "مصاحبه" }] },
    needs_completion: {
      label: "تکمیل",
      choices: [
        { value: "yes", label: "نیازمند تکمیل" },
        { value: "no", label: "کامل" },
      ],
    },
  };
}

export function riskDetail(): RiskDetail {
  const at = { iso: "2026-11-02T07:07:07+00:00", jalali: "1405/08/11 10:37" };
  return {
    id: 1,
    code: "RK-1405-0001",
    title: "ریسک آزمون شماره‌ی ۱",
    description: "شرح آزمونی ریسک.\nخط دوم شرح.",
    status: { value: "treatment_plan", label: "برنامه‌ی درمان" },
    is_active: true,
    needs_completion: false,
    level: levels.high,
    score: [12, 14],
    created_at: { iso: "2026-11-04", jalali: "1405/08/13" },
    updated_at: at,
    channel: { value: "interview", label: "مصاحبه" },
    scenario: null,
    service: { code: "IPG", name: "خدمت آزمون", href: "/catalog/services/1/" },
    org_unit: "واحد آزمون",
    owner: tester,
    category: { code: "T1", name: "دسته‌ی آزمون" },
    customers: [],
    tags: ["برچسب آزمون"],
    scope: "دامنه‌ی آزمون",
    initiator: "عامل آزمون",
    count_unit: "واحد شمارش آزمون",
    count_exclusions: "",
    data_class: null,
    cia: "A",
    links: [
      { kind: "تیکت", ref: "TEST-1", url: "https://tickets.example.test/TEST-1", edit_url: "/risks/links/1/edit/" },
    ],
    evidence: [],
    controls: [],
    workflow: {
      transitions: [
        {
          name: "start_treatment",
          label: "شروع اجرا",
          description: "",
          target: "در اجرا",
          href: "/workflow/risks/1/transition/start_treatment/",
        },
      ],
      timeline: [
        {
          from: "در ارزیابی",
          to: "برنامه‌ی درمان",
          reason: "دلیل آزمونی انتقال",
          meeting_date: null,
          by: reviewer,
          at,
        },
      ],
      questions: [],
      pending_change: null,
      merged_into: null,
      split_from: null,
      merged_risks: [{ code: "RK-1405-0009", href: "/risks/9/" }],
      split_parts: [],
    },
    assessments: [
      {
        id: 1,
        code: "AS-1405-0001",
        kind: { value: "current", label: "جاری" },
        status: { value: "approved", label: "تأییدشده" },
        level: levels.high,
        score: [12, 14],
        meeting_date: { iso: "2026-10-28", jalali: "1405/08/06" },
        approved_at: at,
        href: "/assessments/1/",
      },
    ],
    treatment: {
      current_plan: {
        label: "طرح مواجهه‌ی آزمون",
        option: "کاهش",
        owner_approved: false,
        actions: [
          {
            code: "TR-1405-0001",
            title: "اقدام آزمون",
            status: "برنامه‌ریزی",
            due: { iso: "2026-12-14", jalali: "1405/09/23", days_left: 40, overdue: false },
            href: "/actions/1/",
          },
        ],
        href: "/actions/plans/1/",
      },
      plan_due: null,
      acceptances: [],
    },
    attachments: [
      {
        id: 1,
        name: "پیوست-آزمون.pdf",
        size: 2048,
        description: "شرح پیوست آزمون",
        by: reviewer,
        at,
        href: "/attachments/1/",
      },
    ],
    comments: [{ id: 1, text: "یادداشت آزمون", by: reviewer, at, edited: false, edit_url: null }],
    attach_url: "/attachments/29/1/new/",
    comment_url: "/comments/29/1/new/",
    actions: {
      classic: "/risks/1/",
      edit: "/risks/1/edit/",
      add_link: "/risks/1/links/new/",
      propose_merge: "/workflow/risks/1/requests/merge/",
      propose_split: "/workflow/risks/1/requests/split/",
      add_evidence: "/risks/evidence/new/?risk=1",
      add_assessment: null,
      add_plan: null,
    },
  };
}

export function answerHome(): AnswerHome {
  return {
    questionnaires: [{ id: 1, title: "پرسشنامه‌ی آزمون", description: "شرح پرسشنامه‌ی آزمون.", question_count: 3 }],
    can_answer: true,
    my_responses: [
      {
        id: 1,
        questionnaire: "پرسشنامه‌ی آزمون",
        org_unit: "واحد آزمون",
        service: "IPG",
        respondent: tester,
        channel: { value: "questionnaire", label: "پرسشنامه" },
        status: { value: "returned", label: "برگشت‌خورده" },
        is_editable: true,
        is_overdue: false,
        updated_at: { iso: "2026-11-04", jalali: "1405/08/13" },
      },
    ],
    risk_question_count: 2,
  };
}

export function startForm(): StartForm {
  return {
    questionnaire: { id: 1, title: "پرسشنامه‌ی آزمون" },
    fields: {
      org_unit: {
        label: "واحد",
        help: "",
        required: true,
        initial: "",
        choices: [{ value: "1", label: "واحد آزمون" }],
      },
      service: {
        label: "خدمت",
        help: "اگر پاسخ درباره‌ی یک خدمت مشخص است.",
        required: false,
        initial: "",
        choices: [{ value: "1", label: "IPG - خدمت آزمون" }],
      },
    },
  };
}

/** پاسخی که عضو GRC برای تکمیل برگردانده است: سؤال ۱ (متنی) و ۲ (تک‌گزینه‌ای) اجباری و بی‌جواب‌اند. */
export function response(overrides: Partial<ResponseDetail> = {}): ResponseDetail {
  return {
    id: 1,
    questionnaire: { id: 1, title: "پرسشنامه‌ی آزمون", description: "شرح پرسشنامه‌ی آزمون." },
    is_structured: false,
    structured_data: [],
    structured_questions: [],
    org_unit: "واحد آزمون",
    service: "IPG",
    respondent: tester,
    channel: { value: "questionnaire", label: "پرسشنامه" },
    status: { value: "returned", label: "برگشت‌خورده" },
    is_editable: true,
    is_overdue: false,
    updated_at: { iso: "2026-11-04", jalali: "1405/08/13" },
    recorded_by: tester,
    can_edit: true,
    submitted_at: null,
    return_question: "سؤال آزمونی بازبین برای تکمیل.",
    return_due: { iso: "2026-11-09", jalali: "1405/08/18", days_left: 5, overdue: false },
    reviewed_by: null,
    reviewed_at: null,
    fixed: [{ name: "functions", label: "کارکردهای اصلی واحد", help: "راهنمای آزمون.", value: "" }],
    new_item: { name: "new_item", label: "مورد جدید", help: "", value: "" },
    questions: [
      { id: 1, text: "سؤال متنی آزمون", help: "", kind: "text", required: true, options: [], value: "" },
      {
        id: 2,
        text: "سؤال تک‌گزینه‌ای آزمون",
        help: "",
        kind: "single",
        required: true,
        options: [
          { id: 11, text: "گزینه‌ی اول" },
          { id: 12, text: "گزینه‌ی دوم" },
        ],
        value: null,
      },
      {
        id: 3,
        text: "سؤال چندگزینه‌ای آزمون",
        help: "",
        kind: "multiple",
        required: false,
        options: [
          { id: 21, text: "مورد الف" },
          { id: 22, text: "مورد ب" },
        ],
        value: [],
      },
    ],
    pending_risks: [],
    classic_url: "/questionnaires/responses/1/",
    ...overrides,
  };
}

export function riskQuestions(): { questions: RiskQuestion[] } {
  const base = {
    risk: { id: 3, code: "RK-1405-0003", title: "ریسک آزمون سوم", org_unit: "واحد آزمون" },
    asked_by: reviewer,
    asked_at: { iso: "2026-11-04", jalali: "1405/08/13" },
    due: { iso: "2026-11-06", jalali: "1405/08/15", days_left: 2, overdue: false },
  };
  return {
    questions: [
      { id: 4, text: "پرسش آزمون اول؟", ...base },
      { id: 3, text: "پرسش آزمون دوم؟", ...base },
    ],
  };
}

// فرم‌ها و صفحه‌های خواندنی پل جنگو (/api/forms/ و /api/pages/)

const field = (overrides: Partial<FormField> & Pick<FormField, "name" | "label" | "kind">): FormField => ({
  help: "",
  required: false,
  disabled: false,
  value: "",
  errors: [],
  ...overrides,
});

/** فرم ویرایش ریسک با همه‌ی نوع فیلدها: متن، شرح، انتخاب، چندتایی، تاریخ، تیک و فیلد پنهان. */
export function riskForm(): FormPageData {
  return {
    view: "risks:risk_update",
    title: "ویرایش ریسک",
    cancel: { href: "/risks/1/", route: "/risks/1" },
    messages: [],
    form: {
      multipart: false,
      errors: [],
      fields: [
        field({
          name: "title",
          label: "عنوان",
          kind: "text",
          required: true,
          value: "ریسک آزمون شماره‌ی ۱",
          max_length: 300,
        }),
        field({
          name: "description",
          label: "شرح",
          kind: "textarea",
          required: true,
          value: "شرح آزمونی ریسک.",
          rows: 4,
        }),
        field({
          name: "category",
          label: "دسته",
          kind: "select",
          required: true,
          value: "1",
          empty_label: "---------",
          choices: [
            { value: "1", label: "T1 دسته‌ی آزمون" },
            { value: "2", label: "T2 دسته‌ی آزمون دوم" },
          ],
        }),
        field({
          name: "customers",
          label: "بانک‌ها",
          kind: "multiselect",
          help: "بانک‌هایی که این ریسک به آن‌ها می‌رسد.",
          value: ["11"],
          choices: [
            { value: "11", label: "بانک آزمون یک" },
            { value: "12", label: "بانک آزمون دو" },
            { value: "13", label: "بانک آزمون سه" },
          ],
        }),
        field({
          name: "identified_on",
          label: "تاریخ شناسایی",
          kind: "date",
          value: "1405/08/10",
          placeholder: "مثلاً 1405/01/15",
        }),
        field({ name: "is_confidential", label: "محرمانه", kind: "checkbox", value: false }),
        field({ name: "next", label: "", kind: "hidden", value: "/risks/" }),
      ],
    },
  };
}

export function uploadForm(): FormPageData {
  return {
    view: "core:attachment_upload",
    title: "پیوست تازه برای RK-1405-0001 ریسک آزمون شماره‌ی ۱",
    cancel: { href: "/risks/1/", route: "/risks/1" },
    messages: [],
    submit: "بارگذاری پیوست",
    form: {
      multipart: true,
      errors: [],
      fields: [
        field({
          name: "file",
          label: "فایل",
          kind: "file",
          required: true,
          value: null,
          help: "حداکثر 20 مگابایت؛ pdf، docx",
          accept: ".pdf,.docx",
          max_size: 20 * 1024 * 1024,
        }),
        field({ name: "description", label: "شرح", kind: "text", max_length: 300 }),
      ],
    },
  };
}

export function transitionForm(): FormPageData {
  return {
    view: "workflow:transition",
    title: "شروع اجرا",
    cancel: { href: "/risks/1/", route: "/risks/1" },
    messages: [],
    submit: "شروع اجرا",
    risk: {
      id: 1,
      code: "RK-1405-0001",
      title: "ریسک آزمون شماره‌ی ۱",
      status: { value: "treatment_plan", label: "برنامه‌ی درمان" },
    },
    transition: { label: "شروع اجرا", description: "شرح آزمونی انتقال.", source: "برنامه‌ی درمان", target: "در اجرا" },
    problems: ["مالک ریسک هنوز طرح مواجهه را تأیید نکرده است."],
    form: {
      multipart: false,
      errors: [],
      fields: [field({ name: "reason", label: "توضیح", kind: "textarea", rows: 3 })],
    },
  };
}

const evidenceRow = (id: number, overrides: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id,
  code: `EV-1405-000${id}`,
  title: `شاهد آزمون ${id}`,
  kind: { value: "incident", label: "رخداد" },
  observed_on: { iso: "2026-10-01", jalali: "1405/07/09" },
  reliability: { value: "high", label: "زیاد" },
  expired: false,
  confidential: false,
  href: `/risks/evidence/${id}/`,
  ...overrides,
});

const filters = (fields: FormField[]): FormSchema => ({ fields, errors: [], multipart: false });

export function evidenceList(): EvidenceList {
  return {
    view: "risks:evidence_list",
    title: "شواهد",
    messages: [],
    results: [
      evidenceRow(1),
      evidenceRow(2, { confidential: true, expired: true, kind: { value: "test", label: "آزمون" } }),
    ],
    count: 2,
    page: 1,
    pages: 1,
    filters: filters([
      field({ name: "q", label: "جست‌وجو", kind: "text", placeholder: "کد، عنوان یا منبع" }),
      field({
        name: "kind",
        label: "نوع",
        kind: "select",
        empty_label: "همه",
        choices: [
          { value: "incident", label: "رخداد" },
          { value: "test", label: "آزمون" },
        ],
      }),
    ]),
    create_url: "/risks/evidence/new/",
  };
}

const riskBrief = (id: number): RiskBrief => ({
  id,
  code: `RK-1405-000${id}`,
  title: `ریسک آزمون شماره‌ی ${id}`,
  status: { value: "registered", label: "ثبت‌شده" },
  is_active: true,
  service: "IPG",
  category: { code: "T1", name: "دسته‌ی آزمون" },
  owner: tester,
  href: `/risks/${id}/`,
});

export function evidenceDetail(): EvidenceDetail {
  const at = { iso: "2026-11-02T07:07:07+00:00", jalali: "1405/08/11 10:37" };
  return {
    view: "risks:evidence_detail",
    title: "EV-1405-0001 شاهد آزمون 1",
    messages: [],
    evidence: {
      ...evidenceRow(1),
      summary: "خلاصه‌ی آزمونی شاهد.",
      source: "منبع آزمون",
      scope: "",
      valid_until: { iso: "2027-01-01", jalali: "1405/10/11" },
      access_class: { value: "normal", label: "عادی" },
      url: "https://tickets.example.test/INC-1",
      customer: null,
      owner: reviewer,
    },
    risks: [riskBrief(1)],
    attachments: [],
    comments: [{ id: 5, text: "نظر آزمون روی شاهد", by: tester, at, edited: true, edit_url: "/comments/5/edit/" }],
    attach_url: "/attachments/31/1/new/",
    comment_url: "/comments/31/1/new/",
    edit_url: "/risks/evidence/1/edit/",
    list_url: "/risks/evidence/",
  };
}

export function coverage(): CoveragePage {
  const cell = (category: string, status: string, label: string, extra: Partial<CoverageCell> = {}): CoverageCell => ({
    category,
    status: { value: status, label },
    summary: `${category} دسته‌ی آزمون`,
    risk_count: 0,
    risks_url: null,
    edit_url: `/risks/coverage/1/${category === "T1" ? 1 : 2}/?next=%2Frisks%2Fcoverage%2F`,
    ...extra,
  });
  return {
    view: "risks:coverage",
    title: "جهان ریسک",
    messages: [],
    results: [
      {
        service: {
          id: 1,
          code: "IPG",
          name: "خدمت آزمون",
          is_critical: true,
          org_unit: "واحد آزمون",
          href: "/catalog/services/1/",
        },
        cells: [
          cell("T1", "reviewed", "بررسی‌شده", { risk_count: 2, risks_url: "/risks/?service=1&category=1" }),
          cell("T2", "pending", "در انتظار بررسی"),
        ],
      },
    ],
    count: 1,
    page: 1,
    pages: 1,
    filters: filters([field({ name: "q", label: "جست‌وجو", kind: "text", placeholder: "کد یا نام خدمت" })]),
    categories: [
      { id: 1, code: "T1", name: "دسته‌ی آزمون" },
      { id: 2, code: "T2", name: "دسته‌ی آزمون دوم" },
    ],
    critical: { total: 1, complete: 0, percent: 0 },
    counts: { reviewed: 1, not_relevant: 0, pending: 1 },
    can_edit: true,
    categories_url: "/risks/categories/",
  };
}

export function changeDetail(decision = true): ChangeDetail {
  const risk = {
    id: 1,
    code: "RK-1405-0001",
    title: "ریسک آزمون شماره‌ی ۱",
    status: { value: "registered", label: "ثبت‌شده" },
    href: "/risks/1/",
  };
  const target = { ...risk, id: 2, code: "RK-1405-0002", title: "ریسک آزمون دوم", href: "/risks/2/" };
  return {
    view: "workflow:change_request_detail",
    title: "پیشنهاد ادغام RK-1405-0001",
    messages: [],
    change: {
      id: 7,
      kind: { value: "merge", label: "ادغام" },
      status: { value: "pending", label: "منتظر تأیید" },
      risk,
      merge_into: target,
      owner: tester,
      proposed_by: reviewer,
      created_at: { iso: "2026-11-03", jalali: "1405/08/12" },
      href: "/workflow/requests/7/",
      part_titles: [],
      parts: [],
      reason: "دلیل آزمونی ادغام.",
      decided_by: null,
      decided_at: null,
      decision_note: "",
    },
    decision: decision
      ? {
          url: "/workflow/requests/7/",
          effect: "با تأیید، ریسک RK-1405-0001 با همین کد و سابقه «بسته‌شده» می‌شود و به RK-1405-0002 اشاره می‌کند.",
          note: field({ name: "note", label: "توضیح", kind: "textarea", help: "برای رد اجباری است.", rows: 3 }),
        }
      : null,
    list_url: "/workflow/requests/",
  };
}

// ارزیابی‌ها (apps/api/assessments.py)؛ شکل‌ها از جواب واقعی پل برای داده‌ی آزمون‌های ارزیابی جنگو برداشته شده‌اند.

const assessmentAt = { iso: "2026-11-04T08:30:00+00:00", jalali: "1405/08/13 12:00" };

/** ارزیابی جاری پیش‌نویس و کامل که ارزیاب می‌تواند برای کنترل کیفیت بفرستد: A برابر ۲، یک مسیر با B برابر ۳. */
export function assessmentDetail(overrides: Partial<AssessmentDetail> = {}): AssessmentDetail {
  const notes = field({
    name: "notes",
    label: "توضیح",
    kind: "textarea",
    help: "برای برگشت و ارجاع اجباری است.",
    rows: 2,
  });
  const cell = (level: string, confidence = "زیاد") => ({
    level,
    unknown: false,
    value: null,
    unit: "",
    confidence,
    rationale: "دلیل آزمونی",
  });
  return {
    view: "assessments:assessment_detail",
    title: "ارزیابی جاری AS-1405-0001",
    messages: [],
    assessment: {
      id: 1,
      code: "AS-1405-0001",
      kind: { value: "current", label: "جاری" },
      status: { value: "draft", label: "پیش‌نویس" },
      is_approved: false,
      risk: { id: 1, code: "RK-1405-0001", title: "ریسک آزمون شماره‌ی ۱", href: "/risks/1/" },
      method_version: { label: "نسخه‌ی 1: روش آزمون", number: 1, href: "/method/1/" },
      horizon_months: 12,
      meeting_date: { iso: "2026-10-20", jalali: "1405/07/28" },
      assumptions: "",
      created_by: tester,
      created_at: assessmentAt,
      approved_at: null,
      escalation: null,
      href: "/assessments/1/",
    },
    outcome: {
      provisional: true,
      problems: [],
      likelihood: [2, 2],
      impact: [3, 3],
      score: [6, 6],
      decision_score: 6,
      base_level: levels.medium,
      decision_level: levels.medium,
      confidence: "متوسط",
      incomplete_reasons: [],
      escalation_reasons: [],
      out_of_acceptance_authority: false,
      acceptance_restricted: false,
    },
    review: {
      can_submit: true,
      submission_problems: [],
      submit_url: "/assessments/1/submit/",
      can_review: false,
      review_url: null,
      review_notes: notes,
      can_decide_referral: false,
      referral_url: null,
      referral_form: {
        fields: [
          field({ name: "meeting_date", label: "تاریخ جلسه‌ی کارگروه", kind: "date" }),
          field({ name: "notes", label: "تصمیم کارگروه", kind: "textarea", rows: 2 }),
        ],
        errors: [],
        multipart: false,
      },
      history: [],
    },
    likelihood: {
      a: "2",
      b: [3, 3],
      likelihood: [2, 2],
      problems: [],
      incomplete: [],
      blockers: [],
      initiator: {
        basis: { value: "forward", label: "شواهد آینده‌نگر" },
        rate: null,
        confidence: "زیاد",
        rationale: "دلیل آزمونی A",
        evidence: [{ code: "EV-1405-0001", href: "/risks/evidence/1/" }],
      },
      paths: [
        {
          id: 1,
          name: "مسیر آزمون",
          description: "مراحل مسیر آزمون",
          independent: false,
          independence_rationale: "",
          exceptions: "",
          notes: [],
          b0: "3",
          b0_confidence: "زیاد",
          b0_rationale: "دلیل آزمونی B0",
          controls: [],
          bc: [5, 5],
          b: [3, 3],
          edit_url: "/assessments/paths/1/edit/",
          delete_url: "/assessments/paths/1/delete/",
        },
      ],
    },
    impacts: {
      impact: [3, 3],
      problems: [],
      incomplete: [],
      unknown: [],
      missing: [],
      stakeholders: ["داتین", "بانک آزمون"],
      rows: [
        { code: "S", name: "خدمت و تداوم", cells: [cell("0"), cell("3", "متوسط")] },
        { code: "F", name: "مالی", cells: [cell("0"), null] },
      ],
    },
    actions: {
      edit: "/assessments/1/edit/",
      impact_profile: "/assessments/1/impacts/",
      initiator: "/assessments/1/initiator/",
      add_path: "/assessments/1/paths/new/",
    },
    ...overrides,
  };
}

/** همان ارزیابی در کنترل کیفیت، از چشم کنترل‌کننده‌ای که ارزیاب آن نیست. */
export function assessmentInReview(): AssessmentDetail {
  const data = assessmentDetail();
  return {
    ...data,
    assessment: { ...data.assessment, status: { value: "in_qc", label: "در کنترل کیفیت" } },
    review: {
      ...data.review,
      can_submit: false,
      submit_url: null,
      can_review: true,
      review_url: "/assessments/1/review/",
      history: [
        {
          id: 1,
          action: { value: "submit", label: "ارسال برای کنترل کیفیت" },
          by: tester,
          at: assessmentAt,
          meeting_date: null,
          notes: "توضیح آزمونی ارسال",
        },
      ],
    },
    likelihood: {
      ...data.likelihood,
      paths: data.likelihood.paths.map((path) => ({ ...path, edit_url: null, delete_url: null })),
    },
    actions: { edit: null, impact_profile: null, initiator: null, add_path: null },
  };
}

function impactRow(prefix: string, code: string, name: string, extra: Partial<ImpactRow> = {}): ImpactRow {
  const levelChoices = [
    { value: "unknown", label: "نامعلوم" },
    ...["0", "1", "2", "3", "4", "5"].map((value) => ({ value, label: `${value}: سطح آزمونی ${value}` })),
  ];
  const fields = [
    field({ name: `${prefix}-level`, label: "سطح", kind: "select", empty_label: "ثبت‌نشده", choices: levelChoices }),
    field({
      name: `${prefix}-level_high`,
      label: "تا",
      kind: "select",
      empty_label: "-",
      choices: ["1", "2", "3", "4", "5"].map((value) => ({ value, label: value })),
    }),
    field({ name: `${prefix}-actual_value`, label: "مقدار واقعی", kind: "number" }),
    ...(code === "F" ? [field({ name: `${prefix}-basis`, label: "مبنای مالی (ریال)", kind: "number" })] : []),
    field({
      name: `${prefix}-confidence`,
      label: "اطمینان",
      kind: "select",
      empty_label: "-",
      choices: [
        { value: "low", label: "کم" },
        { value: "medium", label: "متوسط" },
        { value: "high", label: "زیاد" },
      ],
    }),
    field({ name: `${prefix}-rationale`, label: "دلیل", kind: "textarea", rows: 2 }),
    field({
      name: `${prefix}-evidence`,
      label: "شواهد",
      kind: "multiselect",
      value: [],
      choices: [{ value: "1", label: "EV-1405-0001 شاهد آزمون" }],
    }),
  ];
  return {
    prefix,
    scale: { code, name },
    suggestion: null,
    provisional_note: "",
    fields,
    errors: [],
    multipart: false,
    ...extra,
  };
}

/** پروفایل پیامد با داتین و یک بانک: هر کدام دو بُعد S و F. */
export function impactProfileForm(): FormPageData {
  const datinS = impactRow("datin-S", "S", "خدمت و تداوم");
  datinS.fields = datinS.fields.map((item) =>
    item.name === "datin-S-level"
      ? { ...item, value: "0" }
      : item.name === "datin-S-confidence"
        ? { ...item, value: "high" }
        : item,
  );
  return {
    view: "assessments:impact_profile",
    title: "پروفایل پیامد ارزیابی جاری AS-1405-0001",
    form: null,
    cancel: { href: "/assessments/1/", route: "/assessments/1" },
    messages: [],
    intro: "برای داتین و هر بانک متأثر، سطح هر بُعد را با دلیل و شاهد ثبت کنید.",
    groups: [
      {
        name: "داتین",
        is_datin: true,
        facts: { critical: false, rto: null, mtpd: null, basis: null },
        rows: [datinS, impactRow("datin-F", "F", "مالی")],
      },
      {
        name: "بانک آزمون",
        is_datin: false,
        facts: { critical: true, rto: 240, mtpd: null, basis: 5000000000 },
        rows: [
          impactRow("7-S", "S", "خدمت و تداوم", {
            suggestion: { level: 3, note: "مدت اختلال بیش از یک‌چهارم RTO است." },
            provisional_note: "بدون RTO یا MTPD مصوب، سطح موقت کمتر از 3 ثبت نشود مگر با دلیل و تأیید متولی روش.",
          }),
          impactRow("7-F", "F", "مالی"),
        ],
      },
    ],
  };
}

/** فرم عامل آغازگر با مرز آغازگر از ریسک، هشدار و جدول راهنمای A کنار فرم. */
export function initiatorForm(): FormPageData {
  return {
    view: "assessments:initiator",
    title: "عامل آغازگر (A) در ارزیابی جاری AS-1405-0001",
    cancel: { href: "/assessments/1/#likelihood", route: "/assessments/1#likelihood" },
    messages: [],
    alerts: [
      {
        tone: "warning",
        text: "تعریف آغازگر، واحد شمارش یا دامنه‌ی ریسک کامل نیست؛ A ذخیره می‌شود ولی نهایی تأیید نمی‌شود (بخش ۱۳).",
        link: { label: "تکمیل ریسک", href: "/risks/1/edit/" },
      },
    ],
    facts: {
      title: "مرز آغازگر از ریسک RK-1405-0001",
      rows: [
        { label: "عامل آغازگر", value: "عامل آزمون" },
        { label: "واحد شمارش", value: "واحد شمارش آزمون" },
        { label: "خارج از شمارش", value: "" },
      ],
    },
    guides: [
      {
        title: "جدول A (بخش ۱۴)",
        items: [
          { term: "1", label: "کمتر از 0.1 بار در سال", text: "شرح آزمونی سطح ۱." },
          { term: "2", label: "از 0.1 تا کمتر از 1 بار در سال", text: "شرح آزمونی سطح ۲." },
        ],
        notes: ["یادداشت آزمونی جدول A."],
      },
    ],
    form: {
      fields: [
        field({
          name: "a_basis",
          label: "مسیر A",
          kind: "select",
          value: "forward",
          choices: [
            { value: "rate", label: "نرخ" },
            { value: "forward", label: "شواهد آینده‌نگر" },
          ],
        }),
        field({
          name: "a_level",
          label: "A",
          kind: "select",
          value: "2",
          empty_label: "---------",
          choices: [
            { value: "1", label: "1" },
            { value: "2", label: "2" },
          ],
        }),
        field({ name: "a_rationale", label: "دلیل A", kind: "textarea", value: "دلیل آزمونی A", rows: 3 }),
      ],
      errors: [],
      multipart: false,
    },
  };
}

/** مقایسه‌ی ارزیابی جاری و هدف یک ریسک، با جهت تغییر نسبت به ستون اول. */
export function compareAssessments(overrides: Partial<ComparePage> = {}): ComparePage {
  const text = (value: string, trend: "" | "up" | "down" = "") => ({ text: value, level: null, trend });
  return {
    view: "assessments:compare",
    title: "مقایسه‌ی ارزیابی‌ها",
    messages: [],
    risk: { id: 1, code: "RK-1405-0001", title: "ریسک آزمون شماره‌ی ۱", href: "/risks/1/" },
    error: null,
    profiles: [
      {
        id: 1,
        code: "AS-1405-0001",
        kind: { value: "current", label: "جاری" },
        method_version: 1,
        incomplete: false,
        href: "/assessments/1/",
      },
      {
        id: 2,
        code: "AS-1405-0002",
        kind: { value: "target", label: "هدف" },
        method_version: 2,
        incomplete: true,
        href: "/assessments/2/",
      },
    ],
    rows: [
      { label: "A", cells: [text("3"), text("2", "down")] },
      { label: "پیامد S: خدمت و تداوم", cells: [text("3"), text("؟")] },
      { label: "امتیاز L × I", cells: [text("12"), text("15", "up")] },
      {
        label: "سطح تصمیم",
        cells: [
          { text: "بالا", level: levels.high, trend: "" },
          { text: "متوسط", level: levels.medium, trend: "down" },
        ],
      },
    ],
    method_changed: true,
    ...overrides,
  };
}

// طرح مواجهه، اقدام و پذیرش (apps/api/actions.py)

const riskOwner = { id: 2, name: "مالک آزمون" };
const assignee = { id: 4, name: "مجری آزمون" };
const verifier = { id: 5, name: "تأییدکننده‌ی آزمون" };
const noRecords = (type: number, id: number) => ({
  attachments: [],
  comments: [],
  attach_url: `/attachments/${type}/${id}/new/`,
  comment_url: `/comments/${type}/${id}/new/`,
});

export function actionRow(overrides: Partial<ActionRow> = {}): ActionRow {
  return {
    id: 1,
    code: "TR-1405-0001",
    title: "اقدام آزمون پوشش دسترسی ممتاز",
    mechanism: "B: امکان تحقق",
    dimension: null,
    owner: riskOwner,
    assignee,
    due: { iso: "2027-01-20", jalali: "1405/10/30", days_left: 77, overdue: false },
    status: { value: "in_progress", label: "در اجرا", overdue: false },
    href: "/actions/1/",
    ...overrides,
  };
}

export function acceptanceRow(overrides: Partial<AcceptanceRow> = {}): AcceptanceRow {
  return {
    id: 2,
    code: "AC-1405-0002",
    assessment: "AS-1405-0004",
    level: levels.medium,
    start: { iso: "2026-11-04", jalali: "1405/08/13" },
    end: { iso: "2026-11-24", jalali: "1405/09/03" },
    follow_up_by: reviewer,
    state: { value: "pending", label: "منتظر امضا" },
    href: "/actions/acceptances/2/",
    ...overrides,
  };
}

const actionFilters: FormSchema = {
  multipart: false,
  errors: [],
  fields: [
    field({ name: "q", label: "جست‌وجو", kind: "text", placeholder: "کد یا عنوان" }),
    field({
      name: "status",
      label: "وضعیت",
      kind: "select",
      empty_label: "همه",
      choices: [
        { value: "open", label: "باز" },
        { value: "in_progress", label: "در اجرا" },
        { value: "verified", label: "تأییدشده" },
      ],
    }),
    field({ name: "overdue", label: "فقط عقب‌افتاده", kind: "checkbox", value: false }),
    field({ name: "mine", label: "فقط اقدام‌های من", kind: "checkbox", value: false }),
  ],
};

export function actionList(overrides: Partial<ActionList> = {}): ActionList {
  return {
    view: "actions:action_list",
    title: "اقدام‌ها",
    messages: [],
    results: [
      actionRow({ risk: "RK-1405-0001" }),
      actionRow({
        id: 2,
        code: "TR-1405-0002",
        title: "اقدام آزمون عقب‌افتاده",
        risk: "RK-1405-0002",
        due: { iso: "2026-10-01", jalali: "1405/07/09", days_left: -34, overdue: true },
        status: { value: "approved", label: "مصوب", overdue: true },
        href: "/actions/2/",
      }),
    ],
    count: 2,
    page: 1,
    pages: 1,
    filters: actionFilters,
    ...overrides,
  };
}

export function acceptanceList(overrides: Partial<AcceptanceList> = {}): AcceptanceList {
  return {
    view: "actions:acceptance_list",
    title: "پذیرش‌های ریسک",
    messages: [],
    results: [
      acceptanceRow({ risk: { code: "RK-1405-0003", href: "/risks/3/" } }),
      acceptanceRow({
        id: 3,
        code: "AC-1405-0003",
        state: { value: "expired", label: "منقضی" },
        risk: { code: "RK-1405-0004", href: "/risks/4/" },
        href: "/actions/acceptances/3/",
      }),
    ],
    count: 2,
    page: 1,
    pages: 1,
    filters: {
      multipart: false,
      errors: [],
      fields: [
        field({ name: "q", label: "جست‌وجو", kind: "text" }),
        field({
          name: "status",
          label: "وضعیت",
          kind: "select",
          empty_label: "همه",
          choices: [
            { value: "in_force", label: "معتبر و منقضی‌نشده" },
            { value: "expired", label: "منقضی" },
            { value: "pending", label: "منتظر امضا" },
          ],
        }),
      ],
    },
    ...overrides,
  };
}

/** طرح کاهش منتظر تأیید مالک، از دید خود مالک ریسک. */
export function planDetail(overrides: Partial<PlanDetail> = {}): PlanDetail {
  return {
    view: "actions:plan_detail",
    title: "طرح مواجهه: کاهش",
    messages: [],
    plan: {
      id: 1,
      option: { value: "reduce", label: "کاهش" },
      state: { value: "pending", label: "منتظر تأیید مالک" },
      risk: { id: 1, code: "RK-1405-0001", title: "ریسک آزمون شماره‌ی ۱", href: "/risks/1/" },
      risk_owner: riskOwner,
      assessment: { code: "AS-1405-0001", href: "/assessments/1/", score: 12 },
      level: levels.high,
      plan_required: true,
      decision_due: { iso: "2026-11-18", jalali: "1405/08/27" },
      overdue: false,
      containment_due: null,
      rationale: "کاهش با PAM؛ پذیرش برای سطح بالا مجاز نیست",
      option_details: "",
      target: { code: "AS-1405-0002", href: "/assessments/2/", status: "تأییدشده", level: levels.medium },
      approved_by: null,
      approved_at: null,
    },
    approval: {
      problems: [],
      approve_url: "/actions/plans/1/approve/",
      message: "شما مالک این ریسک هستید. با تأیید، طرح و همه‌ی اقدام‌هایش مصوب می‌شوند.",
      waiting_for_owner: false,
    },
    actions: [actionRow({ status: { value: "planned", label: "برنامه‌ریزی", overdue: false } })],
    add_action_url: "/actions/plans/1/actions/new/",
    reassessment: null,
    reassess_url: null,
    comparison: null,
    acceptances: [],
    acceptance_note: "برای این سطح پذیرش فقط موقت و استثنایی است و کنار اقدام‌های طرح ثبت می‌شود.",
    add_acceptance_url: "/actions/risks/1/acceptance/new/",
    ...noRecords(45, 1),
    edit_url: "/actions/plans/1/edit/",
    ...overrides,
  };
}

/** اقدام در اجرا از دید مالک اقدام: «مسدود است» توضیح می‌خواهد و «آماده‌ی آزمون» شاهد اجرا را می‌گیرد. */
export function actionDetail(overrides: Partial<ActionDetail> = {}): ActionDetail {
  return {
    view: "actions:action_detail",
    title: "اقدام TR-1405-0001",
    messages: [],
    action: {
      id: 1,
      code: "TR-1405-0001",
      title: "اقدام آزمون پوشش دسترسی ممتاز",
      status: { value: "in_progress", label: "در اجرا", overdue: false },
      is_open: true,
      deliverable: "همه‌ی حساب‌های ممتاز آزمون زیر PAM",
      mechanism: "B: امکان تحقق",
      dimension: null,
      owner: riskOwner,
      assignee,
      verifier,
      start: { iso: "2026-11-05", jalali: "1405/08/14" },
      due: { iso: "2027-01-20", jalali: "1405/10/30", days_left: 77, overdue: false },
      cost: 1500000,
      person_hours: 40,
      description: "",
      acceptance_criteria: "آزمون مسیر دسترسی",
    },
    risk: { id: 1, code: "RK-1405-0001", title: "ریسک آزمون شماره‌ی ۱", href: "/risks/1/" },
    plan: { option: "کاهش", href: "/actions/plans/1/" },
    depends_on: [],
    waiting_for_dependencies: false,
    controls: [],
    evidence: [],
    progress: {
      state: "open",
      url: "/actions/1/move/",
      moves: [
        { name: "block", label: "مسدود است", style: "outline-danger", note_required: true },
        { name: "ready", label: "آماده‌ی آزمون", style: "primary", note_required: false },
      ],
      can_note: true,
      note: field({ name: "note", label: "توضیح", kind: "textarea", rows: 2 }),
      evidence: field({
        name: "evidence",
        label: "شاهد اجرا",
        kind: "multiselect",
        value: [],
        help: "برای «آماده‌ی آزمون»: شاهد اجرا از شواهد ریسک.",
        choices: [{ value: "7", label: "EV-1405-0007 گزارش آزمون PAM" }],
      }),
    },
    updates: [
      {
        id: 2,
        label: "در اجرا",
        changes_status: true,
        by: assignee,
        at: { iso: "2026-11-04T16:08:23+00:00", jalali: "1405/08/13 19:38" },
        note: "شروع شد",
      },
      {
        id: 1,
        label: "مصوب",
        changes_status: true,
        by: riskOwner,
        at: { iso: "2026-11-04T16:00:00+00:00", jalali: "1405/08/13 19:30" },
        note: "تأیید مالک ریسک",
      },
    ],
    ...noRecords(44, 1),
    edit_url: "/actions/1/edit/",
    ...overrides,
  };
}

/** پذیرش منتظر امضا با عبور از حد تحمل مشتری: امضای مدیریت ارشد با شماره، تاریخ و فایل نامه ثبت می‌شود. */
export function acceptanceDetail(overrides: Partial<AcceptanceDetail> = {}): AcceptanceDetail {
  return {
    view: "actions:acceptance_detail",
    title: "پذیرش AC-1405-0002",
    messages: [],
    acceptance: {
      id: 2,
      code: "AC-1405-0002",
      state: { value: "pending", label: "منتظر امضا" },
      days_left: null,
      decision_text: "",
      closed: null,
      start: { iso: "2026-11-04", jalali: "1405/08/13" },
      end: { iso: "2026-11-24", jalali: "1405/09/03" },
      evidence_due: null,
      scope: "خدمت آزمون پرداخت برای همه‌ی بانک‌ها",
      reason: "هزینه‌ی کاهش از پیامد بیشتر است.",
      alternatives: "کاهش با WAF؛ رد شد چون پیامد کم است.",
      compensating_controls: "پایش روزانه‌ی لاگ",
      controls: [],
      conditions: "رخداد تازه‌ای ثبت نشود.",
      customer_constraints: "قرارداد بانک‌ها محدودیتی ندارد.",
      monitoring: "تعداد هشدارهای ماهانه",
      revocation_triggers: "هر رخداد مرتبط یا تغییر دامنه",
      follow_up_by: reviewer,
    },
    risk: { id: 3, code: "RK-1405-0003", title: "ریسک آزمون متوسط", href: "/risks/3/", owner: riskOwner },
    assessment: {
      code: "AS-1405-0004",
      href: "/assessments/4/",
      method_version: 1,
      score: 6,
      confidence: null,
      tolerance_exceeded: true,
    },
    level: levels.medium,
    temporary: false,
    non_normal: false,
    plan: null,
    renews: null,
    renewals: [],
    cap: { value: 6, unit: "ماه", until: { iso: "2027-05-03", jalali: "1406/02/13" } },
    decision_due: { iso: "2026-12-04", jalali: "1405/09/13" },
    decision_due_passed: false,
    problems: [],
    problems_title: "تا این‌ها درست نشوند امضای تأیید ثبت نمی‌شود:",
    submit_url: null,
    signatures: [
      {
        authority: "owner",
        label: "مالک ریسک",
        reason: "پاسخ‌گوی ریسک؛ مجوز مقام بالاتر جای امضای او را نمی‌گیرد (بخش ۱۹).",
        signature: {
          approved: true,
          by: riskOwner,
          at: { iso: "2026-11-05T09:00:00+00:00", jalali: "1405/08/14 12:30" },
          reference_kind: "نامه",
          reference: "",
          reference_date: null,
          letter: null,
          note: "",
        },
        waiting: false,
      },
      {
        authority: "unit_manager",
        label: "مدیر واحد",
        reason: "سطح «متوسط»: مجوز مدیر واحد ریسک (بخش ۱۹ و جواب س۱۳).",
        signature: null,
        waiting: true,
        candidates: { unit: "واحد آزمون", names: ["مدیر آزمون"] },
      },
      {
        authority: "senior_management",
        label: "مدیریت ارشد",
        reason: "عبور از حد تحمل مشتری اختیار پذیرش عمومی را محدود می‌کند (بخش ۱۸).",
        signature: null,
        waiting: true,
      },
    ],
    sign_url: "/actions/acceptances/2/sign/",
    sign_forms: [
      {
        authority: "senior_management",
        label: "مدیریت ارشد",
        intro: "تصمیم مدیریت ارشد را از روی نامه‌ی رسمی ثبت می‌کنید.",
        multipart: true,
        errors: [],
        fields: [
          field({ name: "authority", label: "Authority", kind: "hidden", value: "senior_management", required: true }),
          field({ name: "note", label: "توضیح", kind: "textarea", rows: 2, help: "برای رد لازم است." }),
          field({ name: "reference", label: "شماره‌ی نامه", kind: "text", max_length: 100 }),
          field({ name: "reference_date", label: "تاریخ نامه", kind: "date", placeholder: "مثلاً 1405/01/15" }),
          field({
            name: "letter",
            label: "فایل نامه",
            kind: "file",
            value: null,
            help: "شماره، تاریخ و فایل نامه لازم است (جواب س۵).",
          }),
        ],
      },
    ],
    revoke: {
      url: "/actions/acceptances/2/revoke/",
      multipart: false,
      errors: [],
      fields: [field({ name: "reason", label: "دلیل لغو", kind: "textarea", rows: 2, required: true })],
    },
    ...noRecords(43, 2),
    edit_url: null,
    ...overrides,
  };
}

/** فرم بازسنجی طرح با مقایسه‌ی مبنا، ارزیابی تازه و هدف، و یک اقدام هنوز باز. */
export function reassessmentForm(): FormPageData {
  const text = (value: string, trend: "" | "up" | "down" = "") => ({ text: value, level: null, trend });
  return {
    view: "actions:reassessment_create",
    title: "بازسنجی طرح مواجهه‌ی RK-1405-0001 (کاهش)",
    cancel: { href: "/actions/plans/1/", route: "/actions/plans/1" },
    messages: [],
    intro:
      "ارزیابی جاری تازه بعد از اقدام‌ها را با ارزیابی مبنای طرح و ارزیابی هدف مقایسه کنید و تصمیم را ثبت کنید. تصمیم، گزینه‌ی طرح دور تازه را تعیین می‌کند (بخش ۲۰).",
    submit: "ثبت بازسنجی",
    risk: { id: 1, code: "RK-1405-0001", title: "ریسک آزمون شماره‌ی ۱", href: "/risks/1/" },
    comparison: {
      profiles: [
        {
          id: 1,
          code: "AS-1405-0001",
          kind: { value: "current", label: "جاری" },
          method_version: 1,
          incomplete: false,
          href: "/assessments/1/",
        },
        {
          id: 3,
          code: "AS-1405-0003",
          kind: { value: "current", label: "جاری" },
          method_version: 1,
          incomplete: false,
          href: "/assessments/3/",
        },
        {
          id: 2,
          code: "AS-1405-0002",
          kind: { value: "target", label: "هدف" },
          method_version: 1,
          incomplete: false,
          href: "/assessments/2/",
        },
      ],
      rows: [
        { label: "امتیاز L × I", cells: [text("12"), text("6", "down"), text("-")] },
        {
          label: "سطح تصمیم",
          cells: [
            { text: "بالا", level: levels.high, trend: "" },
            { text: "متوسط", level: levels.medium, trend: "down" },
            { text: "متوسط", level: levels.medium, trend: "down" },
          ],
        },
      ],
      method_changed: false,
    },
    open_actions: [
      { code: "TR-1405-0001", href: "/actions/1/", status: { value: "approved", label: "مصوب", overdue: false } },
    ],
    form: {
      multipart: false,
      errors: [],
      fields: [
        field({ name: "performed_on", label: "تاریخ بازسنجی", kind: "date", required: true, value: "1405/08/13" }),
        field({
          name: "responsible",
          label: "مسئول بازسنجی",
          kind: "select",
          required: true,
          value: "1",
          empty_label: "---------",
          choices: [
            { value: "1", label: "بازبین آزمون" },
            { value: "2", label: "مالک آزمون" },
          ],
        }),
        field({
          name: "decision",
          label: "تصمیم",
          kind: "select",
          required: true,
          empty_label: "---------",
          choices: [
            { value: "accept", label: "پذیرش ریسک باقیمانده" },
            { value: "continue", label: "ادامه‌ی اصلاح" },
          ],
        }),
        field({
          name: "note",
          label: "دلیل تصمیم",
          kind: "textarea",
          required: true,
          help: "مقایسه با هدف، اقدام‌های باز و آنچه در دور تازه لازم است.",
        }),
      ],
    },
  };
}

// --- تعریف پرسشنامه‌ها، بررسی پاسخ‌ها و پایش ---

const unitManager = { id: 6, name: "مدیر واحد آزمون" };

export function questionnaireList(overrides: Partial<QuestionnaireList> = {}): QuestionnaireList {
  return {
    view: "questionnaires:questionnaire_list",
    title: "تعریف پرسشنامه‌ها",
    messages: [],
    results: [
      {
        id: 1,
        title: "پرسشنامه‌ی آزمون",
        question_count: 3,
        response_count: 2,
        is_active: true,
        is_structured: false,
        href: "/questionnaires/manage/1/",
      },
      {
        id: 2,
        title: "پرسشنامه‌ی شاخه‌ای آزمون",
        question_count: 9,
        response_count: 0,
        is_active: false,
        is_structured: true,
        href: "/questionnaires/manage/2/",
      },
    ],
    count: 2,
    page: 1,
    pages: 1,
    filters: null,
    create_url: "/questionnaires/manage/new/",
    ...overrides,
  };
}

export function questionnaireDetail(overrides: Partial<QuestionnaireDetail> = {}): QuestionnaireDetail {
  return {
    view: "questionnaires:questionnaire_detail",
    title: "پرسشنامه‌ی آزمون",
    messages: [],
    questionnaire: {
      id: 1,
      title: "پرسشنامه‌ی آزمون",
      description: "راهنمای پاسخ‌دهنده‌ی آزمون.",
      is_active: true,
      is_structured: false,
    },
    questions: [
      {
        id: 1,
        order: 1,
        text: "پشتیبان آزمون روزانه آزموده می‌شود؟",
        help: "آزمون بازیابی واقعی.",
        kind: { value: "yes_no", label: "بله و خیر" },
        stage: null,
        required: true,
        is_active: true,
        options: [
          { id: 1, text: "بله", is_active: true, indicates_risk: false, scenario: null, category: null },
          {
            id: 2,
            text: "خیر",
            is_active: true,
            indicates_risk: true,
            scenario: { code: "SC-0001", name: "سناریوی آزمون" },
            category: null,
          },
        ],
        edit_url: "/questionnaires/questions/1/edit/",
      },
      {
        id: 2,
        order: 2,
        text: "وابستگی‌های آزمون",
        help: "",
        kind: { value: "multiple", label: "چندگزینه‌ای" },
        stage: null,
        required: false,
        is_active: true,
        options: [
          { id: 3, text: "شبکه", is_active: true, indicates_risk: false, scenario: null, category: null },
          { id: 4, text: "پیامک", is_active: false, indicates_risk: false, scenario: null, category: null },
        ],
        edit_url: "/questionnaires/questions/2/edit/",
      },
      {
        id: 3,
        order: 3,
        text: "سؤال کنار گذاشته‌ی آزمون",
        help: "",
        kind: { value: "text", label: "متن" },
        stage: null,
        required: false,
        is_active: false,
        options: [],
        edit_url: "/questionnaires/questions/3/edit/",
      },
    ],
    add_question_url: "/questionnaires/manage/1/questions/new/",
    edit_url: "/questionnaires/manage/1/edit/",
    list_url: "/questionnaires/manage/",
    ...overrides,
  };
}

const scenarioChoices = [{ value: "1", label: "SC-0001 سناریوی آزمون" }];
const categoryChoices = [{ value: "7", label: "T7 دسته‌ی آزمون" }];

function optionRow(index: number, values: { id?: string; text?: string; risky?: boolean; scenario?: string }) {
  const prefix = `options-${index}`;
  return {
    prefix,
    multipart: false,
    errors: [],
    fields: [
      field({ name: `${prefix}-order`, label: "ترتیب", kind: "number", value: String(index + 1) }),
      field({ name: `${prefix}-text`, label: "متن گزینه", kind: "text", value: values.text ?? "", max_length: 300 }),
      field({
        name: `${prefix}-indicates_risk`,
        label: "نشانه‌ی ریسک",
        kind: "checkbox",
        value: Boolean(values.risky),
      }),
      field({
        name: `${prefix}-scenario`,
        label: "سناریوی مرجع",
        kind: "select",
        value: values.scenario ?? "",
        empty_label: "---------",
        choices: scenarioChoices,
      }),
      field({
        name: `${prefix}-category`,
        label: "دسته",
        kind: "select",
        value: "",
        empty_label: "---------",
        choices: categoryChoices,
      }),
      field({ name: `${prefix}-is_active`, label: "فعال", kind: "checkbox", value: true }),
      field({ name: `${prefix}-id`, label: "Id", kind: "hidden", value: values.id ?? "" }),
      field({ name: `${prefix}-question`, label: "سؤال", kind: "hidden", value: "1" }),
    ],
  };
}

export function questionForm(): FormPageData {
  return {
    view: "questionnaires:question_update",
    title: "ویرایش سؤال در «پرسشنامه‌ی آزمون»",
    cancel: { href: "/questionnaires/manage/1/", route: "/questionnaires/manage/1" },
    messages: [],
    structured: false,
    form: {
      multipart: false,
      errors: [],
      fields: [
        field({ name: "order", label: "ترتیب", kind: "number", value: "1", required: true }),
        field({
          name: "text",
          label: "متن سؤال",
          kind: "textarea",
          value: "پشتیبان آزمون روزانه آزموده می‌شود؟",
          required: true,
          rows: 2,
        }),
        field({ name: "help_text", label: "راهنما", kind: "text", value: "" }),
        field({
          name: "kind",
          label: "نوع",
          kind: "select",
          value: "yes_no",
          required: true,
          empty_label: "---------",
          choices: [
            { value: "text", label: "متن" },
            { value: "yes_no", label: "بله و خیر" },
            { value: "single", label: "تک‌گزینه‌ای" },
            { value: "multiple", label: "چندگزینه‌ای" },
          ],
        }),
        field({
          name: "stage",
          label: "بخش پرسشنامه",
          kind: "select",
          value: "",
          empty_label: "---------",
          choices: [{ value: "service", label: "خدمت" }],
        }),
        field({ name: "is_required", label: "اجباری", kind: "checkbox", value: true }),
        field({ name: "is_active", label: "فعال", kind: "checkbox", value: true }),
      ],
    },
    options: {
      management: [
        field({ name: "options-TOTAL_FORMS", label: "Total forms", kind: "hidden", value: "3" }),
        field({ name: "options-INITIAL_FORMS", label: "Initial forms", kind: "hidden", value: "2" }),
        field({ name: "options-MIN_NUM_FORMS", label: "Min num forms", kind: "hidden", value: "0" }),
        field({ name: "options-MAX_NUM_FORMS", label: "Max num forms", kind: "hidden", value: "1000" }),
      ],
      errors: [],
      rows: [
        optionRow(0, { id: "1", text: "بله" }),
        optionRow(1, { id: "2", text: "خیر", risky: true, scenario: "1" }),
        optionRow(2, {}),
      ],
    },
  };
}

export function reviewList(overrides: Partial<ReviewList> = {}): ReviewList {
  return {
    view: "questionnaires:response_list",
    title: "پاسخ‌های پرسشنامه",
    messages: [],
    results: [
      {
        id: 1,
        questionnaire: "پرسشنامه‌ی آزمون",
        org_unit: "واحد آزمون",
        service: "IPG",
        respondent: unitManager,
        interview: true,
        submitted_at: { iso: "2026-11-04", jalali: "1405/08/13" },
        pending_count: 2,
        status: { value: "submitted", label: "ارسال‌شده" },
        is_overdue: false,
        href: "/questionnaires/responses/1/",
      },
      {
        id: 2,
        questionnaire: "پرسشنامه‌ی آزمون",
        org_unit: "واحد آزمون دوم",
        service: null,
        respondent: tester,
        interview: false,
        submitted_at: null,
        pending_count: 0,
        status: { value: "draft", label: "پیش‌نویس" },
        is_overdue: false,
        href: "/questionnaires/responses/2/",
      },
    ],
    count: 2,
    page: 1,
    pages: 1,
    filters: filters([
      field({
        name: "status",
        label: "وضعیت",
        kind: "select",
        empty_label: "همه",
        choices: [
          { value: "draft", label: "پیش‌نویس" },
          { value: "submitted", label: "ارسال‌شده" },
          { value: "returned", label: "برگشت‌خورده" },
          { value: "reviewed", label: "بررسی‌شده" },
        ],
      }),
      field({
        name: "pending",
        label: "ریسک در انتظار",
        kind: "select",
        empty_label: "همه",
        choices: [
          { value: "yes", label: "دارد" },
          { value: "no", label: "ندارد" },
        ],
      }),
    ]),
    queue_url: "/questionnaires/responses/?status=submitted",
    ...overrides,
  };
}

export function responseReview(overrides: Partial<ResponseReview> = {}): ResponseReview {
  return {
    view: "questionnaires:response_detail",
    title: "پرسشنامه‌ی آزمون: IPG",
    messages: [],
    response: {
      id: 1,
      questionnaire: { id: 1, title: "پرسشنامه‌ی آزمون", href: "/questionnaires/manage/1/" },
      org_unit: "واحد آزمون",
      service: { code: "IPG", name: "درگاه آزمون" },
      respondent: unitManager,
      recorded_by: reviewer,
      interview: true,
      status: { value: "submitted", label: "ارسال‌شده" },
      is_overdue: false,
      is_structured: false,
      submitted_at: { iso: "2026-11-04T08:30:00+00:00", jalali: "1405/08/13 12:00" },
      return_question: "",
      returned_at: null,
      return_due: null,
      reviewed_by: null,
      reviewed_at: null,
    },
    fixed: [
      { label: "کارکردهای اصلی و تعهدهای واحد", value: "کارکرد آزمون" },
      { label: "چه تعهد زمانی یا کیفی داریم؟", value: "" },
    ],
    answers: [
      {
        id: 1,
        question: "پشتیبان آزمون روزانه آزموده می‌شود؟",
        has_options: true,
        text: "",
        options: [{ text: "خیر", indicates_risk: true }],
      },
      { id: 2, question: "نگرانی آزمون", has_options: false, text: "جواب متنی آزمون", options: [] },
    ],
    new_item: "مورد جدید آزمون",
    pending_risks: [
      {
        id: 1,
        description: "پشتیبان آزمون روزانه آزموده می‌شود؟\nجواب: خیر",
        source: "گزینه‌ی نشانه‌ی ریسک",
        scenario: { code: "SC-0001", name: "سناریوی آزمون" },
        category: null,
        status: { value: "pending", label: "در انتظار" },
        risk: null,
        dismiss_reason: "",
        duplicate_of: null,
        convert_url: "/questionnaires/pending/1/convert/",
        dismiss_url: "/questionnaires/pending/1/dismiss/",
      },
      {
        id: 2,
        description: "مورد جدید آزمون",
        source: "مورد جدید",
        scenario: null,
        category: null,
        status: { value: "dismissed", label: "کنار گذاشته" },
        risk: null,
        dismiss_reason: "دلیل آزمون",
        duplicate_of: { code: "RK-1405-0001", href: "/risks/1/" },
        convert_url: null,
        dismiss_url: null,
      },
    ],
    answer_url: null,
    review: {
      pending_create_url: "/questionnaires/responses/1/pending/new/",
      return_url: "/questionnaires/responses/1/return/",
      reviewed_url: "/questionnaires/responses/1/reviewed/",
      undecided: true,
    },
    list_url: "/questionnaires/responses/",
    ...overrides,
  };
}

const pendingBrief = { description: "مورد جدید آزمون", source: "مورد جدید" };

export function pendingPicker(): FormPageData {
  return {
    view: "questionnaires:pending_convert",
    title: "انتخاب سناریو برای ثبت ریسک",
    form: null,
    cancel: { href: "/questionnaires/responses/1/", route: "/questionnaires/responses/1" },
    messages: [],
    pending: pendingBrief,
    scenarios: [
      { id: 1, code: "SC-0001", title: "سناریوی آزمون", service: "IPG - درگاه آزمون" },
      { id: 2, code: "SC-0002", title: "سناریوی آزمون دوم", service: "SMS - پیامک آزمون" },
    ],
  };
}

export function pendingConvertForm(): FormPageData {
  return {
    view: "questionnaires:pending_convert",
    title: "ثبت ریسک در انتظار در رجیستر",
    cancel: { href: "/questionnaires/responses/1/", route: "/questionnaires/responses/1" },
    messages: [],
    submit: "ثبت در رجیستر",
    pending: pendingBrief,
    facts: { title: "جزئیات سناریو", rows: [{ label: "کد", value: "SC-0001" }] },
    form: filters([
      field({ name: "initiator", label: "عامل آغازگر", kind: "textarea", required: true }),
      field({ name: "scenario", label: "سناریو", kind: "hidden", value: "1" }),
    ]),
  };
}

export function notices(): NoticeList {
  const risk = { id: 1, code: "RK-1405-0001", title: "ریسک آزمون شماره‌ی ۱", href: "/risks/1/" };
  return {
    view: "actions:notices",
    title: "اعلان‌های پایش",
    messages: [],
    notices: [
      {
        id: 1,
        risk,
        message: "بازبینی آزمون تا ۱۴۰۵/۰۸/۱۴ آغاز شود.",
        href: "/actions/reviews/1/",
        created_at: { iso: "2026-11-04T08:30:00+00:00", jalali: "1405/08/13 12:00" },
        read: false,
        read_url: "/actions/notices/1/read/",
      },
      {
        id: 2,
        risk,
        message: "اعلان خوانده‌شده‌ی آزمون",
        href: "/risks/1/",
        created_at: { iso: "2026-11-03T08:30:00+00:00", jalali: "1405/08/12 12:00" },
        read: true,
        read_url: null,
      },
    ],
  };
}

export function reviewDetail(overrides: Partial<ReviewDetail> = {}): ReviewDetail {
  return {
    view: "actions:review_detail",
    title: "بازبینی RK-1405-0001",
    messages: [],
    review: {
      id: 1,
      trigger: { value: "incident", label: "رخداد مهم یا بهره‌برداری فعال" },
      risk: { id: 1, code: "RK-1405-0001", title: "ریسک آزمون شماره‌ی ۱", href: "/risks/1/" },
      assessment: null,
      reason: "دلیل آزمون بازبینی",
      due: { iso: "2026-11-05", jalali: "1405/08/14", days_left: 1, overdue: false },
      responsible: riskOwner,
      created_by: reviewer,
      created_at: { iso: "2026-11-04T08:30:00+00:00", jalali: "1405/08/13 12:00" },
      completed_at: null,
      completed_by: null,
      result: "",
    },
    complete: {
      url: "/actions/reviews/1/",
      result: field({ name: "result", label: "نتیجه و اقدام بعدی", kind: "textarea", required: true, rows: 4 }),
    },
    ...overrides,
  };
}

// کتابخانه‌ی کنترل، ارزیابی اثربخشی و بیانیه‌ی کاربردپذیری: جواب‌های واقعی apps/api/controls.py (کوتاه‌شده).

export function controlList(overrides: Partial<ControlList> = {}): ControlList {
  return {
    ...({
      view: "controls:control_list",
      messages: [],
      title: "کتابخانه‌ی کنترل",
      results: [
        {
          id: 1,
          code: "CT-0001",
          title: "احراز هویت چندعاملی برای حساب‌های ممتاز",
          kind: { value: "preventive", label: "پیشگیرانه" },
          owner: { id: 2, name: "مینا کنترلی" },
          operated_by: { value: "datin", label: "داتین" },
          is_key: true,
          is_active: true,
          iso_controls: ["5.15", "8.5"],
          href: "/controls/1/",
        },
        {
          id: 2,
          code: "CT-0002",
          title: "پشتیبان‌گیری روزانه",
          kind: { value: "recovery", label: "بازیابی" },
          owner: { id: 2, name: "مینا کنترلی" },
          operated_by: { value: "datin", label: "داتین" },
          is_key: false,
          is_active: true,
          iso_controls: ["8.13"],
          href: "/controls/2/",
        },
      ],
      count: 2,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "q",
            label: "جست‌وجو",
            help: "",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            placeholder: "کد، عنوان یا هدف",
          },
          {
            name: "kind",
            label: "نوع",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              { value: "preventive", label: "پیشگیرانه" },
              { value: "detective", label: "کشف" },
              { value: "containment", label: "مهار" },
              { value: "recovery", label: "بازیابی" },
            ],
          },
          {
            name: "is_key",
            label: "کنترل کلیدی",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              { value: "yes", label: "بله" },
              { value: "no", label: "خیر" },
            ],
          },
          {
            name: "operated_by",
            label: "اجراکننده",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              { value: "datin", label: "داتین" },
              { value: "bank", label: "بانک" },
              { value: "supplier", label: "تأمین‌کننده" },
            ],
          },
          {
            name: "theme",
            label: "موضوع پیوست A",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              { value: "5", label: "سازمانی" },
              { value: "6", label: "انسانی" },
              { value: "7", label: "فیزیکی" },
              { value: "8", label: "فناورانه" },
            ],
          },
          {
            name: "status",
            label: "وضعیت",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              { value: "active", label: "فعال" },
              { value: "inactive", label: "غیرفعال" },
            ],
          },
        ],
        errors: [],
        multipart: false,
      },
      create_url: "/controls/new/",
      soa_url: "/controls/soa/",
    } satisfies ControlList),
    ...overrides,
  };
}

export function controlDetail(overrides: Partial<ControlDetail> = {}): ControlDetail {
  return {
    ...({
      view: "controls:control_detail",
      messages: [],
      title: "CT-0001 احراز هویت چندعاملی برای حساب‌های ممتاز",
      control: {
        id: 1,
        code: "CT-0001",
        title: "احراز هویت چندعاملی برای حساب‌های ممتاز",
        kind: { value: "preventive", label: "پیشگیرانه" },
        owner: { id: 2, name: "مینا کنترلی" },
        operated_by: { value: "datin", label: "داتین" },
        is_key: true,
        is_active: true,
        iso_controls: ["5.15", "8.5"],
        href: "/controls/1/",
        objective: "ورود به حساب ممتاز بدون عامل دوم ممکن نیست.",
      },
      effectiveness: [
        {
          id: 3,
          code: "CA-1405-0003",
          scope: "دامنه آزمون",
          e: 3,
          problem: "برای E3 و بالاتر نمونه‌ی آزمون دست‌کم 30 مورد است.",
          suspended: false,
          test_to: { iso: "2026-11-09", jalali: "1405/08/18" },
          valid_until: { iso: "2027-02-07", jalali: "1405/11/18" },
          verified_by: { id: 1, name: "سارا احمدی" },
          href: "/controls/effectiveness/3/",
        },
        {
          id: 2,
          code: "CA-1405-0002",
          scope: "دامنه آزمون",
          e: 3,
          problem: "شاهدش از 1403/01/12 کهنه شده است",
          suspended: false,
          test_to: { iso: "2024-01-01", jalali: "1402/10/11" },
          valid_until: { iso: "2024-03-31", jalali: "1403/01/12" },
          verified_by: { id: 1, name: "سارا احمدی" },
          href: "/controls/effectiveness/2/",
        },
        {
          id: 1,
          code: "CA-1405-0001",
          scope: "دامنه آزمون",
          e: 4,
          problem: null,
          suspended: false,
          test_to: { iso: "2026-11-09", jalali: "1405/08/18" },
          valid_until: { iso: "2027-02-07", jalali: "1405/11/18" },
          verified_by: { id: 1, name: "سارا احمدی" },
          href: "/controls/effectiveness/1/",
        },
      ],
      iso_controls: [
        {
          id: 15,
          code: "5.15",
          title: "کنترل دسترسی",
          applicability: {
            value: "applicable",
            label: "کاربرد دارد",
            implementation: { value: "implemented", label: "اجراشده" },
          },
          href: "/controls/soa/15/",
        },
        {
          id: 64,
          code: "8.5",
          title: "احراز هویت امن",
          applicability: { value: "undetermined", label: "تعیین‌نشده", implementation: null },
          href: "/controls/soa/64/",
        },
      ],
      risks: [
        {
          id: 1,
          code: "RK-1405-0001",
          title: "دسترسی غیرمجاز به سرور تولید",
          status: { value: "registered", label: "ثبت‌شده در رجیستر" },
          is_active: true,
          service: null,
          category: { code: "T1", name: "امنیت اطلاعات و سایبری" },
          owner: { id: 2, name: "مینا کنترلی" },
          href: "/risks/1/",
        },
      ],
      attachments: [],
      comments: [],
      attach_url: "/attachments/110/1/new/",
      comment_url: "/comments/110/1/new/",
      edit_url: "/controls/1/edit/",
      add_assessment_url: "/controls/1/effectiveness/new/",
      list_url: "/controls/",
    } satisfies ControlDetail),
    ...overrides,
  };
}

export function controlAssessmentDetail(overrides: Partial<ControlAssessmentDetail> = {}): ControlAssessmentDetail {
  return {
    ...({
      view: "controls:control_assessment_detail",
      messages: [],
      title: "ارزیابی اثربخشی CA-1405-0003",
      assessment: {
        id: 3,
        code: "CA-1405-0003",
        e: 3,
        problem: "برای E3 و بالاتر نمونه‌ی آزمون دست‌کم 30 مورد است.",
        suspended: false,
        level_name: "اثربخشی فعلی تأییدشده",
        control: {
          id: 1,
          code: "CT-0001",
          title: "احراز هویت چندعاملی برای حساب‌های ممتاز",
          kind: { value: "preventive", label: "پیشگیرانه" },
          is_key: true,
          owner: { id: 2, name: "مینا کنترلی" },
          href: "/controls/1/",
        },
        scope: "دامنه آزمون",
        exists: true,
        design_ok: true,
        population: "",
        coverage_pct: "100",
        critical_points: "",
        critical_points_covered: true,
        exceptions: "",
        known_gap: false,
        test_method: "",
        test_from: null,
        test_to: { iso: "2026-11-09", jalali: "1405/08/18" },
        sample_size: 12,
        sample_rationale: "",
        test_result: "مسیر در آزمون متوقف شد.",
        operating_ok: true,
        limited_effect_proven: false,
        failures: "",
        conditions: [
          { label: "عملکرد مستمر", value: "بله" },
          { label: "آزمون خرابی و دورزدن", value: "بله" },
          { label: "پایش مستمر", value: "بله" },
        ],
        rationale: "آزمون موفق",
        confidence: { value: "high", label: "زیاد" },
        verified_by: { id: 1, name: "سارا احمدی" },
        valid_until: { iso: "2027-02-07", jalali: "1405/11/18", days_left: 90, overdue: false },
        evidence_age: 90,
        method_version: { name: "نسخه‌ی 1: روش v5", href: "/method/1/" },
        created_by: { id: 1, name: "سارا احمدی" },
        created_at: { iso: "2026-11-09", jalali: "1405/08/18" },
      },
      unmet: ["برای E3 و بالاتر نمونه‌ی آزمون دست‌کم 30 مورد است."],
      evidence: [
        {
          id: 3,
          code: "EV-1405-0003",
          title: "شاهد آزمون کنترل",
          kind: { value: "test", label: "آزمون" },
          observed_on: { iso: "2026-11-09", jalali: "1405/08/18" },
          expired: false,
          href: "/risks/evidence/3/",
        },
      ],
      paths: [
        {
          id: 4,
          name: "ورود با گذرواژه‌ی دزدیده",
          assessment: { code: "AS-1405-0002", href: "/assessments/2/" },
          risk: { code: "RK-1405-0001", title: "دسترسی غیرمجاز به سرور تولید" },
          href: "/assessments/2/#path-4",
        },
      ],
      attachments: [],
      comments: [],
      attach_url: "/attachments/111/3/new/",
      comment_url: "/comments/111/3/new/",
      edit_url: "/controls/effectiveness/3/edit/",
    } satisfies ControlAssessmentDetail),
    ...overrides,
  };
}

export function soaList(overrides: Partial<SoaList> = {}): SoaList {
  return {
    ...({
      view: "controls:soa_list",
      messages: [],
      title: "بیانیه‌ی کاربردپذیری",
      results: [
        {
          id: 1,
          code: "5.1",
          title: "خط‌مشی‌های امنیت اطلاعات",
          title_en: "Policies for information security",
          theme: { value: 5, label: "سازمانی" },
          applicability: {
            value: "applicable",
            label: "کاربرد دارد",
            implementation: { value: "planned", label: "برنامه‌ریزی‌شده" },
          },
          control_count: 0,
          risk_count: 0,
          gap: true,
          href: "/controls/soa/1/",
        },
        {
          id: 2,
          code: "5.2",
          title: "نقش‌ها و مسئولیت‌های امنیت اطلاعات",
          title_en: "Information security roles and responsibilities",
          theme: { value: 5, label: "سازمانی" },
          applicability: { value: "undetermined", label: "تعیین‌نشده", implementation: null },
          control_count: 0,
          risk_count: 0,
          gap: false,
          href: "/controls/soa/2/",
        },
        {
          id: 15,
          code: "5.15",
          title: "کنترل دسترسی",
          title_en: "Access control",
          theme: { value: 5, label: "سازمانی" },
          applicability: {
            value: "applicable",
            label: "کاربرد دارد",
            implementation: { value: "implemented", label: "اجراشده" },
          },
          control_count: 1,
          risk_count: 1,
          gap: false,
          href: "/controls/soa/15/",
        },
        {
          id: 46,
          code: "7.1",
          title: "محدوده‌های امنیت فیزیکی",
          title_en: "Physical security perimeters",
          theme: { value: 7, label: "فیزیکی" },
          applicability: { value: "not_applicable", label: "کاربرد ندارد", implementation: null },
          control_count: 0,
          risk_count: 0,
          gap: false,
          href: "/controls/soa/46/",
        },
        {
          id: 64,
          code: "8.5",
          title: "احراز هویت امن",
          title_en: "Secure authentication",
          theme: { value: 8, label: "فناورانه" },
          applicability: { value: "undetermined", label: "تعیین‌نشده", implementation: null },
          control_count: 1,
          risk_count: 1,
          gap: false,
          href: "/controls/soa/64/",
        },
      ],
      count: 93,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "q",
            label: "جست‌وجو",
            help: "",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            placeholder: "شماره یا عنوان",
          },
          {
            name: "theme",
            label: "موضوع",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              { value: "5", label: "سازمانی" },
              { value: "6", label: "انسانی" },
              { value: "7", label: "فیزیکی" },
              { value: "8", label: "فناورانه" },
            ],
          },
          {
            name: "state",
            label: "کاربرد",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              { value: "undetermined", label: "تعیین‌نشده" },
              { value: "applicable", label: "کاربرد دارد" },
              { value: "not_applicable", label: "کاربرد ندارد" },
              { value: "gap", label: "کاربرد دارد ولی کنترل سازمانی ندارد" },
            ],
          },
          {
            name: "implementation",
            label: "وضعیت اجرا",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              { value: "implemented", label: "اجراشده" },
              { value: "in_progress", label: "در حال اجرا" },
              { value: "planned", label: "برنامه‌ریزی‌شده" },
            ],
          },
        ],
        errors: [],
        multipart: false,
      },
      summary: { total: 93, undetermined: 90, gaps: 1, applicable: 2, not_applicable: 1, implemented: 1 },
      controls_url: "/controls/",
    } satisfies SoaList),
    ...overrides,
  };
}

export function soaDetail(overrides: Partial<SoaDetail> = {}): SoaDetail {
  return {
    ...({
      view: "controls:soa_detail",
      messages: [],
      title: "5.15 کنترل دسترسی",
      iso_control: {
        id: 15,
        code: "5.15",
        title: "کنترل دسترسی",
        title_en: "Access control",
        theme: { value: 5, label: "سازمانی" },
        applicability: {
          value: "applicable",
          label: "کاربرد دارد",
          implementation: { value: "implemented", label: "اجراشده" },
        },
        justification: "الزام قرارداد",
        updated_at: { iso: "2026-11-09", jalali: "1405/08/18" },
      },
      warning: null,
      controls: [
        {
          id: 1,
          code: "CT-0001",
          title: "احراز هویت چندعاملی برای حساب‌های ممتاز",
          kind: { value: "preventive", label: "پیشگیرانه" },
          owner: { id: 2, name: "مینا کنترلی" },
          operated_by: { value: "datin", label: "داتین" },
          is_key: true,
          is_active: true,
          iso_controls: ["5.15", "8.5"],
          href: "/controls/1/",
        },
      ],
      risks: [
        {
          id: 1,
          code: "RK-1405-0001",
          title: "دسترسی غیرمجاز به سرور تولید",
          status: { value: "registered", label: "ثبت‌شده در رجیستر" },
          is_active: true,
          service: null,
          category: { code: "T1", name: "امنیت اطلاعات و سایبری" },
          owner: { id: 2, name: "مینا کنترلی" },
          href: "/risks/1/",
        },
      ],
      edit_url: "/controls/soa/15/edit/",
      edit_label: "ویرایش",
      list_url: "/controls/soa/",
    } satisfies SoaDetail),
    ...overrides,
  };
}

export function soaGapDetail(overrides: Partial<SoaDetail> = {}): SoaDetail {
  return {
    ...({
      view: "controls:soa_detail",
      messages: [],
      title: "5.1 خط‌مشی‌های امنیت اطلاعات",
      iso_control: {
        id: 1,
        code: "5.1",
        title: "خط‌مشی‌های امنیت اطلاعات",
        title_en: "Policies for information security",
        theme: { value: 5, label: "سازمانی" },
        applicability: {
          value: "applicable",
          label: "کاربرد دارد",
          implementation: { value: "planned", label: "برنامه‌ریزی‌شده" },
        },
        justification: "سیاست",
        updated_at: { iso: "2026-11-09", jalali: "1405/08/18" },
      },
      warning: "این کنترل کاربرد دارد ولی هیچ کنترل فعال سازمان به آن نگاشت نشده است.",
      controls: [],
      risks: [],
      edit_url: "/controls/soa/1/edit/",
      edit_label: "ویرایش",
      list_url: "/controls/soa/",
    } satisfies SoaDetail),
    ...overrides,
  };
}

export function controlAssessmentForm(overrides: Partial<FormPageData> = {}): FormPageData {
  return {
    ...({
      view: "controls:control_assessment_create",
      title: "ارزیابی اثربخشی تازه برای CT-0001 احراز هویت چندعاملی برای حساب‌های ممتاز",
      form: {
        fields: [
          {
            name: "scope",
            label: "دامنه",
            help: "حساب‌ها، سامانه‌ها، روش‌های دسترسی یا حالت‌های عملیاتی که این ارزیابی پوشش می‌دهد.",
            required: true,
            disabled: false,
            kind: "textarea",
            value: "",
            errors: [],
            rows: 2,
          },
          {
            name: "exists",
            label: "کنترل وجود دارد و اجرا می‌شود",
            help: "",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
          {
            name: "design_ok",
            label: "طراحی کافی است",
            help: "",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
          {
            name: "population",
            label: "جمعیت کل",
            help: "مثلاً «۴۲ حساب ممتاز» یا «همه‌ی بسته‌های انتشار».",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            max_length: 300,
          },
          {
            name: "coverage_pct",
            label: "درصد پوشش اجرا",
            help: "نسبت به جمعیت کل.",
            required: false,
            disabled: false,
            kind: "number",
            value: "",
            errors: [],
          },
          {
            name: "critical_points",
            label: "نقاط حیاتی",
            help: "فهرست نقاط حیاتی دامنه.",
            required: false,
            disabled: false,
            kind: "textarea",
            value: "",
            errors: [],
            rows: 2,
          },
          {
            name: "critical_points_covered",
            label: "همه‌ی نقاط حیاتی پوشش دارند",
            help: "",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
          {
            name: "exceptions",
            label: "استثناها و انحراف‌ها",
            help: "مسیرهای اضطراری و استثناهای بررسی‌شده، و دلیل پذیرش انحراف‌هایی که عملکرد کنترل را نقض نمی‌کنند.",
            required: false,
            disabled: false,
            kind: "textarea",
            value: "",
            errors: [],
            rows: 2,
          },
          {
            name: "known_gap",
            label: "شکست یا شکاف شناخته‌شده",
            help: "شکست یا شکافی در دامنه‌ی مورد اتکا که عملکرد کنترل را در سناریو نقض می‌کند؛ E3 و بالاتر را می‌بندد.",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
          {
            name: "test_method",
            label: "روش آزمون",
            help: "مثلاً بازبینی سوابق، اجرای دوباره یا آزمون فنی.",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            max_length: 300,
          },
          {
            name: "test_from",
            label: "آغاز بازه‌ی آزمون",
            help: "",
            required: false,
            disabled: false,
            kind: "date",
            value: "",
            errors: [],
            placeholder: "مثلاً 1405/01/15",
          },
          {
            name: "test_to",
            label: "پایان بازه‌ی آزمون",
            help: "قدمت شاهد از این تاریخ حساب می‌شود.",
            required: false,
            disabled: false,
            kind: "date",
            value: "",
            errors: [],
            placeholder: "مثلاً 1405/01/15",
          },
          {
            name: "sample_size",
            label: "اندازه‌ی نمونه",
            help: "",
            required: false,
            disabled: false,
            kind: "number",
            value: "",
            errors: [],
          },
          {
            name: "sample_rationale",
            label: "دلیل تعداد و تنوع نمونه",
            help: "با توجه به اهمیت کنترل، گستردگی دامنه و تنوع شرایط اجرا (بخش ۱۶).",
            required: false,
            disabled: false,
            kind: "textarea",
            value: "",
            errors: [],
            rows: 2,
          },
          {
            name: "test_result",
            label: "نتیجه‌ی آزمون",
            help: "",
            required: false,
            disabled: false,
            kind: "textarea",
            value: "",
            errors: [],
            rows: 2,
          },
          {
            name: "failures",
            label: "شکست‌ها و اقدام اصلاحی",
            help: "",
            required: false,
            disabled: false,
            kind: "textarea",
            value: "",
            errors: [],
            rows: 2,
          },
          {
            name: "operating_ok",
            label: "آزمون فعلی اثربخشی عملیاتی را نشان می‌دهد",
            help: "",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
          {
            name: "limited_effect_proven",
            label: "اثر محدود کنترل با آزمون اثبات شده است",
            help: "برای E2؛ نصب یا اجرای کنترل به‌تنهایی اثبات جلوگیری از تحقق مسیر نیست.",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
          {
            name: "sustained",
            label: "عملکرد مستمر در دوره‌ی بررسی",
            help: "سوابق معتبر عملکرد پایدار کنترل؛ شرط E4 و E5.",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
          {
            name: "failure_bypass_tested",
            label: "شرایط خرابی و دورزدن آزمون شده است",
            help: "",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
          {
            name: "monitored",
            label: "پایش مستمر دارد",
            help: "",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
          {
            name: "e",
            label: "E",
            help: "سطح با احراز همه‌ی شرط‌های آن سطح و سطح‌های پایین‌تر پذیرفته می‌شود؛ میانگین خوب شکست یک شرط را نمی‌پوشاند.",
            required: true,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "-",
            choices: [
              { value: "1", label: "E1: نبود اثربخشی اثبات‌شده" },
              { value: "2", label: "E2: اثربخشی محدود" },
              { value: "3", label: "E3: اثربخشی فعلی تأییدشده" },
              { value: "4", label: "E4: اثربخشی پایدار و مستقل تأییدشده" },
              { value: "5", label: "E5: اثربخشی پایدار همراه با آزمون شرایط خرابی و دورزدن" },
            ],
          },
          {
            name: "confidence",
            label: "اطمینان E",
            help: "در اطمینان کل ارزیابی‌هایی می‌آید که B سناریو را از این کنترل گرفته‌اند (جواب س۶۱).",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "-",
            choices: [
              { value: "low", label: "کم" },
              { value: "medium", label: "متوسط" },
              { value: "high", label: "زیاد" },
            ],
          },
          {
            name: "rationale",
            label: "دلیل انتخاب E",
            help: "",
            required: true,
            disabled: false,
            kind: "textarea",
            value: "",
            errors: [],
            rows: 2,
          },
          {
            name: "verified_by",
            label: "تأییدکننده",
            help: "برای E3 و بالاتر لازم است و کسی جز مسئول کنترل است.",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "- انتخاب کنید -",
            choices: [
              { value: "1", label: "سارا احمدی" },
              { value: "2", label: "مینا کنترلی" },
            ],
          },
          {
            name: "evidence",
            label: "شواهد",
            help: "شاهد اجرا یا آزمون.",
            required: false,
            disabled: false,
            kind: "multiselect",
            value: [],
            errors: [],
            choices: [
              { value: "3", label: "EV-1405-0003 شاهد آزمون کنترل" },
              { value: "1", label: "EV-1405-0001 شاهد آزمون کنترل" },
              { value: "2", label: "EV-1405-0002 شاهد آزمون کنترل" },
            ],
          },
        ],
        errors: [],
        multipart: false,
      },
      cancel: { href: "/controls/1/", route: "/controls/1" },
      messages: [],
      facts: {
        title: "کنترل",
        rows: [
          { label: "کنترل", value: "CT-0001 احراز هویت چندعاملی برای حساب‌های ممتاز" },
          { label: "نوع", value: "پیشگیرانه، کنترل کلیدی" },
          { label: "مسئول", value: "مینا کنترلی" },
        ],
      },
      fieldsets: [
        {
          title: "دامنه، طراحی و پوشش",
          fields: [
            "scope",
            "exists",
            "design_ok",
            "population",
            "coverage_pct",
            "critical_points",
            "critical_points_covered",
            "exceptions",
            "known_gap",
          ],
        },
        {
          title: "آزمون",
          fields: [
            "test_method",
            "test_from",
            "test_to",
            "sample_size",
            "sample_rationale",
            "test_result",
            "failures",
            "operating_ok",
            "limited_effect_proven",
          ],
        },
        { title: "شرط‌های E4 و E5", fields: ["sustained", "failure_bypass_tested", "monitored"] },
        { title: "نتیجه", fields: ["e", "confidence", "rationale", "verified_by", "evidence"] },
      ],
      guides: [
        {
          title: "سطح‌های E (بخش ۱۶)",
          items: [
            { term: "E1", label: "نبود اثربخشی اثبات‌شده", text: "کنترل وجود ندارد یا عملاً اثری بر مسیر ندارد." },
            { term: "E2", label: "اثربخشی محدود", text: "کنترل ناقص یا با پوشش محدود اجرا شده است." },
            {
              term: "E3",
              label: "اثربخشی فعلی تأییدشده",
              text: "کنترل اجرا شده، نقاط حیاتی را پوشش می‌دهد و آزمون فعلی موفق است.",
            },
            {
              term: "E4",
              label: "اثربخشی پایدار و مستقل تأییدشده",
              text: "اثربخشی کنترل در طول زمان و با تأیید مستقل اثبات شده است.",
            },
            {
              term: "E5",
              label: "اثربخشی پایدار همراه با آزمون شرایط خرابی و دورزدن",
              text: "کنترل علاوه بر اثربخشی پایدار، در برابر خرابی و دورزدن نیز آزمون شده و پایش مستمر دارد.",
            },
          ],
          notes: [],
        },
        {
          title: "شرط‌ها در این نسخه‌ی روش",
          items: [
            {
              term: "",
              label: "E2 و بالاتر",
              text: "اثر واقعی کنترل با شاهد آزمون اثبات شده و روش، نتیجه و دلیل نمونه ثبت است. صرف نصب و اجرا اعتبار کاهش ندارد. کنترل بدون شاهد E1 است.",
            },
            {
              term: "",
              label: "E3 و بالاتر",
              text: "طراحی کافی، اثربخشی عملیاتی، پوشش دست‌کم 95 درصد، همه‌ی نقاط حیاتی، بدون شکاف شناخته‌شده، نمونه‌ی دست‌کم 30، و تأییدکننده‌ای جز مسئول کنترل.",
            },
            {
              term: "",
              label: "E4 و E5",
              text: "E4: عملکرد مستمر در دوره‌ی بررسی. E5: به‌اضافه‌ی آزمون خرابی و دورزدن و پایش مستمر.",
            },
          ],
          notes: [
            "شاهد کنترل کلیدی 90 روز و کنترل‌های دیگر 180 روز بعد از پایان آزمون کهنه می‌شود؛ کنترل با شاهد کهنه در Bc فقط E1 حساب می‌شود.",
          ],
        },
      ],
    } satisfies FormPageData),
    ...overrides,
  };
}

// --- کاتالوگ، ساختار سازمانی و روش ارزیابی (جواب واقعی پل جنگو؛ متن‌های بلند روش کوتاه شده‌اند) ---

export function customerList(overrides: Partial<CustomerList> = {}): CustomerList {
  return {
    ...({
      view: "catalog:customer_list",
      messages: [],
      title: "بانک‌ها",
      results: [
        {
          id: 2,
          name: "بانک تجارت",
          is_key: false,
          financial_basis: 80000000000,
          is_active: true,
          edit_url: "/catalog/customers/2/edit/",
        },
        {
          id: 3,
          name: "بانک سینا",
          is_key: false,
          financial_basis: null,
          is_active: false,
          edit_url: "/catalog/customers/3/edit/",
        },
        {
          id: 1,
          name: "بانک ملی",
          is_key: true,
          financial_basis: 120000000000,
          is_active: true,
          edit_url: "/catalog/customers/1/edit/",
        },
      ],
      count: 3,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "q",
            label: "نام",
            help: "",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
          },
          {
            name: "is_key",
            label: "مشتری کلیدی",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "yes",
                label: "کلیدی",
              },
              {
                value: "no",
                label: "غیرکلیدی",
              },
            ],
          },
          {
            name: "status",
            label: "وضعیت",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "active",
                label: "فعال",
              },
              {
                value: "inactive",
                label: "غیرفعال",
              },
            ],
          },
        ],
        errors: [],
        multipart: false,
      },
      create_url: "/catalog/customers/new/",
    } satisfies CustomerList),
    ...overrides,
  };
}

export function serviceList(overrides: Partial<ServiceList> = {}): ServiceList {
  return {
    ...({
      view: "catalog:service_list",
      messages: [],
      title: "خدمات و فرایندها",
      results: [
        {
          id: 2,
          code: "SRV-CORE",
          name: "هسته‌ی بانکی",
          kind: {
            value: "service",
            label: "خدمت",
          },
          org_unit: "مدیریت عملیات",
          owner: {
            id: 2,
            name: "سارا احمدی",
          },
          lifecycle_stage: {
            value: "operation",
            label: "بهره‌برداری",
          },
          is_critical: false,
          is_active: true,
          href: "/catalog/services/2/",
        },
        {
          id: 1,
          code: "SRV-PAY",
          name: "درگاه پرداخت اینترنتی",
          kind: {
            value: "service",
            label: "خدمت",
          },
          org_unit: "مدیریت عملیات",
          owner: {
            id: 3,
            name: "مینا خدمتی",
          },
          lifecycle_stage: {
            value: "operation",
            label: "بهره‌برداری",
          },
          is_critical: true,
          is_active: true,
          href: "/catalog/services/1/",
        },
        {
          id: 3,
          code: "SRV-SMS",
          name: "پیامک بانکی",
          kind: {
            value: "process",
            label: "فرایند",
          },
          org_unit: "مدیریت عملیات",
          owner: {
            id: 2,
            name: "سارا احمدی",
          },
          lifecycle_stage: {
            value: "operation",
            label: "بهره‌برداری",
          },
          is_critical: false,
          is_active: false,
          href: "/catalog/services/3/",
        },
      ],
      count: 3,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "q",
            label: "جست‌وجو",
            help: "",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            placeholder: "کد یا نام خدمت",
          },
          {
            name: "unit",
            label: "واحد مالک",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه‌ی واحدها",
            choices: [
              {
                value: "1",
                label: "معاونت فناوری",
              },
              {
                value: "4",
                label: "— امنیت اطلاعات",
              },
              {
                value: "2",
                label: "— مدیریت عملیات",
              },
              {
                value: "3",
                label: "— — مرکز داده",
              },
            ],
          },
          {
            name: "kind",
            label: "نوع",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "service",
                label: "خدمت",
              },
              {
                value: "process",
                label: "فرایند",
              },
            ],
          },
          {
            name: "is_critical",
            label: "حیاتی",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "yes",
                label: "حیاتی",
              },
              {
                value: "no",
                label: "غیرحیاتی",
              },
            ],
          },
          {
            name: "status",
            label: "وضعیت",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "active",
                label: "فعال",
              },
              {
                value: "inactive",
                label: "غیرفعال",
              },
            ],
          },
        ],
        errors: [],
        multipart: false,
      },
      create_url: "/catalog/services/new/",
    } satisfies ServiceList),
    ...overrides,
  };
}

export function serviceDetail(overrides: Partial<ServiceDetail> = {}): ServiceDetail {
  return {
    ...({
      view: "catalog:service_detail",
      messages: [],
      title: "SRV-PAY - درگاه پرداخت اینترنتی",
      service: {
        id: 1,
        code: "SRV-PAY",
        name: "درگاه پرداخت اینترنتی",
        kind: {
          value: "service",
          label: "خدمت",
        },
        org_unit: "مدیریت عملیات",
        owner: {
          id: 3,
          name: "مینا خدمتی",
        },
        lifecycle_stage: {
          value: "operation",
          label: "بهره‌برداری",
        },
        is_critical: true,
        is_active: true,
        href: "/catalog/services/1/",
        description: "پرداخت آنلاین کارت‌های بانکی برای پذیرندگان اینترنتی.",
        environment: {
          value: "datin",
          label: "داتین",
        },
      },
      commitments: [
        {
          id: 1,
          title: "دسترس‌پذیری ۹۹٫۹ درصد ماهانه",
          description: "محاسبه‌ی ماهانه بدون پنجره‌ی نگهداری.",
          kind: {
            value: "sla",
            label: "SLA",
          },
          clause_ref: "بند ۷-۲",
          customer: "بانک ملی",
          owner: {
            id: 3,
            name: "مینا خدمتی",
          },
          validity: {
            from: {
              iso: "2025-03-21",
              jalali: "1404/01/01",
            },
            until: {
              iso: "2026-03-20",
              jalali: "1404/12/29",
            },
            expired: true,
          },
          edit_url: "/catalog/commitments/1/edit/?service=1",
        },
      ],
      add_commitment_url: "/catalog/commitments/new/?service=1",
      dependencies: [
        {
          id: 2,
          target_kind: "خدمت بالادستی",
          target: "SRV-CORE - هسته‌ی بانکی",
          target_url: "/catalog/services/2/",
          is_shared_point: false,
          description: "تأیید تراکنش",
          alternative: "",
          boundary: null,
          validity: {
            from: null,
            until: null,
            expired: false,
          },
          edit_url: "/catalog/services/dependencies/2/edit/",
        },
        {
          id: 1,
          target_kind: "تأمین‌کننده",
          target: "شرکت ارتباطات زیرساخت",
          target_url: "/catalog/suppliers/1/",
          is_shared_point: true,
          description: "لینک اصلی اینترنت درگاه",
          alternative: "لینک پشتیبان از تأمین‌کننده‌ی دوم",
          boundary: [
            {
              label: "مالک زیرساخت",
              value: "تأمین‌کننده",
            },
            {
              label: "اجراکننده‌ی کنترل",
              value: "داتین",
            },
            {
              label: "ارائه‌دهنده‌ی شاهد",
              value: "-",
            },
            {
              label: "تصمیم‌گیر تغییر",
              value: "-",
            },
            {
              label: "مخاطب اعلام رخداد",
              value: "مرکز عملیات شبکه‌ی تأمین‌کننده",
            },
          ],
          validity: {
            from: null,
            until: null,
            expired: false,
          },
          edit_url: "/catalog/services/dependencies/1/edit/",
        },
        {
          id: 3,
          target_kind: "دارایی",
          target: "AST-DB - پایگاه داده‌ی پرداخت",
          target_url: "/catalog/assets/1/",
          is_shared_point: false,
          description: "نگهداری تراکنش‌ها",
          alternative: "",
          boundary: null,
          validity: {
            from: null,
            until: null,
            expired: false,
          },
          edit_url: "/catalog/services/dependencies/3/edit/",
        },
      ],
      add_dependency: [
        {
          label: "به خدمت دیگر",
          href: "/catalog/services/1/dependencies/new/service/",
        },
        {
          label: "به تأمین‌کننده",
          href: "/catalog/services/1/dependencies/new/supplier/",
        },
        {
          label: "به دارایی",
          href: "/catalog/services/1/dependencies/new/asset/",
        },
      ],
      dependents: [],
      customer_links: [
        {
          id: 1,
          customer: "بانک ملی",
          is_key: true,
          tolerance_notes: "قطع بیش از ۴ ساعت جریمه‌ی قراردادی دارد.",
          rto: "4 ساعت",
          mtpd: "1 روز",
          rpo: "15 دقیقه",
          bia_reference: "BIA-1404-07",
          validity: {
            from: null,
            until: null,
            expired: false,
          },
          edit_url: "/catalog/services/customers/1/edit/",
        },
      ],
      add_customer_url: "/catalog/services/1/customers/new/",
      coverage: {
        cells: [
          {
            category: "T1",
            category_name: "امنیت اطلاعات و سایبری",
            status: {
              value: "reviewed",
              label: "بررسی‌شده",
            },
            summary: "T1 امنیت اطلاعات و سایبری",
            risk_count: 0,
            risks_url: null,
            edit_url: "/risks/coverage/1/1/?next=%2Fcatalog%2Fservices%2F1%2F",
          },
          {
            category: "T2",
            category_name: "نرم‌افزار و توسعه",
            status: {
              value: "not_relevant",
              label: "نامرتبط",
            },
            summary: "T2 نرم‌افزار و توسعه: خدمت داده‌ی شخصی پردازش نمی‌کند",
            risk_count: 0,
            risks_url: null,
            edit_url: "/risks/coverage/1/2/?next=%2Fcatalog%2Fservices%2F1%2F",
          },
          {
            category: "T3",
            category_name: "زیرساخت و فناوری",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T3 زیرساخت و فناوری",
            risk_count: 0,
            risks_url: null,
            edit_url: "/risks/coverage/1/3/?next=%2Fcatalog%2Fservices%2F1%2F",
          },
          {
            category: "T4",
            category_name: "عملیات و ارائه خدمت",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T4 عملیات و ارائه خدمت",
            risk_count: 0,
            risks_url: null,
            edit_url: "/risks/coverage/1/4/?next=%2Fcatalog%2Fservices%2F1%2F",
          },
          {
            category: "T5",
            category_name: "اشخاص ثالث و زنجیره تأمین",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T5 اشخاص ثالث و زنجیره تأمین",
            risk_count: 0,
            risks_url: null,
            edit_url: "/risks/coverage/1/5/?next=%2Fcatalog%2Fservices%2F1%2F",
          },
          {
            category: "T6",
            category_name: "افراد و سازمان",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T6 افراد و سازمان",
            risk_count: 0,
            risks_url: null,
            edit_url: "/risks/coverage/1/6/?next=%2Fcatalog%2Fservices%2F1%2F",
          },
          {
            category: "T7",
            category_name: "تداوم و محیط",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T7 تداوم و محیط",
            risk_count: 0,
            risks_url: null,
            edit_url: "/risks/coverage/1/7/?next=%2Fcatalog%2Fservices%2F1%2F",
          },
          {
            category: "T8",
            category_name: "انطباق و حاکمیت داده",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T8 انطباق و حاکمیت داده",
            risk_count: 0,
            risks_url: null,
            edit_url: "/risks/coverage/1/8/?next=%2Fcatalog%2Fservices%2F1%2F",
          },
        ],
        table_url: "/risks/coverage/?q=SRV-PAY",
      },
      risks: [],
      create_risk_url: "/risks/scenarios/",
      edit_url: "/catalog/services/1/edit/",
      list_url: "/catalog/services/",
    } satisfies ServiceDetail),
    ...overrides,
  };
}

export function serviceDetailForOwner(overrides: Partial<ServiceDetail> = {}): ServiceDetail {
  return {
    ...({
      view: "catalog:service_detail",
      messages: [],
      title: "SRV-PAY - درگاه پرداخت اینترنتی",
      service: {
        id: 1,
        code: "SRV-PAY",
        name: "درگاه پرداخت اینترنتی",
        kind: {
          value: "service",
          label: "خدمت",
        },
        org_unit: "مدیریت عملیات",
        owner: {
          id: 3,
          name: "مینا خدمتی",
        },
        lifecycle_stage: {
          value: "operation",
          label: "بهره‌برداری",
        },
        is_critical: true,
        is_active: true,
        href: "/catalog/services/1/",
        description: "پرداخت آنلاین کارت‌های بانکی برای پذیرندگان اینترنتی.",
        environment: {
          value: "datin",
          label: "داتین",
        },
      },
      commitments: [
        {
          id: 1,
          title: "دسترس‌پذیری ۹۹٫۹ درصد ماهانه",
          description: "محاسبه‌ی ماهانه بدون پنجره‌ی نگهداری.",
          kind: {
            value: "sla",
            label: "SLA",
          },
          clause_ref: "بند ۷-۲",
          customer: "بانک ملی",
          owner: {
            id: 3,
            name: "مینا خدمتی",
          },
          validity: {
            from: {
              iso: "2025-03-21",
              jalali: "1404/01/01",
            },
            until: {
              iso: "2026-03-20",
              jalali: "1404/12/29",
            },
            expired: true,
          },
          edit_url: null,
        },
      ],
      add_commitment_url: null,
      dependencies: [
        {
          id: 2,
          target_kind: "خدمت بالادستی",
          target: "SRV-CORE - هسته‌ی بانکی",
          target_url: null,
          is_shared_point: false,
          description: "تأیید تراکنش",
          alternative: "",
          boundary: null,
          validity: {
            from: null,
            until: null,
            expired: false,
          },
          edit_url: null,
        },
        {
          id: 1,
          target_kind: "تأمین‌کننده",
          target: "شرکت ارتباطات زیرساخت",
          target_url: "/catalog/suppliers/1/",
          is_shared_point: true,
          description: "لینک اصلی اینترنت درگاه",
          alternative: "لینک پشتیبان از تأمین‌کننده‌ی دوم",
          boundary: [
            {
              label: "مالک زیرساخت",
              value: "تأمین‌کننده",
            },
            {
              label: "اجراکننده‌ی کنترل",
              value: "داتین",
            },
            {
              label: "ارائه‌دهنده‌ی شاهد",
              value: "-",
            },
            {
              label: "تصمیم‌گیر تغییر",
              value: "-",
            },
            {
              label: "مخاطب اعلام رخداد",
              value: "مرکز عملیات شبکه‌ی تأمین‌کننده",
            },
          ],
          validity: {
            from: null,
            until: null,
            expired: false,
          },
          edit_url: null,
        },
        {
          id: 3,
          target_kind: "دارایی",
          target: "AST-DB - پایگاه داده‌ی پرداخت",
          target_url: "/catalog/assets/1/",
          is_shared_point: false,
          description: "نگهداری تراکنش‌ها",
          alternative: "",
          boundary: null,
          validity: {
            from: null,
            until: null,
            expired: false,
          },
          edit_url: null,
        },
      ],
      add_dependency: [],
      dependents: [],
      customer_links: [
        {
          id: 1,
          customer: "بانک ملی",
          is_key: true,
          tolerance_notes: "قطع بیش از ۴ ساعت جریمه‌ی قراردادی دارد.",
          rto: "4 ساعت",
          mtpd: "1 روز",
          rpo: "15 دقیقه",
          bia_reference: "BIA-1404-07",
          validity: {
            from: null,
            until: null,
            expired: false,
          },
          edit_url: null,
        },
      ],
      add_customer_url: null,
      coverage: {
        cells: [
          {
            category: "T1",
            category_name: "امنیت اطلاعات و سایبری",
            status: {
              value: "reviewed",
              label: "بررسی‌شده",
            },
            summary: "T1 امنیت اطلاعات و سایبری",
            risk_count: 0,
            risks_url: null,
            edit_url: null,
          },
          {
            category: "T2",
            category_name: "نرم‌افزار و توسعه",
            status: {
              value: "not_relevant",
              label: "نامرتبط",
            },
            summary: "T2 نرم‌افزار و توسعه: خدمت داده‌ی شخصی پردازش نمی‌کند",
            risk_count: 0,
            risks_url: null,
            edit_url: null,
          },
          {
            category: "T3",
            category_name: "زیرساخت و فناوری",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T3 زیرساخت و فناوری",
            risk_count: 0,
            risks_url: null,
            edit_url: null,
          },
          {
            category: "T4",
            category_name: "عملیات و ارائه خدمت",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T4 عملیات و ارائه خدمت",
            risk_count: 0,
            risks_url: null,
            edit_url: null,
          },
          {
            category: "T5",
            category_name: "اشخاص ثالث و زنجیره تأمین",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T5 اشخاص ثالث و زنجیره تأمین",
            risk_count: 0,
            risks_url: null,
            edit_url: null,
          },
          {
            category: "T6",
            category_name: "افراد و سازمان",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T6 افراد و سازمان",
            risk_count: 0,
            risks_url: null,
            edit_url: null,
          },
          {
            category: "T7",
            category_name: "تداوم و محیط",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T7 تداوم و محیط",
            risk_count: 0,
            risks_url: null,
            edit_url: null,
          },
          {
            category: "T8",
            category_name: "انطباق و حاکمیت داده",
            status: {
              value: "pending",
              label: "در انتظار بررسی",
            },
            summary: "T8 انطباق و حاکمیت داده",
            risk_count: 0,
            risks_url: null,
            edit_url: null,
          },
        ],
        table_url: "/risks/coverage/?q=SRV-PAY",
      },
      risks: [],
      create_risk_url: null,
      edit_url: null,
      list_url: "/catalog/services/",
    } satisfies ServiceDetail),
    ...overrides,
  };
}

export function supplierList(overrides: Partial<SupplierList> = {}): SupplierList {
  return {
    ...({
      view: "catalog:supplier_list",
      messages: [],
      title: "تأمین‌کنندگان",
      results: [
        {
          id: 1,
          name: "شرکت ارتباطات زیرساخت",
          description: "لینک اینترنت و انتقال داده",
          is_critical: true,
          contract_owner: {
            id: 2,
            name: "سارا احمدی",
          },
          is_active: true,
          href: "/catalog/suppliers/1/",
        },
        {
          id: 2,
          name: "شرکت پشتیبانی سخت‌افزار",
          description: "",
          is_critical: false,
          contract_owner: null,
          is_active: true,
          href: "/catalog/suppliers/2/",
        },
      ],
      count: 2,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "q",
            label: "جست‌وجو",
            help: "",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            placeholder: "نام یا خدمت و کالا",
          },
          {
            name: "is_critical",
            label: "حیاتی",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "yes",
                label: "حیاتی",
              },
              {
                value: "no",
                label: "غیرحیاتی",
              },
            ],
          },
          {
            name: "status",
            label: "وضعیت",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "active",
                label: "فعال",
              },
              {
                value: "inactive",
                label: "غیرفعال",
              },
            ],
          },
        ],
        errors: [],
        multipart: false,
      },
      create_url: "/catalog/suppliers/new/",
    } satisfies SupplierList),
    ...overrides,
  };
}

export function supplierDetail(overrides: Partial<SupplierDetail> = {}): SupplierDetail {
  return {
    ...({
      view: "catalog:supplier_detail",
      messages: [],
      title: "شرکت ارتباطات زیرساخت",
      supplier: {
        id: 1,
        name: "شرکت ارتباطات زیرساخت",
        description: "لینک اینترنت و انتقال داده",
        is_critical: true,
        contract_owner: {
          id: 2,
          name: "سارا احمدی",
        },
        is_active: true,
        href: "/catalog/suppliers/1/",
      },
      dependents: [
        {
          id: 1,
          service: {
            code: "SRV-PAY",
            name: "درگاه پرداخت اینترنتی",
            is_critical: true,
            href: "/catalog/services/1/",
          },
          is_shared_point: true,
          description: "لینک اصلی اینترنت درگاه",
          validity: {
            from: null,
            until: null,
            expired: false,
          },
        },
      ],
      edit_url: "/catalog/suppliers/1/edit/",
      list_url: "/catalog/suppliers/",
    } satisfies SupplierDetail),
    ...overrides,
  };
}

export function assetList(overrides: Partial<AssetList> = {}): AssetList {
  return {
    ...({
      view: "catalog:asset_list",
      messages: [],
      title: "دارایی‌ها",
      results: [
        {
          id: 1,
          code: "AST-DB",
          name: "پایگاه داده‌ی پرداخت",
          kind: {
            value: "system",
            label: "سامانه و نرم‌افزار",
          },
          org_unit: "مدیریت عملیات",
          owner: {
            id: 3,
            name: "مینا خدمتی",
          },
          data_class: {
            value: "confidential",
            label: "محرمانه",
          },
          cia: ["C", "I", "A"],
          is_active: true,
          href: "/catalog/assets/1/",
        },
        {
          id: 2,
          code: "AST-HSM",
          name: "ماژول امنیت سخت‌افزاری",
          kind: {
            value: "hardware",
            label: "سخت‌افزار و شبکه",
          },
          org_unit: "مدیریت عملیات",
          owner: {
            id: 2,
            name: "سارا احمدی",
          },
          data_class: null,
          cia: [],
          is_active: true,
          href: "/catalog/assets/2/",
        },
      ],
      count: 2,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "q",
            label: "جست‌وجو",
            help: "",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            placeholder: "کد یا نام دارایی",
          },
          {
            name: "unit",
            label: "واحد مالک",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه‌ی واحدها",
            choices: [
              {
                value: "1",
                label: "معاونت فناوری",
              },
              {
                value: "4",
                label: "— امنیت اطلاعات",
              },
              {
                value: "2",
                label: "— مدیریت عملیات",
              },
              {
                value: "3",
                label: "— — مرکز داده",
              },
            ],
          },
          {
            name: "kind",
            label: "نوع",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "system",
                label: "سامانه و نرم‌افزار",
              },
              {
                value: "hardware",
                label: "سخت‌افزار و شبکه",
              },
              {
                value: "information",
                label: "اطلاعات",
              },
              {
                value: "site",
                label: "مکان",
              },
              {
                value: "people",
                label: "نیروی انسانی",
              },
            ],
          },
          {
            name: "data_class",
            label: "طبقه‌ی اطلاعات",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "public",
                label: "عمومی",
              },
              {
                value: "internal",
                label: "درون‌سازمانی",
              },
              {
                value: "confidential",
                label: "محرمانه",
              },
            ],
          },
          {
            name: "status",
            label: "وضعیت",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "active",
                label: "فعال",
              },
              {
                value: "inactive",
                label: "غیرفعال",
              },
            ],
          },
        ],
        errors: [],
        multipart: false,
      },
      create_url: "/catalog/assets/new/",
    } satisfies AssetList),
    ...overrides,
  };
}

export function assetDetail(overrides: Partial<AssetDetail> = {}): AssetDetail {
  return {
    ...({
      view: "catalog:asset_detail",
      messages: [],
      title: "AST-DB - پایگاه داده‌ی پرداخت",
      asset: {
        id: 1,
        code: "AST-DB",
        name: "پایگاه داده‌ی پرداخت",
        kind: {
          value: "system",
          label: "سامانه و نرم‌افزار",
        },
        org_unit: "مدیریت عملیات",
        owner: {
          id: 3,
          name: "مینا خدمتی",
        },
        data_class: {
          value: "confidential",
          label: "محرمانه",
        },
        cia: ["C", "I", "A"],
        is_active: true,
        href: "/catalog/assets/1/",
      },
      dependents: [
        {
          id: 4,
          service: {
            code: "SRV-CORE",
            name: "هسته‌ی بانکی",
            is_critical: false,
            href: "/catalog/services/2/",
          },
          is_shared_point: false,
          description: "",
          validity: {
            from: null,
            until: null,
            expired: false,
          },
        },
        {
          id: 3,
          service: {
            code: "SRV-PAY",
            name: "درگاه پرداخت اینترنتی",
            is_critical: true,
            href: "/catalog/services/1/",
          },
          is_shared_point: false,
          description: "نگهداری تراکنش‌ها",
          validity: {
            from: null,
            until: null,
            expired: false,
          },
        },
      ],
      edit_url: "/catalog/assets/1/edit/",
      list_url: "/catalog/assets/",
    } satisfies AssetDetail),
    ...overrides,
  };
}

export function commitmentList(overrides: Partial<CommitmentList> = {}): CommitmentList {
  return {
    ...({
      view: "catalog:commitment_list",
      messages: [],
      title: "تعهدها",
      results: [
        {
          id: 1,
          title: "دسترس‌پذیری ۹۹٫۹ درصد ماهانه",
          description: "محاسبه‌ی ماهانه بدون پنجره‌ی نگهداری.",
          kind: {
            value: "sla",
            label: "SLA",
          },
          clause_ref: "بند ۷-۲",
          services: [
            {
              code: "SRV-CORE",
              href: "/catalog/services/2/",
            },
            {
              code: "SRV-PAY",
              href: "/catalog/services/1/",
            },
          ],
          customer: "بانک ملی",
          owner: {
            id: 3,
            name: "مینا خدمتی",
          },
          validity: {
            from: {
              iso: "2025-03-21",
              jalali: "1404/01/01",
            },
            until: {
              iso: "2026-03-20",
              jalali: "1404/12/29",
            },
            expired: true,
          },
          edit_url: "/catalog/commitments/1/edit/",
        },
      ],
      count: 1,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "q",
            label: "جست‌وجو",
            help: "",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            placeholder: "عنوان یا مرجع بند",
          },
          {
            name: "kind",
            label: "نوع",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "sla",
                label: "SLA",
              },
              {
                value: "contract",
                label: "قرارداد",
              },
              {
                value: "regulatory",
                label: "الزام قانونی یا نظارتی",
              },
              {
                value: "internal",
                label: "الزام داخلی",
              },
            ],
          },
        ],
        errors: [],
        multipart: false,
      },
      create_url: "/catalog/commitments/new/",
    } satisfies CommitmentList),
    ...overrides,
  };
}

export function unitList(overrides: Partial<UnitList> = {}): UnitList {
  return {
    ...({
      view: "organization:unit_list",
      messages: [],
      title: "ساختار سازمانی",
      results: [
        {
          id: 1,
          name: "معاونت فناوری",
          code: "IT",
          depth: 0,
          managers: [],
          is_active: true,
          edit_url: "/units/1/edit/",
        },
        {
          id: 4,
          name: "امنیت اطلاعات",
          code: "SEC",
          depth: 1,
          managers: [],
          is_active: true,
          edit_url: "/units/4/edit/",
        },
        {
          id: 2,
          name: "مدیریت عملیات",
          code: "OPS",
          depth: 1,
          managers: [
            {
              id: 3,
              name: "مینا خدمتی",
            },
          ],
          is_active: true,
          edit_url: "/units/2/edit/",
        },
        {
          id: 3,
          name: "مرکز داده",
          code: "DC",
          depth: 2,
          managers: [],
          is_active: true,
          edit_url: "/units/3/edit/",
        },
      ],
      count: 4,
      page: 1,
      pages: 1,
      filters: null,
      create_url: "/units/new/",
    } satisfies UnitList),
    ...overrides,
  };
}

export function methodPage(overrides: Partial<MethodPage> = {}): MethodPage {
  return {
    ...({
      view: "methodology:active",
      messages: [],
      title: "روش ارزیابی، نسخه‌ی 1: روش v5",
      version: {
        number: 1,
        name: "نسخه‌ی 1: روش v5",
        status: {
          value: "active",
          label: "فعال",
        },
        is_trial: true,
        source: "متدولوژی مدیریت و ارزیابی ریسک داتین، نسخه ۵ (تاریخ تدوین ۱۲ مهر ۱۴۰۵)",
        based_on: null,
        approval_ref: "",
        approved_on: null,
        approval_recorded_by: null,
        activated_at: {
          iso: "2026-11-09T15:58:19.592187+00:00",
          jalali: "1405/08/18 19:28",
        },
        change_notes:
          "نسخه‌ی اول، با همه‌ی مقدارهای سند v5. پارامترهای بخش ۳۲ سند هنوز تصویب نشده‌اند و این نسخه تا تصویب «آزمایشی» است (س۱۲، ۱۱ آبان ۱۴۰۵).\n\nقاعده‌های Bc از جدول بخش ۱۵ آمده‌اند: یک کنترل E2 یعنی Bc برابر ۴، یک کنترل E3 یعنی ۳، یک کنترل E4 یا E5 یعنی ۲ و دو کنترل E4 یا E5 مستقل یعنی ۱. مثال‌هایی از سند که کنترل E3 را Bc برابر ۲ گرفته‌اند با این جدول نمی‌خوانند و باید اصلاح شوند (س۱۱، ۱۱ آبان ۱۴۰۵).",
        likelihood_strategy: {
          value: "paths_v5",
          label: "مسیرمحور v5",
        },
        impact_strategy: {
          value: "max",
          label: "بیشترین سطح",
        },
        impact_guidance:
          "پیامد، نتیجه قابل دفاع وقوع رویداد تعریف‌شده است. ارزیاب یک وضعیت شدید اما باورپذیر با زنجیره علّی روشن انتخاب می‌کند؛ کنار هم گذاشتن بدترین پیامدهای ناسازگار مجاز نیست. اگر پیامد شدید فقط با یک شرط اضافی مستقل رخ می‌دهد، آن شرط در مسیر احتمال وارد یا سناریوی تشدید جداگانه ثبت شود.\n\n## داتین و بانک و انتشار بین مشتریان\n\nابتدا پیامد برای داتین و هر بانک مهم جدا ارزیابی و سپس بیشترین سطح انتخاب می‌شود. پیامد هم‌زمان چند مشتری فقط وقتی ثبت می‌شود که وابستگی یا علت مشترک مستند باشد. داشتن دو مشتری به‌خودی‌خود امتیاز اضافه ندارد؛ عبور مشترک خدمات حیاتی از حدود تحمل در معیار S لحاظ می‌شود.",
        decision_guidance:
          "L و I اعداد صحیح ۱ تا ۵ هستند. خروجی ۱ تا ۲۵ و فاقد اعشار است. از گرد کردن، میانگین نمره ارزیاب‌ها یا تغییر عدد برای رسیدن به سطح دلخواه استفاده نشود. آستانه پایه: پایین ۱ تا ۴؛ متوسط ۵ تا ۹؛ بالا ۱۰ تا ۱۵؛ بحرانی ۱۶ تا ۲۵.\n\n## قواعد تقدم بر امتیاز\n\n• پیامد ۵ حتی با احتمال ۱ حداقل سطح «بالا» دارد؛ پیامد ۴ حداقل «متوسط» است. عدد خام تغییر نمی‌کند و علت ارتقای سطح ثبت می‌شود.",
        acceptance_guidance:
          "جهت‌گیری پیشنهادی داتین، پذیرش ریسک پایین در حدود تعهدات، مدیریت فعال ریسک متوسط و کاهش یا اجتناب از ریسک بالا و بحرانی است. این بیان و جدول زیر پس از تصویب مرجع مجاز نافذ می‌شوند. حدود تحمل خدمت، قرارداد و مقررات بر اختیار عمومی جدول مقدم‌اند.",
      },
      versions: [
        {
          number: 1,
          name: "نسخه‌ی 1: روش v5",
          status: {
            value: "active",
            label: "فعال",
          },
          current: true,
          href: "/method/1/",
        },
        {
          number: 2,
          name: "نسخه‌ی 2: بازنگری پارامترها",
          status: {
            value: "draft",
            label: "پیش‌نویس",
          },
          current: false,
          href: "/method/2/",
        },
      ],
      likelihood_scales: [
        {
          code: "A",
          name: "عامل آغازگر",
          scope: "عامل آغازکننده سناریو با چه فراوانی یا چه میزان شواهدی ممکن است رخ دهد؟",
          description:
            "برای آغازگرهای غیرعمدی یا تکرارشونده با داده قابل مقایسه، نرخ سالانه برآورد می‌شود. برای حمله هدفمند یا نبود داده معتبر، ستون شواهد آینده‌نگر به کار می‌رود. مسیر انتخابی و دلیل آن الزامی است؛ ستون‌ها با هم جمع یا میانگین نمی‌شوند.",
          guidance:
            "نرخ از تعداد آغازگر یکتا تقسیم بر سال‌های مشاهده، با تعدیل موجه دامنه به دست می‌آید. مرزهای عددی متعلق به روش سازمانی‌اند. نرخ سالانه یک نوع آغازگر، درصد احتمال تحقق سناریوی نهایی نیست.",
          has_level_names: false,
          has_bounds: true,
          levels: [
            {
              value: 1,
              name: "",
              bounds: "کمتر از 0.1 بار در سال",
              criteria:
                "شواهد مثبت درباره محدودیت شدید هدف‌گیری و نبود فعالیت مرتبط در منابع پوشش‌دهنده؛ صرف نبود لاگ کافی نیست.",
            },
            {
              value: 2,
              name: "",
              bounds: "از 0.1 تا کمتر از 1 بار در سال",
              criteria:
                "تلاش مرتبط فقط در موارد نادر و محیط متفاوت مشاهده شده؛ قرینه معتبر هدف‌گیری داتین یا فناوری مشابه در دوره اخیر وجود ندارد.",
            },
            {
              value: 3,
              name: "",
              bounds: "از 1 تا کمتر از 10 بار در سال",
              criteria:
                "فعالیت مرتبط در فناوری یا خدمت مشابه طی ۱۲ ماه؛ هدف‌گیری مستقیم یا فعالیت جاری تأیید نشده است.",
            },
            {
              value: 4,
              name: "",
              bounds: "از 10 تا کمتر از 100 بار در سال",
              criteria:
                "هدف‌گیری معتبر سازمان یا مشتری یا بخش بانکی با روش مرتبط طی ۹۰ روز؛ یا تلاش مرتبط مستقیم تأییدشده.",
            },
            {
              value: 5,
              name: "",
              bounds: "100 بار در سال یا بیشتر",
              criteria:
                "حمله یا کارزار فعال مرتبط با دامنه در ۳۰ روز اخیر؛ یا تلاش‌های مرتبط مستمر و تأییدشده در محیط.",
            },
          ],
        },
        {
          code: "Bc",
          name: "اعتبار موانع پیشگیرانه",
          scope: "",
          description:
            "پس از تعیین قابلیت پایه هر مسیر (B0)، کنترل‌هایی بررسی می‌شوند که می‌توانند از رسیدن عامل آغازگر به رویداد اصلی جلوگیری کنند. اثربخشی هر کنترل با شاخص E ارزیابی و سپس بر اساس وضعیت مجموعه کنترل‌های همان مسیر، امتیاز Bc تعیین می‌شود.",
          guidance: "## قواعد انتخاب سطح",
          has_level_names: true,
          has_bounds: false,
          levels: [
            {
              value: 1,
              name: "حداقل دو مانع مؤثر و مستقل",
              bounds: null,
              criteria:
                "حداقل دو کنترل با سطح E4 یا E5 وجود دارد که هرکدام به‌تنهایی قادر به جلوگیری از تحقق همان مسیر هستند. شکست یا دورزدن یکی، دیگری را بی‌اثر نمی‌کند. وابستگی‌های مشترک و حالت‌های شکست هم‌زمان بررسی شده و برای موارد مرتبط، استقلال یا کنترل شکست مشترک با شواهد آزمون تأیید شده است. صرف وجود دو ابزار، دو تأیید یا دو نام کنترل کافی نیست.",
            },
            {
              value: 2,
              name: "مانع با اثربخشی پایدار",
              bounds: null,
              criteria:
                "حداقل یک کنترل E4 یا E5 شرایط پوشش و آزمون رتبه ۳ را دارد؛ علاوه بر آن، سوابق معتبر نشان می‌دهد کنترل در دوره بررسی به‌طور مستمر عمل کرده و نتیجه توسط ارزیاب مستقل از مجری تأیید شده است. تغییرات مهم و استثناهای مرتبط بررسی شده‌اند و راه دورزدن شناخته‌شده‌ای که همه موانع معتبر را بی‌اثر کند، باز نیست.",
            },
            {
              value: 3,
              name: "مانع مؤثر در ارزیابی فعلی",
              bounds: null,
              criteria:
                "حداقل یک کنترل E3 وجود دارد که در تمام موارد مرتبط با مسیر اعمال می‌شود و آزمون عملی نشان می‌دهد می‌تواند از تحقق رویداد اصلی جلوگیری کند. راه دورزدن شناخته‌شده‌ای که این مانع را بی‌اثر کند، باز نیست؛ اما شواهد عملکرد در طول زمان یا تأیید مستقل لازم برای E4 هنوز کامل نشده است.",
            },
            {
              value: 4,
              name: "مانع با اثر محدود و اثبات‌شده",
              bounds: null,
              criteria:
                "حداقل یک کنترل E2 وجود دارد که شواهد مشخص نشان می‌دهد واقعاً تحقق مسیر را محدود می‌کند؛ اما پوشش، قابلیت جلوگیری یا دامنه آزمون آن برای احراز E3 کافی نیست. صرف وجود کنترل ناقص یا آزمون‌نشده برای این رتبه کافی نیست. اگر نقص کنترل یک راه عبور کامل از همه موانع ایجاد کرده باشد، آن راه لازم است جداگانه بررسی و در نبود مانع معتبر، Bc=5 دریافت کند.",
            },
            {
              value: 5,
              name: "فاقد مانع با اثر اثبات‌شده",
              bounds: null,
              criteria:
                "کنترل پیشگیرانه مرتبط وجود ندارد؛ یا صرفاً مستند، طراحی یا نصب شده و اثر آن اثبات نشده است؛ یا مسیر شناخته‌شده‌ای وجود دارد که همه موانع معتبر را دور می‌زند و به رویداد اصلی می‌رسد. کنترل E1 اعتبار کاهش ایجاد نمی‌کند. نبود شواهد کافی نیز به‌تنهایی مجوز کاهش این امتیاز نیست.",
            },
          ],
        },
      ],
      bc_rules: [
        {
          condition: "دست‌کم یک کنترل با E2 یا بالاتر",
          bc: 4,
        },
        {
          condition: "دست‌کم یک کنترل با E3 یا بالاتر",
          bc: 3,
        },
        {
          condition: "دست‌کم یک کنترل با E4 یا بالاتر",
          bc: 2,
        },
        {
          condition: "دست‌کم 2 کنترل با E4 یا بالاتر، مستقل از هم",
          bc: 1,
        },
      ],
      bc_default: 5,
      l_scale: {
        code: "L",
        name: "احتمال نهایی",
        scope: "ترکیب A و B چه رتبه‌ای برای امکان تحقق سناریو ایجاد می‌کند؟",
        description:
          "پس از تعیین A و B، فقط از جدول زیر برای L استفاده شود. ترکیب کیفی جدول G-5 راهنمای NIST SP 800-30 به برچسب‌های ۱ تا ۵ نگاشت شده است. آستانه‌های شواهد A و B در این سند بومی‌سازی شده‌اند. این جدول، رابطه احتمال آماری دو متغیر نیست. [۴]",
        guidance:
          "L1 بسیار کم، L2 کم، L3 متوسط، L4 زیاد و L5 بسیار زیاد است. این برچسب‌ها فقط رتبه احتمال تحقق سناریو را نشان می‌دهند؛ از آن‌ها درصد احتمال یا فراوانی نهایی استنتاج نشود.",
        has_level_names: true,
        has_bounds: false,
        levels: [
          {
            value: 1,
            name: "بسیار کم",
            bounds: null,
            criteria: "",
          },
          {
            value: 2,
            name: "کم",
            bounds: null,
            criteria: "",
          },
          {
            value: 3,
            name: "متوسط",
            bounds: null,
            criteria: "",
          },
          {
            value: 4,
            name: "زیاد",
            bounds: null,
            criteria: "",
          },
          {
            value: 5,
            name: "بسیار زیاد",
            bounds: null,
            criteria: "",
          },
        ],
        grid: [
          {
            a: 1,
            values: [1, 1, 2, 2, 2],
          },
          {
            a: 2,
            values: [1, 2, 2, 3, 3],
          },
          {
            a: 3,
            values: [2, 2, 3, 3, 4],
          },
          {
            a: 4,
            values: [2, 3, 3, 4, 5],
          },
          {
            a: 5,
            values: [2, 3, 4, 5, 5],
          },
        ],
      },
      levels_range: [1, 2, 3, 4, 5],
      impact_scales: [
        {
          code: "S",
          name: "خدمت و تداوم",
          scope: "توقف، افت کیفیت، زمان بازیابی، گستره مشتری و انتشار اختلال",
          description:
            "RTO زمان هدف بازیابی و MTPD حداکثر دوره قابل تحمل اختلال است. برای هر خدمت حیاتی لازم است مقادیر مصوب و واحد زمانی یکسان وجود داشته باشد. زمان اختلال d، مدت از دست رفتن خدمت یا تأخیر معادلِ قابل توجیه در سناریو است. نقض RTO لزوماً نقض SLA نیست و هر یک جدا بررسی می‌شود.",
          guidance: "## قواعد تکمیلی",
          has_level_names: false,
          has_bounds: false,
          levels: [
            {
              value: 0,
              name: "",
              bounds: null,
              criteria: "هیچ اثر قابل مشاهده‌ای بر ارائه خدمت وجود ندارد.",
            },
            {
              value: 1,
              name: "",
              bounds: null,
              criteria:
                "اختلال صرفاً داخلی و غیرحیاتی؛ زمان d حداکثر یک‌چهارم RTO همان فعالیت است و تعهد مشتری متأثر نیست.",
            },
            {
              value: 2,
              name: "",
              bounds: null,
              criteria:
                "اختلال خدمت حیاتی با d حداکثر یک‌چهارم RTO؛ یا اختلال غیرحیاتی بیش از یک‌چهارم RTO تا خود RTO.",
            },
            {
              value: 3,
              name: "",
              bounds: null,
              criteria:
                "اختلال خدمت حیاتی با d بیش از یک‌چهارم RTO و حداکثر RTO؛ یا عبور فعالیت غیرحیاتی از RTO بدون معیار شدیدتر.",
            },
            {
              value: 4,
              name: "",
              bounds: null,
              criteria:
                "اختلال یک خدمت حیاتی با d بیش از RTO و کمتر از MTPD؛ یا از دست رفتن ظرفیت لازم که نقض مشابهی ایجاد کند.",
            },
            {
              value: 5,
              name: "",
              bounds: null,
              criteria:
                "d برابر یا بیشتر از MTPD خدمت حیاتی؛ یا اختلال با علت مشترک در خدمات حیاتی حداقل دو بانک، که در هر دو از RTO عبور کند؛ یا توقف زنجیره‌ای حیاتی با پیامد هم‌ارز مستند.",
            },
          ],
        },
        {
          code: "F",
          name: "مالی",
          scope: "هزینه بازیابی، جبران، خسارت و درآمد از دست‌رفته بدون تکرار",
          description:
            "مبنای مالی، درآمد عملیاتی تأییدشده ۱۲ ماه اخیر داتین است. زیان ناخالص باورپذیر یک تحقق سناریو به این درآمد تقسیم و طبق جدول امتیازدهی می‌شود. برای بانک، از مبنای مالی مورد تأیید همان بانک استفاده شود؛ مبلغ خسارت بانک با درآمد داتین نرمال‌سازی نمی‌شود.",
          guidance:
            "واحد پول، تاریخ مبنا، هزینه مستقیم، بازیابی، جبران مشتری و درآمد از دست‌رفته ثبت شود. هزینه مشترک فقط یک بار محاسبه شود. بیمه و تضمین، زیان خالص را جدا نشان می‌دهند؛ تا تأیید پوشش و قابلیت وصول، امتیاز مالی ناخالص مبنای تصمیم است. نبود داده مالی، امتیاز صفر ایجاد نمی‌کند.",
          has_level_names: false,
          has_bounds: true,
          levels: [
            {
              value: 0,
              name: "",
              bounds: null,
              criteria: "زیان قابل انتساب ندارد",
            },
            {
              value: 1,
              name: "",
              bounds: "بیش از 0 تا 0.01 درصد",
              criteria: "بیش از صفر تا ۰٫۰۱ درصد",
            },
            {
              value: 2,
              name: "",
              bounds: "بیش از 0.01 تا 0.1 درصد",
              criteria: "بیش از ۰٫۰۱ تا ۰٫۱ درصد",
            },
            {
              value: 3,
              name: "",
              bounds: "بیش از 0.1 تا 0.5 درصد",
              criteria: "بیش از ۰٫۱ تا ۰٫۵ درصد",
            },
            {
              value: 4,
              name: "",
              bounds: "بیش از 0.5 تا 2 درصد",
              criteria: "بیش از ۰٫۵ تا ۲ درصد",
            },
            {
              value: 5,
              name: "",
              bounds: "بیش از 2 درصد",
              criteria: "بیش از ۲ درصد یا تهدید مستند نقدینگی و ادامه فعالیت",
            },
          ],
        },
      ],
      risk_levels: [
        {
          name: "پایین",
          color: "#198754",
          text_color: "#fff",
          min_score: 1,
          max_score: 4,
          decision_rule: "مالک ریسک؛ پذیرش مستند با پایش کافی است.",
          co_approver: "هیچ‌کس؛ فقط مالک ریسک",
          containment: null,
          plan: "30 روز تقویمی",
          acceptance: "12 ماه",
          review: "6 ماه",
        },
        {
          name: "متوسط",
          color: "#ffc107",
          text_color: "#000",
          min_score: 5,
          max_score: 9,
          decision_rule: "مالک ریسک و مجوز مدیر بالادست طبق تفویض؛ کاهش یا پذیرش مستدل با تأیید روش‌شناختی امنیت.",
          co_approver: "مدیر بالادست",
          containment: null,
          plan: "30 روز تقویمی",
          acceptance: "6 ماه",
          review: "3 ماه",
        },
        {
          name: "بالا",
          color: "#fd7e14",
          text_color: "#000",
          min_score: 10,
          max_score: 15,
          decision_rule:
            "طرح مواجهه الزامی؛ مالک ریسک همراه مجوز کمیته امنیت با امکان تفویض. پذیرش صرفاً موقت و استثنایی.",
          co_approver: "کمیته امنیت",
          containment: null,
          plan: "10 روز کاری",
          acceptance: "90 روز تقویمی",
          review: "1 ماه",
        },
        {
          name: "بحرانی",
          color: "#dc3545",
          text_color: "#fff",
          min_score: 16,
          max_score: 25,
          decision_rule: "ارجاع فوری به کمیته امنیت؛ اقدام مهار بی‌درنگ. ادامه موقت فقط با ضرورت مستند و اختیار رسمی.",
          co_approver: "کمیته امنیت",
          containment: "24 ساعت",
          plan: "3 روز کاری",
          acceptance: "30 روز تقویمی",
          review: "1 هفته",
        },
      ],
      floors: [
        {
          min_impact: 4,
          min_level: "متوسط",
        },
        {
          min_impact: 5,
          min_level: "بالا",
        },
      ],
      decision_matrix: [
        {
          likelihood: 1,
          cells: [
            {
              score: 1,
              level: {
                name: "پایین",
                color: "#198754",
                text_color: "#fff",
              },
              raised: false,
            },
            {
              score: 2,
              level: {
                name: "پایین",
                color: "#198754",
                text_color: "#fff",
              },
              raised: false,
            },
            {
              score: 3,
              level: {
                name: "پایین",
                color: "#198754",
                text_color: "#fff",
              },
              raised: false,
            },
            {
              score: 4,
              level: {
                name: "متوسط",
                color: "#ffc107",
                text_color: "#000",
              },
              raised: true,
            },
            {
              score: 5,
              level: {
                name: "بالا",
                color: "#fd7e14",
                text_color: "#000",
              },
              raised: true,
            },
          ],
        },
        {
          likelihood: 2,
          cells: [
            {
              score: 2,
              level: {
                name: "پایین",
                color: "#198754",
                text_color: "#fff",
              },
              raised: false,
            },
            {
              score: 4,
              level: {
                name: "پایین",
                color: "#198754",
                text_color: "#fff",
              },
              raised: false,
            },
            {
              score: 6,
              level: {
                name: "متوسط",
                color: "#ffc107",
                text_color: "#000",
              },
              raised: false,
            },
            {
              score: 8,
              level: {
                name: "متوسط",
                color: "#ffc107",
                text_color: "#000",
              },
              raised: false,
            },
            {
              score: 10,
              level: {
                name: "بالا",
                color: "#fd7e14",
                text_color: "#000",
              },
              raised: false,
            },
          ],
        },
        {
          likelihood: 3,
          cells: [
            {
              score: 3,
              level: {
                name: "پایین",
                color: "#198754",
                text_color: "#fff",
              },
              raised: false,
            },
            {
              score: 6,
              level: {
                name: "متوسط",
                color: "#ffc107",
                text_color: "#000",
              },
              raised: false,
            },
            {
              score: 9,
              level: {
                name: "متوسط",
                color: "#ffc107",
                text_color: "#000",
              },
              raised: false,
            },
            {
              score: 12,
              level: {
                name: "بالا",
                color: "#fd7e14",
                text_color: "#000",
              },
              raised: false,
            },
            {
              score: 15,
              level: {
                name: "بالا",
                color: "#fd7e14",
                text_color: "#000",
              },
              raised: false,
            },
          ],
        },
        {
          likelihood: 4,
          cells: [
            {
              score: 4,
              level: {
                name: "پایین",
                color: "#198754",
                text_color: "#fff",
              },
              raised: false,
            },
            {
              score: 8,
              level: {
                name: "متوسط",
                color: "#ffc107",
                text_color: "#000",
              },
              raised: false,
            },
            {
              score: 12,
              level: {
                name: "بالا",
                color: "#fd7e14",
                text_color: "#000",
              },
              raised: false,
            },
            {
              score: 16,
              level: {
                name: "بحرانی",
                color: "#dc3545",
                text_color: "#fff",
              },
              raised: false,
            },
            {
              score: 20,
              level: {
                name: "بحرانی",
                color: "#dc3545",
                text_color: "#fff",
              },
              raised: false,
            },
          ],
        },
        {
          likelihood: 5,
          cells: [
            {
              score: 5,
              level: {
                name: "متوسط",
                color: "#ffc107",
                text_color: "#000",
              },
              raised: false,
            },
            {
              score: 10,
              level: {
                name: "بالا",
                color: "#fd7e14",
                text_color: "#000",
              },
              raised: false,
            },
            {
              score: 15,
              level: {
                name: "بالا",
                color: "#fd7e14",
                text_color: "#000",
              },
              raised: false,
            },
            {
              score: 20,
              level: {
                name: "بحرانی",
                color: "#dc3545",
                text_color: "#fff",
              },
              raised: false,
            },
            {
              score: 25,
              level: {
                name: "بحرانی",
                color: "#dc3545",
                text_color: "#fff",
              },
              raised: false,
            },
          ],
        },
      ],
      parameters: [
        {
          key: "horizon",
          label: "افق پیش‌فرض ارزیابی",
          value: "12",
          unit: "ماه",
          note: "بخش ۱۳ سند v5",
        },
        {
          key: "input_return",
          label: "مهلت پیشنهادی جواب ورودی مبهم",
          value: "5",
          unit: "روز کاری",
          note: "بخش ۴ سند v5",
        },
        {
          key: "a_data_period",
          label: "کمترین دوره‌ی داده برای نرخ A",
          value: "12",
          unit: "ماه",
          note: "بخش ۱۴ سند v5",
        },
        {
          key: "a_data_coverage",
          label: "کمترین پوشش ثبت دامنه‌ی آغازگر",
          value: "95",
          unit: "درصد",
          note: "بخش ۱۴ سند v5",
        },
      ],
      active_url: "/method/",
    } satisfies MethodPage),
    ...overrides,
  };
}

export function dependencyForm(overrides: Partial<FormPageData> = {}): FormPageData {
  return {
    ...({
      view: "catalog:dependency_create",
      title: "وابستگی خدمت SRV-PAY - درگاه پرداخت اینترنتی به تأمین‌کننده",
      form: {
        fields: [
          {
            name: "supplier",
            label: "تأمین‌کننده",
            help: "",
            required: true,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "- انتخاب کنید -",
            choices: [
              {
                value: "2",
                label: "شرکت پشتیبانی سخت‌افزار",
              },
            ],
          },
          {
            name: "description",
            label: "شرح",
            help: "خدمت برای چه کاری به آن وابسته است.",
            required: false,
            disabled: false,
            kind: "textarea",
            value: "",
            errors: [],
            rows: 2,
          },
          {
            name: "alternative",
            label: "جایگزین",
            help: "اگر از کار بیفتد، مسیر جایگزین چیست.",
            required: false,
            disabled: false,
            kind: "textarea",
            value: "",
            errors: [],
            rows: 2,
          },
          {
            name: "is_shared_point",
            label: "نقطه‌ی شکست مشترک",
            help: "از کار افتادنش چند خدمت را با هم مختل می‌کند.",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
          {
            name: "infra_owner",
            label: "مالک زیرساخت",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "- انتخاب کنید -",
            choices: [
              {
                value: "datin",
                label: "داتین",
              },
              {
                value: "bank",
                label: "بانک",
              },
              {
                value: "supplier",
                label: "تأمین‌کننده",
              },
            ],
          },
          {
            name: "control_operator",
            label: "اجراکننده‌ی کنترل",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "- انتخاب کنید -",
            choices: [
              {
                value: "datin",
                label: "داتین",
              },
              {
                value: "bank",
                label: "بانک",
              },
              {
                value: "supplier",
                label: "تأمین‌کننده",
              },
            ],
          },
          {
            name: "evidence_provider",
            label: "ارائه‌دهنده‌ی شاهد",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "- انتخاب کنید -",
            choices: [
              {
                value: "datin",
                label: "داتین",
              },
              {
                value: "bank",
                label: "بانک",
              },
              {
                value: "supplier",
                label: "تأمین‌کننده",
              },
            ],
          },
          {
            name: "change_authority",
            label: "تصمیم‌گیر تغییر",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "- انتخاب کنید -",
            choices: [
              {
                value: "datin",
                label: "داتین",
              },
              {
                value: "bank",
                label: "بانک",
              },
              {
                value: "supplier",
                label: "تأمین‌کننده",
              },
            ],
          },
          {
            name: "incident_contact",
            label: "مخاطب اعلام رخداد",
            help: "نام یا نقش؛ ممکن است بیرون از داتین باشد.",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            max_length: 200,
          },
          {
            name: "valid_from",
            label: "اعتبار از",
            help: "",
            required: false,
            disabled: false,
            kind: "date",
            value: "",
            errors: [],
            placeholder: "مثلاً 1405/01/15",
          },
          {
            name: "valid_until",
            label: "اعتبار تا",
            help: "",
            required: false,
            disabled: false,
            kind: "date",
            value: "",
            errors: [],
            placeholder: "مثلاً 1405/01/15",
          },
        ],
        errors: [],
        multipart: false,
      },
      cancel: {
        href: "/catalog/services/1/",
        route: "/catalog/services/1",
      },
      messages: [],
    } satisfies FormPageData),
    ...overrides,
  };
}

// --- مدیریت سامانه (apps/api/admin_pages.py) ---

export function userList(overrides: Partial<UserList> = {}): UserList {
  return {
    ...({
      view: "accounts:user_list",
      messages: [],
      title: "کاربران",
      results: [
        {
          id: 2,
          name: "کاربر آزمون یکم",
          username: "test.one",
          personnel_code: "1021",
          org_unit: "واحد آزمون",
          roles: ["عضو GRC", "مدیر واحد"],
          is_active: true,
        },
        {
          id: 3,
          name: "کاربر آزمون دوم",
          username: "test.two",
          personnel_code: null,
          org_unit: null,
          roles: [],
          is_active: false,
        },
      ],
      count: 2,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "q",
            label: "جست‌وجو",
            help: "",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            placeholder: "نام، نام کاربری یا کد پرسنلی",
          },
          {
            name: "unit",
            label: "واحد",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه‌ی واحدها",
            choices: [
              {
                value: "1",
                label: "واحد آزمون",
              },
              {
                value: "2",
                label: "— زیرواحد آزمون",
              },
            ],
          },
          {
            name: "role",
            label: "نقش",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه‌ی نقش‌ها",
            choices: [
              {
                value: "مدیر سامانه",
                label: "مدیر سامانه",
              },
              {
                value: "مدیر واحد",
                label: "مدیر واحد",
              },
              {
                value: "عضو GRC",
                label: "عضو GRC",
              },
              {
                value: "کارگروه امنیت",
                label: "کارگروه امنیت",
              },
              {
                value: "کمیته امنیت",
                label: "کمیته امنیت",
              },
              {
                value: "فقط مشاهده",
                label: "فقط مشاهده",
              },
            ],
          },
          {
            name: "status",
            label: "وضعیت",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "active",
                label: "فعال",
              },
              {
                value: "inactive",
                label: "غیرفعال",
              },
            ],
          },
        ],
        errors: [],
        multipart: false,
      },
      import_url: "/accounts/staff-import/",
    } as UserList),
    ...overrides,
  };
}

export function holidayList(overrides: Partial<HolidayList> = {}): HolidayList {
  return {
    ...({
      view: "workcalendar:holiday_list",
      messages: [],
      title: "تعطیلات",
      results: [
        {
          id: 1,
          date: {
            iso: "2026-11-19",
            jalali: "1405/08/28",
          },
          weekday: "پنجشنبه",
          title: "تعطیلی آزمون یکم",
          edit_url: "/holidays/1/edit/",
          delete_url: "/holidays/1/delete/",
        },
        {
          id: 2,
          date: {
            iso: "2026-11-21",
            jalali: "1405/08/30",
          },
          weekday: "شنبه",
          title: "تعطیلی آزمون دوم",
          edit_url: "/holidays/2/edit/",
          delete_url: "/holidays/2/delete/",
        },
      ],
      count: 2,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "year",
            label: "سال",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "1405",
            errors: [],
            empty_label: "همه‌ی سال‌ها",
            choices: [
              {
                value: "1405",
                label: "1405",
              },
              {
                value: "1404",
                label: "1404",
              },
            ],
          },
        ],
        errors: [],
        multipart: false,
        defaults: { year: "1405" },
      },
      create_url: "/holidays/new/",
      note: "پنجشنبه و جمعه همیشه تعطیل‌اند و لازم نیست این‌جا ثبت شوند. تعطیلات رسمی هر سال را از تقویم رسمی وارد کنید.",
    } as HolidayList),
    ...overrides,
  };
}

export function holidayForm(overrides: Partial<FormPageData> = {}): FormPageData {
  return {
    ...({
      view: "workcalendar:holiday_create",
      title: "تعطیلی جدید",
      form: {
        fields: [
          {
            name: "date",
            label: "تاریخ",
            help: "",
            required: true,
            disabled: false,
            kind: "date",
            value: "",
            errors: [],
            placeholder: "مثلاً 1405/01/15",
          },
          {
            name: "title",
            label: "مناسبت",
            help: "",
            required: true,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            max_length: 200,
          },
        ],
        errors: [],
        multipart: false,
      },
      cancel: {
        href: "/holidays/",
        route: "/holidays",
      },
      messages: [],
    } as FormPageData),
    ...overrides,
  };
}

export function auditEventList(overrides: Partial<AuditEventList> = {}): AuditEventList {
  return {
    ...({
      view: "audit:event_list",
      messages: [],
      title: "سوابق ممیزی",
      results: [
        {
          id: 7,
          at: {
            iso: "2026-11-09T10:34:45+00:00",
            jalali: "1405/08/18 14:04",
          },
          user: "کاربر آزمون یکم",
          username: "test.one",
          event: {
            value: "permission_denied",
            label: "دسترسی ردشده",
          },
          warning: true,
          summary: "/accounts/users/",
          ip_address: null,
        },
        {
          id: 6,
          at: {
            iso: "2026-11-09T10:30:00+00:00",
            jalali: "1405/08/18 14:00",
          },
          user: null,
          username: "unknown",
          event: {
            value: "login_failed",
            label: "ورود ناموفق",
          },
          warning: true,
          summary: null,
          ip_address: "10.20.1.99",
        },
        {
          id: 5,
          at: {
            iso: "2026-11-09T10:29:00+00:00",
            jalali: "1405/08/18 13:59",
          },
          user: null,
          username: null,
          event: {
            value: "export",
            label: "خروجی گرفتن",
          },
          warning: false,
          summary: "رویدادهای Audit Log (12 ردیف)",
          ip_address: null,
        },
      ],
      count: 3,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "q",
            label: "کاربر",
            help: "",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            placeholder: "نام یا نام کاربری",
          },
          {
            name: "event",
            label: "رویداد",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "login",
                label: "ورود",
              },
              {
                value: "logout",
                label: "خروج",
              },
              {
                value: "login_failed",
                label: "ورود ناموفق",
              },
              {
                value: "permission_denied",
                label: "دسترسی ردشده",
              },
              {
                value: "roles_changed",
                label: "تغییر نقش",
              },
              {
                value: "managed_units_changed",
                label: "تغییر واحدهای تحت مدیریت",
              },
              {
                value: "scope_units_changed",
                label: "تغییر دامنه‌ی مشاهده",
              },
              {
                value: "export",
                label: "خروجی گرفتن",
              },
            ],
          },
          {
            name: "start",
            label: "از تاریخ",
            help: "",
            required: false,
            disabled: false,
            kind: "date",
            value: "",
            errors: [],
            placeholder: "مثلاً 1405/01/15",
          },
          {
            name: "end",
            label: "تا تاریخ",
            help: "",
            required: false,
            disabled: false,
            kind: "date",
            value: "",
            errors: [],
            placeholder: "مثلاً 1405/01/15",
          },
        ],
        errors: [],
        multipart: false,
      },
      tabs: [
        {
          label: "ورود و رویدادها",
          href: "/audit/",
        },
        {
          label: "تغییرات داده",
          href: "/audit/changes/",
        },
      ],
      export_url: "/audit/export/",
    } as AuditEventList),
    ...overrides,
  };
}

export function auditChangeList(overrides: Partial<AuditChangeList> = {}): AuditChangeList {
  return {
    ...({
      view: "audit:change_list",
      messages: [],
      title: "سوابق ممیزی",
      results: [
        {
          id: 3,
          at: {
            iso: "2026-11-09T10:34:45+00:00",
            jalali: "1405/08/18 14:04",
          },
          user: {
            id: 1,
            name: "کاربر آزمون",
          },
          type: {
            value: "~",
            label: "ویرایش",
          },
          record: "1405/08/29 تعطیلی آزمون",
          reason: null,
          changes: [
            {
              label: "مناسبت",
              old: "عنوان قدیم آزمون",
              new: "عنوان تازه‌ی آزمون",
            },
          ],
          hidden_edit: false,
        },
        {
          id: 2,
          at: {
            iso: "2026-11-09T10:30:00+00:00",
            jalali: "1405/08/18 14:00",
          },
          user: {
            id: 1,
            name: "کاربر آزمون",
          },
          type: {
            value: "~",
            label: "ویرایش",
          },
          record: "1405/08/29 تعطیلی آزمون",
          reason: "تغییر رمز",
          changes: [],
          hidden_edit: true,
        },
        {
          id: 1,
          at: {
            iso: "2026-11-09T10:00:00+00:00",
            jalali: "1405/08/18 13:30",
          },
          user: null,
          type: {
            value: "+",
            label: "ایجاد",
          },
          record: "1405/08/29 تعطیلی آزمون",
          reason: null,
          changes: [],
          hidden_edit: false,
        },
      ],
      count: 3,
      page: 1,
      pages: 1,
      filters: {
        fields: [
          {
            name: "model",
            label: "نوع رکورد",
            help: "",
            required: true,
            disabled: false,
            kind: "select",
            value: "workcalendar.holiday",
            errors: [],
            choices: [
              {
                value: "workcalendar.holiday",
                label: "تعطیلی",
              },
              {
                value: "risks.risk",
                label: "ریسک",
              },
              {
                value: "accounts.user",
                label: "کاربر",
              },
            ],
          },
          {
            name: "q",
            label: "کاربر",
            help: "",
            required: false,
            disabled: false,
            kind: "text",
            value: "",
            errors: [],
            placeholder: "نام یا نام کاربری",
          },
          {
            name: "history_type",
            label: "تغییر",
            help: "",
            required: false,
            disabled: false,
            kind: "select",
            value: "",
            errors: [],
            empty_label: "همه",
            choices: [
              {
                value: "+",
                label: "ایجاد",
              },
              {
                value: "~",
                label: "ویرایش",
              },
              {
                value: "-",
                label: "حذف",
              },
            ],
          },
          {
            name: "start",
            label: "از تاریخ",
            help: "",
            required: false,
            disabled: false,
            kind: "date",
            value: "",
            errors: [],
            placeholder: "مثلاً 1405/01/15",
          },
          {
            name: "end",
            label: "تا تاریخ",
            help: "",
            required: false,
            disabled: false,
            kind: "date",
            value: "",
            errors: [],
            placeholder: "مثلاً 1405/01/15",
          },
        ],
        errors: [],
        multipart: false,
        defaults: { model: "workcalendar.holiday" },
      },
      tabs: [
        {
          label: "ورود و رویدادها",
          href: "/audit/",
        },
        {
          label: "تغییرات داده",
          href: "/audit/changes/",
        },
      ],
    } as AuditChangeList),
    ...overrides,
  };
}

export function staffImportForm(overrides: Partial<FormPageData> = {}): FormPageData {
  return {
    ...({
      view: "accounts:staff_import",
      title: "ورود کارکنان از فایل منابع انسانی",
      form: {
        fields: [
          {
            name: "file",
            label: "فایل Excel منابع انسانی",
            help: "",
            required: true,
            disabled: false,
            kind: "file",
            value: null,
            errors: [],
            accept: ".xlsx",
          },
          {
            name: "deactivate_missing",
            label: "کسانی که کد پرسنلی دارند ولی در فایل نیستند غیرفعال شوند",
            help: "",
            required: false,
            disabled: false,
            kind: "checkbox",
            value: false,
            errors: [],
          },
        ],
        errors: [],
        multipart: true,
      },
      cancel: {
        href: "/accounts/users/",
        route: "/accounts/users",
      },
      messages: [],
      intro: "اول گزارش آزمایشی نشان داده می‌شود و تا آن را تأیید نکنید، چیزی ذخیره نمی‌شود.",
      submit: "بارگذاری و گزارش آزمایشی",
    } as FormPageData),
    ...overrides,
  };
}

/** گزارش آزمایشی بعد از بارگذاری فایل: هنوز چیزی ذخیره نشده و confirm فیلدهای پنهان دکمه‌ی تأیید است. */
export function staffImportDryRun(overrides: Partial<StaffImportResult> = {}): StaffImportResult {
  return {
    ...({
      message: "گزارش آزمایشی آماده است؛ هنوز چیزی ذخیره نشده است.",
      redirect: null,
      report: {
        dry_run: true,
        sections: [
          {
            title: "واحدهای تازه",
            count: 2,
            lines: ["واحد آزمون", "واحد آزمون / زیرواحد آزمون"],
            level: null,
          },
          {
            title: "کاربران تازه",
            count: 1,
            lines: [],
            level: null,
          },
          {
            title: "کاربران به‌روزشده",
            count: 1,
            lines: ["1021 کاربر آزمون یکم: واحد سازمانی"],
            level: null,
          },
          {
            title: "کاربران بدون تغییر",
            count: 0,
            lines: [],
            level: null,
          },
          {
            title: "کاربرانی که در فایل نیستند و فعال ماندند",
            count: 1,
            lines: ["1044 کاربر آزمون دوم"],
            level: null,
          },
          {
            title: "واحدهایی که مدیرشان تعیین یا عوض شد",
            count: 1,
            lines: ["واحد آزمون / زیرواحد آزمون: کاربر آزمون یکم"],
            level: null,
          },
          {
            title: "واحدهایی که مدیرشان همان ماند",
            count: 0,
            lines: [],
            level: null,
          },
          {
            title: "نقش «مدیر واحد» داده شد به",
            count: 1,
            lines: ["test.one کاربر آزمون یکم"],
            level: null,
          },
          {
            title: "نقش «مدیر واحد» دارند ولی مدیر هیچ واحدی نیستند",
            count: 1,
            lines: ["test.two کاربر آزمون دوم"],
            level: "warning",
          },
          {
            title: "ردیف‌هایی که وارد نشدند",
            count: 1,
            lines: ["ردیف 4: کد پرسنلی خالی است."],
            level: "danger",
          },
        ],
      },
      confirm: {
        url: "/accounts/staff-import/confirm/",
        values: {
          token: "00000000-0000-4000-8000-000000000000",
          deactivate_missing: false,
        },
      },
    } as StaffImportResult),
    ...overrides,
  };
}

/** گزارش آن‌چه بعد از تأیید انجام شد. */
export function staffImportDone(overrides: Partial<StaffImportResult> = {}): StaffImportResult {
  return {
    ...({
      message: "کارکنان وارد شدند. گزارش آن‌چه انجام شد:",
      redirect: null,
      report: {
        dry_run: false,
        sections: [
          {
            title: "واحدهای تازه",
            count: 2,
            lines: ["واحد آزمون", "واحد آزمون / زیرواحد آزمون"],
            level: null,
          },
          {
            title: "کاربران تازه",
            count: 1,
            lines: [],
            level: null,
          },
          {
            title: "کاربران به‌روزشده",
            count: 1,
            lines: ["1021 کاربر آزمون یکم: واحد سازمانی"],
            level: null,
          },
          {
            title: "کاربران بدون تغییر",
            count: 0,
            lines: [],
            level: null,
          },
          {
            title: "کاربرانی که در فایل نیستند و فعال ماندند",
            count: 1,
            lines: ["1044 کاربر آزمون دوم"],
            level: null,
          },
          {
            title: "واحدهایی که مدیرشان تعیین یا عوض شد",
            count: 1,
            lines: ["واحد آزمون / زیرواحد آزمون: کاربر آزمون یکم"],
            level: null,
          },
          {
            title: "واحدهایی که مدیرشان همان ماند",
            count: 0,
            lines: [],
            level: null,
          },
          {
            title: "نقش «مدیر واحد» داده شد به",
            count: 1,
            lines: ["test.one کاربر آزمون یکم"],
            level: null,
          },
          {
            title: "نقش «مدیر واحد» دارند ولی مدیر هیچ واحدی نیستند",
            count: 1,
            lines: ["test.two کاربر آزمون دوم"],
            level: "warning",
          },
          {
            title: "ردیف‌هایی که وارد نشدند",
            count: 1,
            lines: ["ردیف 4: کد پرسنلی خالی است."],
            level: "danger",
          },
        ],
      },
      confirm: null,
    } as StaffImportResult),
    ...overrides,
  };
}

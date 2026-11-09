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
  ComparePage,
  ChangeDetail,
  CoverageCell,
  CoveragePage,
  CsrfState,
  EvidenceDetail,
  EvidenceList,
  EvidenceRow,
  FormField,
  FormPageData,
  FormSchema,
  ImpactRow,
  Level,
  MyWork,
  PlanDetail,
  ResponseDetail,
  RiskDetail,
  RiskFilters,
  RiskPage,
  RiskQuestion,
  RiskBrief,
  RiskRow,
  RouteEntry,
  Session,
  StartForm,
} from "../lib/types";

export const levels = {
  critical: { rank: 4, name: "بحرانی", color: "#dc3545", text_color: "#fff" },
  high: { rank: 3, name: "بالا", color: "#fd7e14", text_color: "#000" },
  medium: { rank: 2, name: "متوسط", color: "#ffc107", text_color: "#000" },
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
];

export function csrf(authenticated = false): CsrfState {
  return { csrf_token: "test-csrf-token", authenticated };
}

export function session(): Session {
  return {
    user: { ...tester, username: "tester", roles: ["مدیر واحد"], job_title: "نقش آزمون", org_unit: "واحد آزمون" },
    today,
    navigation: [
      {
        title: "کار روزانه",
        items: [
          { key: "actions:my_work", label: "کارهای من", href: "/actions/mine/", route: "/" },
          {
            key: "questionnaires:answer_home",
            label: "پاسخ به سؤال‌ها",
            href: "/questionnaires/",
            route: "/questionnaires",
          },
        ],
      },
      {
        title: "ریسک‌ها",
        items: [
          { key: "risks:risk_list", label: "رجیستر ریسک", href: "/risks/", route: "/risks" },
          { key: "assessments:assessment_list", label: "ارزیابی ریسک", href: "/assessments/", route: "/assessments" },
          { key: "risks:evidence_list", label: "شواهد", href: "/risks/evidence/", route: "/risks/evidence" },
          { key: "controls:control_list", label: "کنترل‌ها", href: "/controls/", route: null },
        ],
      },
    ],
    routes: routeTable,
    logout_url: "/api/auth/logout/",
    classic_home: "/",
    csrf_token: "test-csrf-token",
  };
}

/** API بخش خالی را نمی‌فرستد؛ پس این‌جا هم هر بخش دست‌کم یک مورد دارد. */
export function myWork(): MyWork {
  const risk = { id: 2, code: "RK-1405-0002", title: "ریسک آزمون دوم" };
  return {
    today,
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

// داده‌ی آزمون، فقط برای Vitest و Playwright. هیچ صفحه‌ای از برنامه این فایل را نمی‌خواند و رابط همیشه داده را از
// API جنگو می‌گیرد. شکل هر جواب همان شکل apps/api است (lib/types.ts) و نام‌ها عمداً «آزمون» دارند تا با داده‌ی
// واقعی اشتباه نشوند. هر تابع نسخه‌ی تازه می‌سازد تا تغییر یک آزمون به آزمون دیگر نرسد.

import type {
  AnswerHome,
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
  Level,
  MyWork,
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
    create_url: "/risks/new/",
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

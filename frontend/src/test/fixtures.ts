// داده‌ی آزمون، فقط برای Vitest و Playwright. هیچ صفحه‌ای از برنامه این فایل را نمی‌خواند و رابط همیشه داده را از
// API جنگو می‌گیرد. شکل هر جواب همان شکل apps/api است (lib/types.ts) و نام‌ها عمداً «آزمون» دارند تا با داده‌ی
// واقعی اشتباه نشوند. هر تابع نسخه‌ی تازه می‌سازد تا تغییر یک آزمون به آزمون دیگر نرسد.

import type {
  AnswerHome,
  CsrfState,
  Level,
  MyWork,
  ResponseDetail,
  RiskDetail,
  RiskFilters,
  RiskPage,
  RiskQuestion,
  RiskRow,
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
          { key: "risks:evidence_list", label: "شواهد", href: "/risks/evidence/", route: null },
        ],
      },
    ],
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
    links: [{ kind: "تیکت", ref: "TEST-1", url: "https://tickets.example.test/TEST-1" }],
    evidence: [],
    controls: [],
    workflow: {
      transitions: [
        {
          name: "review",
          label: "ارسال به بازبینی",
          description: "",
          target: "در بازبینی",
          href: "/risks/1/go/review/",
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
    attachments: [],
    comments: [{ text: "یادداشت آزمون", by: reviewer, at, edited: false }],
    actions: {
      classic: "/risks/1/",
      edit: "/risks/1/edit/",
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

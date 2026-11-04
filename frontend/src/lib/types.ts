// شکل جواب‌های apps/api. تاریخ‌ها همیشه هر دو شکل را دارند: iso برای مقایسه و jalali (مثل 1405/08/13) برای نمایش.

export interface Day {
  iso: string;
  jalali: string;
}

export interface Today extends Day {
  weekday: string;
}

export interface Deadline extends Day {
  days_left: number;
  overdue: boolean;
}

export interface Moment {
  iso: string;
  jalali: string;
}

export interface Person {
  id: number;
  name: string;
}

export interface Level {
  rank: number;
  name: string;
  color: string;
  text_color: string;
}

export interface Choice {
  value: string;
  label: string;
}

export type Errors = Record<string, string[]>;

export interface NavLink {
  /** نام ثابت صفحه در جنگو (risks:risk_list)؛ آیکون پیوند با آن انتخاب می‌شود. */
  key: string;
  label: string;
  href: string;
  route: string | null;
}

export interface NavGroup {
  title: string;
  items: NavLink[];
}

export interface Session {
  user: Person & { username: string; roles: string[]; job_title: string; org_unit: string | null };
  today: Today;
  navigation: NavGroup[];
  logout_url: string;
  classic_home: string;
  csrf_token: string;
}

export interface RiskRef {
  id: number;
  code: string;
  title: string;
}

export interface WorkItem {
  key: string;
  label: string;
  href: string;
  route: string | null;
  risk: RiskRef | null;
  level: Level | null;
  due: Deadline | null;
  status: string | null;
  meta: string | null;
}

export interface WorkSection {
  key: string;
  title: string;
  hint: string;
  items: WorkItem[];
}

export interface MyWork {
  today: Today;
  sections: WorkSection[];
}

export interface RiskRow {
  id: number;
  code: string;
  title: string;
  status: Choice;
  is_active: boolean;
  needs_completion: boolean;
  level: Level | null;
  category: { code: string; name: string };
  service: { code: string; name: string } | null;
  org_unit: string;
  owner: Person | null;
  channel: Choice;
  created_at: Day;
}

export type RiskOrdering = "newest" | "oldest" | "code" | "-code" | "level" | "-level";

export interface RiskPage {
  count: number;
  page: number;
  pages: number;
  ordering: RiskOrdering;
  results: RiskRow[];
  can_create: boolean;
  create_url: string;
}

export type RiskFilters = Record<string, { label: string; choices: Choice[] }>;

export interface Transition {
  name: string;
  label: string;
  description: string;
  target: string;
  href: string;
}

export interface AssessmentRow {
  id: number;
  code: string;
  kind: Choice;
  status: Choice;
  level: Level | null;
  score: [number, number] | null;
  meeting_date: Day | null;
  approved_at: Moment | null;
  href: string;
}

export interface RiskDetail {
  id: number;
  code: string;
  title: string;
  description: string;
  status: Choice;
  is_active: boolean;
  needs_completion: boolean;
  level: Level | null;
  score: [number, number] | null;
  created_at: Day;
  updated_at: Moment;
  channel: Choice;
  scenario: { code: string; title: string; version: number; changed: boolean; href: string } | null;
  service: { code: string; name: string; href: string | null } | null;
  org_unit: string;
  owner: Person | null;
  category: { code: string; name: string };
  customers: string[];
  tags: string[];
  scope: string;
  initiator: string;
  count_unit: string;
  count_exclusions: string;
  data_class: Choice | null;
  cia: string;
  links: { kind: string; ref: string; url: string }[];
  evidence: {
    code: string;
    title: string;
    kind: string;
    reliability: string;
    observed_on: Day | null;
    expired: boolean;
    confidential: boolean;
    href: string;
  }[];
  controls: { code: string; title: string; href: string | null }[];
  workflow: {
    transitions: Transition[];
    timeline: {
      from: string;
      to: string;
      reason: string;
      meeting_date: Day | null;
      by: Person | null;
      at: Moment;
    }[];
    questions: {
      text: string;
      due: Deadline | Day | null;
      answer: string;
      asked_by: Person | null;
      answered_by: Person | null;
      is_open: boolean;
    }[];
    pending_change: { label: string; href: string } | null;
  };
  assessments: AssessmentRow[];
  treatment: {
    current_plan: {
      label: string;
      option: string;
      owner_approved: boolean;
      actions: { code: string; title: string; status: string; due: Deadline | Day | null; href: string }[];
      href: string;
    } | null;
    plan_due: Deadline | null;
    acceptances: {
      code: string;
      status: string;
      level: Level | null;
      start: Day | null;
      end: Day | null;
      href: string;
    }[];
  };
  attachments: { name: string; size: number; description: string; by: Person | null; at: Moment; href: string }[];
  comments: { text: string; by: Person | null; at: Moment; edited: boolean }[];
  actions: {
    classic: string;
    edit: string | null;
    add_evidence: string | null;
    add_assessment: string | null;
    add_plan: string | null;
  };
}

export interface ResponseRow {
  id: number;
  questionnaire: string;
  org_unit: string;
  service: string | null;
  respondent: Person | null;
  channel: Choice;
  status: Choice;
  is_editable: boolean;
  is_overdue: boolean;
  updated_at: Day;
}

export interface AnswerHome {
  questionnaires: { id: number; title: string; description: string; question_count: number }[];
  can_answer: boolean;
  my_responses: ResponseRow[];
  risk_question_count: number;
}

export interface StartField {
  label: string;
  help: string;
  required: boolean;
  initial: string;
  choices: Choice[];
}

export interface StartForm {
  questionnaire: { id: number; title: string };
  fields: Record<string, StartField>;
}

export interface TextItem {
  name: string;
  label: string;
  help: string;
  value: string;
}

export type AnswerValue = string | number | number[] | null;

export interface QuestionItem {
  id: number;
  text: string;
  help: string;
  kind: "text" | "yes_no" | "single" | "multiple";
  required: boolean;
  options: { id: number; text: string }[];
  value: AnswerValue;
}

export interface ResponseDetail extends Omit<ResponseRow, "questionnaire"> {
  questionnaire: { id: number; title: string; description: string };
  recorded_by: Person | null;
  can_edit: boolean;
  submitted_at: Moment | null;
  return_question: string;
  return_due: Deadline | null;
  reviewed_by: Person | null;
  reviewed_at: Moment | null;
  fixed: TextItem[];
  new_item: TextItem;
  questions: QuestionItem[];
  pending_risks: { description: string; status: Choice; source: string }[];
  classic_url: string;
}

export interface RiskQuestion {
  id: number;
  text: string;
  risk: RiskRef & { org_unit: string };
  asked_by: Person | null;
  asked_at: Day;
  due: Deadline | null;
}

export interface CsrfState {
  csrf_token: string;
  authenticated: boolean;
}

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

/** یک سطر جدول پیوندها (apps/api/routes.py): نشانی جنگو با این الگو در رابط React همین مسیر است. */
export interface RouteEntry {
  name: string;
  /** regex جاوااسکریپت نشانی جنگو با گروه‌های نام‌دار، مثل ^/risks/(?<pk>[0-9]+)/edit/$ */
  pattern: string;
  /** مسیر React با همان نام‌ها، مثل /risks/:pk/edit */
  route: string;
  /** صفحه را فرم عمومی رابط با /api/forms/ نشان می‌دهد. */
  form: boolean;
}

export interface Session {
  user: Person & { username: string; roles: string[]; job_title: string; org_unit: string | null };
  today: Today;
  navigation: NavGroup[];
  routes: RouteEntry[];
  logout_url: string;
  classic_home: string;
  csrf_token: string;
}

/** نشانی جنگو، و مسیر همان صفحه در رابط React اگر آن صفحه این‌جا هم هست. */
export interface AppHref {
  href: string;
  route: string | null;
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

/** ریسک مرتبط در ادغام و تفکیک؛ پیوند فقط وقتی هست که کاربر آن ریسک را می‌بیند. */
export interface RelatedRisk {
  code: string;
  href: string | null;
}

export interface Attachment {
  id: number;
  name: string;
  size: number;
  description: string;
  by: Person | null;
  at: Moment;
  href: string;
}

export interface Comment {
  id: number;
  text: string;
  by: Person | null;
  at: Moment;
  edited: boolean;
  /** فقط برای نویسنده‌ی همان نظر. */
  edit_url: string | null;
}

/** پیوست‌ها و نظرهای یک رکورد (apps/api/records.py). */
export interface RecordParts {
  attachments: Attachment[];
  comments: Comment[];
  attach_url: string | null;
  comment_url: string;
}

export interface RiskDetail extends RecordParts {
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
  links: { kind: string; ref: string; url: string; edit_url: string | null }[];
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
    pending_change: { label: string; merge_into: string | null; can_decide: boolean; href: string } | null;
    merged_into: RelatedRisk | null;
    split_from: RelatedRisk | null;
    merged_risks: RelatedRisk[];
    split_parts: RelatedRisk[];
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
  actions: {
    classic: string;
    edit: string | null;
    add_link: string | null;
    propose_merge: string | null;
    propose_split: string | null;
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

// فرم‌های جنگو از راه /api/forms/ (apps/api/forms.py و bridge.py)

export type FieldKind =
  | "hidden"
  | "checkbox"
  | "radio"
  | "multiselect"
  | "select"
  | "textarea"
  | "date"
  | "file"
  | "number"
  | "url"
  | "email"
  | "password"
  | "text";

export interface FormChoice {
  value: string;
  label: string;
  /** نام گروه (optgroup) گزینه، اگر گزینه‌ها گروه‌بندی شده‌اند. */
  group?: string;
}

export type FieldValue = string | boolean | string[] | File | null;

export interface FormField {
  name: string;
  label: string;
  help: string;
  required: boolean;
  disabled: boolean;
  kind: FieldKind;
  value: string | boolean | string[] | null;
  errors: string[];
  choices?: FormChoice[];
  empty_label?: string;
  rows?: number;
  placeholder?: string;
  max_length?: number;
  accept?: string;
  max_size?: number;
}

export interface FormSchema {
  fields: FormField[];
  /** خطاهای کل فرم (non_field_errors). */
  errors: string[];
  multipart: boolean;
}

export interface PageMessage {
  level: "debug" | "info" | "success" | "warning" | "error";
  text: string;
}

export interface FormPageData {
  view: string;
  title: string;
  form: FormSchema | null;
  cancel: AppHref | null;
  messages: PageMessage[];
  /** برچسب دکمه‌ی فرستادن، اگر «ذخیره» نیست. */
  submit?: string;
  intro?: string;
  // انتقال گردش کار
  risk?: { id: number; code: string; title: string; status: Choice };
  transition?: { label: string; description: string; source: string; target: string };
  problems?: string[];
  // خانه‌ی جهان ریسک
  cell?: {
    service: { code: string; name: string };
    category: { code: string; name: string };
    status: Choice;
    reviewed_by: Person | null;
    reviewed_on: Day | null;
  };
  risks?: { id: number; code: string; title: string; owner: Person | null; href: string }[];
}

export interface FormResult {
  message: string;
  redirect: AppHref | null;
}

// صفحه‌های خواندنی جنگو از راه /api/pages/ (apps/api/pages.py)

export interface Listing<T> {
  view: string;
  title: string;
  messages: PageMessage[];
  results: T[];
  count: number;
  page: number;
  pages: number;
  filters: FormSchema | null;
}

export interface RiskBrief {
  id: number;
  code: string;
  title: string;
  status: Choice;
  is_active: boolean;
  service: string | null;
  category: { code: string; name: string };
  owner: Person | null;
  href: string;
}

export interface EvidenceRow {
  id: number;
  code: string;
  title: string;
  kind: Choice;
  observed_on: Day;
  reliability: Choice;
  expired: boolean;
  confidential: boolean;
  href: string;
}

export interface EvidenceList extends Listing<EvidenceRow> {
  create_url: string | null;
}

export interface EvidenceDetail extends RecordParts {
  view: string;
  title: string;
  messages: PageMessage[];
  evidence: EvidenceRow & {
    summary: string;
    source: string;
    scope: string;
    valid_until: Day | null;
    access_class: Choice;
    url: string;
    customer: string | null;
    owner: Person | null;
  };
  risks: RiskBrief[];
  edit_url: string | null;
  list_url: string;
}

export interface ScenarioRow {
  id: number;
  code: string;
  title: string;
  category: { code: string; name: string };
  version: number;
  is_active: boolean;
  href: string;
}

export interface ScenarioList extends Listing<ScenarioRow> {
  create_url: string | null;
}

export interface ScenarioDetail {
  view: string;
  title: string;
  messages: PageMessage[];
  scenario: ScenarioRow & { event: string; conditions: string; consequence: string };
  risks: RiskBrief[];
  edit_url: string | null;
  create_risk_url: string | null;
  list_url: string;
}

export interface CategoryRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  edit_url: string | null;
}

export interface CategoryList extends Listing<CategoryRow> {
  create_url: string | null;
  coverage_url: string;
}

export interface CoverageCell {
  category: string;
  status: Choice;
  summary: string;
  risk_count: number;
  risks_url: string | null;
  edit_url: string | null;
}

export interface CoverageRow {
  service: { id: number; code: string; name: string; is_critical: boolean; org_unit: string; href: string };
  cells: CoverageCell[];
}

export interface CoveragePage extends Listing<CoverageRow> {
  categories: { id: number; code: string; name: string }[];
  critical: { total: number; complete: number; percent: number | null };
  counts: { reviewed: number; not_relevant: number; pending: number };
  can_edit: boolean;
  categories_url: string;
}

export interface ChangeRiskRef {
  id: number;
  code: string;
  title: string;
  status: Choice;
  href: string;
}

export interface ChangeRow {
  id: number;
  kind: Choice;
  status: Choice;
  risk: ChangeRiskRef;
  merge_into: ChangeRiskRef | null;
  owner: Person | null;
  proposed_by: Person | null;
  created_at: Day;
  href: string;
}

export type ChangeList = Listing<ChangeRow>;

export interface ChangeDetail {
  view: string;
  title: string;
  messages: PageMessage[];
  change: ChangeRow & {
    part_titles: string[];
    parts: { code: string; href: string }[];
    reason: string;
    decided_by: Person | null;
    decided_at: Day | null;
    decision_note: string;
  };
  /** فقط برای مالک ریسک و فقط تا وقتی درخواست منتظر تصمیم است. */
  decision: { url: string; effect: string; note: FormField } | null;
  list_url: string;
}

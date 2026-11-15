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
  /** نام ثابت صفحه در جنگو (risks:risk_list)، یا module:… برای صفحه‌هایی که فقط در React هستند. */
  key: string;
  label: string;
  href: string;
  route: string | null;
  /** شمار کارهای منتظر کنار نام؛ null یعنی شمارنده نشان داده نمی‌شود. */
  count: number | null;
  tone: "gold" | "red" | null;
}

export interface NavGroup {
  title: string;
  items: NavLink[];
}

export type NavModuleKey = "assessment" | "treatment" | "config";

export interface NavModule extends NavGroup {
  key: NavModuleKey;
}

/** منوی کناری فیگما: میز کار و سه ماژول یک چرخه. */
export interface Navigation {
  desk: NavGroup;
  modules: NavModule[];
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
  navigation: Navigation;
  /** کارت «چرخه‌ی ارزیابی» پایین منو. */
  cycle: { year: number; assessed: number; total: number };
  /** نسخه‌ی فعال روش ارزیابی برای نشان نوار بالا؛ null وقتی هنوز نسخه‌ای فعال نشده است. */
  method: { number: number; title: string; route: string | null } | null;
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

export type WorkCategory = "actions" | "signoff" | "assessments" | "questions" | "acceptances";
export type WorkTone = "brand" | "danger" | "warning" | "success" | "info" | "gold" | "neutral";

/** یک ردیف «صف کارها»ی فیگما. */
export interface WorkTask {
  key: string;
  category: WorkCategory;
  title: string;
  kind: string;
  context: string;
  code: string;
  href: string;
  route: string | null;
  icon: string;
  tone: WorkTone;
  cta: string;
  cta_style: "primary" | "secondary" | "ghost";
  level: Level | null;
  due: Deadline | null;
  due_text: string | null;
  no_due: string;
}

export interface WorkKpi {
  count: number;
  note: string;
}

export interface WorkPlanRow {
  key: string;
  code: string;
  title: string;
  level: Level | null;
  note: string;
  state: string;
  tone: WorkTone;
  route: string | null;
}

export interface WorkAcceptanceRow {
  key: string;
  code: string;
  risk_code: string;
  owner: string | null;
  label: string;
  tone: WorkTone;
  route: string | null;
}

export interface MyWork {
  today: Today;
  first_name: string;
  kpis: Record<"waiting" | "due_today" | "overdue" | "to_verify", WorkKpi>;
  categories: { key: WorkCategory; label: string; count: number }[];
  tasks: WorkTask[];
  plans: WorkPlanRow[];
  acceptances: WorkAcceptanceRow[];
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
  realization_path?: string;
  additional_notes?: string;
  scenario_snapshot?: Record<string, string | number>;
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
    add_review?: string | null;
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
  is_structured: boolean;
  structured_data: unknown[];
  structured_questions: { id: number; text: string; stage: string; required: boolean; help: string }[];
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
  /**
   * فقط در فرم فیلتر فهرست: مقداری که view وقتی پارامتر در نشانی نیست به کار می‌برد (مثل سال جاری تعطیلات). برای
   * «همه» پارامتر خالی فرستاده می‌شود، چون نبودنش همین پیش‌فرض است.
   */
  defaults?: Record<string, string>;
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
  risk?: { id: number; code: string; title: string; status?: Choice; href?: string };
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
  // چیزهای کنار فرم‌هایی که قالب اختصاصی دارند (عامل آغازگر، مسیر تحقق و...)
  alerts?: FormAlert[];
  facts?: { title: string; rows: { label: string; value: string }[] };
  guides?: FormGuide[];
  // پروفایل پیامد: چند فرم با پیشوند، یک گروه برای هر ذی‌نفع
  groups?: ImpactGroup[];
  // بازسنجی طرح مواجهه: مقایسه‌ی مبنا، ارزیابی تازه و هدف، و اقدام‌هایی که هنوز تأیید نشده‌اند
  comparison?: Comparison;
  open_actions?: { code: string; href: string; status: ActionStatus }[];
  // سؤال پرسشنامه: فیلدهای مدیریت formset و فرم هر گزینه با پیشوند options-<شماره>
  structured?: boolean;
  options?: OptionFormset;
  // ثبت ریسک در انتظار: اول انتخاب سناریو، بعد فرم ثبت ریسک
  pending?: { description: string; source: string };
  scenarios?: { id: number; code: string; title: string; service: string }[];
  /** بخش‌های فرم بلند (برگه‌ی آزمون کنترل): هر بخش یک fieldset با همین فیلدها به همین ترتیب. */
  fieldsets?: { title: string; fields: string[] }[];
}

export interface OptionFormset {
  management: FormField[];
  errors: string[];
  rows: (FormSchema & { prefix: string })[];
}

export interface FormAlert {
  tone: "info" | "warning" | "danger";
  text: string;
  items?: string[];
  link?: { label: string; href: string };
}

/** راهنمای کنار فرم، مثل جدول سطح‌های A یا B0. */
export interface FormGuide {
  title: string;
  items: { term: string; label: string; text: string }[];
  notes: string[];
}

export interface ImpactRow extends FormSchema {
  prefix: string;
  scale: { code: string; name: string };
  suggestion: { level: number | null; note: string } | null;
  provisional_note: string;
}

export interface ImpactGroup {
  name: string;
  is_datin: boolean;
  facts: { critical: boolean; rto: number | null; mtpd: number | null; basis: number | null };
  rows: ImpactRow[];
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
  scenario: ScenarioRow & { event: string; conditions: string; consequence: string; narrative?: string };
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
  /** نام دسته؛ جدول جهان ریسک آن را از سرستون می‌خواند و صفحه‌ی خدمت کنار خانه نشانش می‌دهد. */
  category_name?: string;
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

// ارزیابی ریسک (apps/api/assessments.py)

export type Band = [number, number];

export interface EvidenceRef {
  code: string;
  href: string;
}

export interface AssessmentHeader {
  id: number;
  code: string;
  kind: Choice;
  status: Choice;
  is_approved: boolean;
  risk: { id: number; code: string; title: string; href: string };
  method_version: { label: string; number: number; href: string };
  horizon_months: number;
  horizon_rationale?: string;
  target_due?: Day | null;
  scope_snapshot?: {
    service: string;
    customers: { id: number; name: string }[];
    description: string;
    initiator?: string;
  };
  meeting_date: Day | null;
  assumptions: string;
  created_by: Person | null;
  created_at: Moment;
  approved_at: Moment | null;
  escalation: {
    flags: { label: string; tone: "danger" | "warning" }[];
    rationale: string;
    evidence: EvidenceRef[];
  } | null;
  href: string;
}

export interface AssessmentOutcome {
  provisional: boolean;
  problems: string[];
  likelihood: Band | null;
  impact: Band | null;
  score: Band | null;
  decision_score: number | null;
  base_level: Level | null;
  decision_level: Level | null;
  confidence: string;
  incomplete_reasons: string[];
  escalation_reasons: string[];
  out_of_acceptance_authority: boolean;
  acceptance_restricted: boolean;
}

export interface AssessmentReviewItem {
  id: number;
  action: Choice;
  by: Person | null;
  at: Moment;
  meeting_date: Day | null;
  notes: string;
}

export interface AssessmentReview {
  can_submit: boolean;
  submission_problems: string[];
  submit_url: string | null;
  can_review: boolean;
  review_url: string | null;
  review_notes: FormField;
  can_decide_referral: boolean;
  referral_url: string | null;
  referral_form: FormSchema;
  history: AssessmentReviewItem[];
}

export interface AssessmentPath {
  id: number;
  name: string;
  description: string;
  independent: boolean;
  independence_rationale: string;
  exceptions: string;
  notes: string[];
  b0: string;
  b0_confidence: string;
  b0_rationale: string;
  controls: { code: string; href: string; e: number; recorded_e: number; note: string }[];
  bc: Band | null;
  b: Band | null;
  edit_url: string | null;
  delete_url: string | null;
}

export interface AssessmentLikelihood {
  a: string;
  b: Band | null;
  likelihood: Band | null;
  problems: string[];
  incomplete: string[];
  blockers: string[];
  initiator: {
    basis: Choice;
    rate: {
      count: number | null;
      months: number | null;
      denominator: string;
      coverage: string | null;
      suggestion: { level: number | null; note: string } | null;
      insufficient: string[];
    } | null;
    confidence: string;
    rationale: string;
    evidence: EvidenceRef[];
  } | null;
  paths: AssessmentPath[];
}

export interface ImpactCell {
  level: string;
  unknown: boolean;
  value: string | null;
  unit: string;
  confidence: string;
  rationale: string;
}

export interface AssessmentImpacts {
  impact: Band | null;
  problems: string[];
  incomplete: string[];
  unknown: string[];
  missing: string[];
  stakeholders: string[];
  rows: { code: string; name: string; cells: (ImpactCell | null)[] }[];
}

export interface AssessmentDetail {
  risk_details?: { label: string; value: string }[];
  view: string;
  title: string;
  messages: PageMessage[];
  assessment: AssessmentHeader;
  outcome: AssessmentOutcome;
  review: AssessmentReview;
  likelihood: AssessmentLikelihood;
  impacts: AssessmentImpacts;
  actions: {
    edit: string | null;
    impact_profile: string | null;
    initiator: string | null;
    add_path: string | null;
    add_evidence?: string | null;
  };
}

/** جدول مقایسه‌ی ارزیابی‌ها (apps/api/assessments.comparison)؛ ستون اول مبنای جهت تغییر خانه‌هاست. */
export interface Comparison {
  profiles: { id: number; code: string; kind: Choice; method_version: number; incomplete: boolean; href: string }[];
  rows: { label: string; cells: { text: string; level: Level | null; trend: "" | "up" | "down" }[] }[];
  method_changed: boolean;
}

export interface ComparePage extends Comparison {
  view: string;
  title: string;
  messages: PageMessage[];
  risk: { id: number; code: string; title: string; href: string };
  error: string | null;
}

// طرح مواجهه، اقدام و پذیرش (apps/api/actions.py)

export interface CodeRef {
  code: string;
  href: string;
}

export interface ActionStatus extends Choice {
  overdue: boolean;
}

export interface ActionRow {
  id: number;
  code: string;
  title: string;
  mechanism: string;
  dimension: string | null;
  owner: Person | null;
  assignee: Person | null;
  /** برای اقدام باز با روزهای مانده؛ برای اقدام بسته فقط تاریخ. */
  due: Deadline | Day;
  status: ActionStatus;
  href: string;
  /** فقط در فهرست همه‌ی اقدام‌ها. */
  risk?: string;
}

export interface AcceptanceState {
  value: "draft" | "pending" | "active" | "expired" | "rejected" | "revoked";
  label: string;
}

export interface AcceptanceRow {
  id: number;
  code: string;
  assessment: string;
  level: Level | null;
  start: Day;
  end: Day;
  follow_up_by: Person | null;
  state: AcceptanceState;
  href: string;
  risk?: { code: string; href: string };
}

export type ActionList = Listing<ActionRow>;
export type AcceptanceList = Listing<AcceptanceRow>;

/** ریسک طرح یا اقدام؛ پیوند فقط برای کسی که آن ریسک را می‌بیند. */
export interface PlanRisk {
  id: number;
  code: string;
  title: string;
  href: string | null;
}

export interface PlanDetail extends RecordParts {
  view: string;
  title: string;
  messages: PageMessage[];
  plan: {
    id: number;
    option: Choice;
    state: { value: "pending" | "approved" | "closed"; label: string };
    risk: PlanRisk;
    risk_owner: Person | null;
    assessment: CodeRef & { score: number | null };
    level: Level | null;
    plan_required: boolean;
    decision_due: Day | null;
    overdue: boolean;
    containment_due: Moment | null;
    rationale: string;
    option_details: string;
    target: (CodeRef & { status: string; level: Level | null }) | null;
    approved_by: Person | null;
    approved_at: Moment | null;
  };
  approval: { problems: string[]; approve_url: string | null; message: string; waiting_for_owner: boolean };
  actions: ActionRow[];
  add_action_url: string | null;
  reassessment: {
    performed_on: Day;
    responsible: Person | null;
    assessment: CodeRef;
    target_met: boolean | null;
    method_changed: boolean;
    decision: Choice;
    note: string;
  } | null;
  reassess_url: string | null;
  comparison: Comparison | null;
  acceptances: AcceptanceRow[];
  acceptance_note: string;
  add_acceptance_url: string | null;
  edit_url: string | null;
}

export interface ActionMove {
  name: string;
  label: string;
  /** کلاس دکمه در قالب جنگو (primary، success، outline-danger و...). */
  style: string;
  note_required: boolean;
}

export type ActionProgress =
  | { state: "planned" | "verified" | "waiting" | "closed" }
  | {
      state: "open";
      url: string;
      moves: ActionMove[];
      can_note: boolean;
      note: FormField;
      evidence: FormField | null;
    };

export interface ActionDetail extends RecordParts {
  view: string;
  title: string;
  messages: PageMessage[];
  action: {
    id: number;
    code: string;
    title: string;
    status: ActionStatus;
    is_open: boolean;
    deliverable: string;
    mechanism: string;
    dimension: string | null;
    owner: Person | null;
    assignee: Person | null;
    verifier: Person | null;
    start: Day | null;
    due: Deadline | Day;
    cost: number | null;
    person_hours: number | null;
    description: string;
    acceptance_criteria: string;
  };
  risk: PlanRisk;
  plan: { option: string; href: string | null };
  depends_on: (CodeRef & { status: ActionStatus })[];
  waiting_for_dependencies: boolean;
  controls: (CodeRef & { title: string })[];
  evidence: CodeRef[];
  progress: ActionProgress;
  updates: { id: number; label: string; changes_status: boolean; by: Person | null; at: Moment; note: string }[];
  edit_url: string | null;
}

export interface SignForm extends FormSchema {
  authority: string;
  label: string;
  intro: string;
}

export interface AcceptanceSignature {
  authority: string;
  label: string;
  reason: string;
  signature: {
    approved: boolean;
    by: Person | null;
    at: Moment;
    reference_kind: string;
    reference: string;
    reference_date: Day | null;
    letter: string | null;
    note: string;
  } | null;
  waiting: boolean;
  candidates?: { unit: string; names: string[] };
}

export interface AcceptanceDetail extends RecordParts {
  view: string;
  title: string;
  messages: PageMessage[];
  acceptance: {
    id: number;
    code: string;
    state: AcceptanceState;
    days_left: number | null;
    decision_text: string;
    closed: { label: string; by: Person | null; at: Moment | null; reason: string } | null;
    start: Day;
    end: Day;
    evidence_due: Day | null;
    scope: string;
    reason: string;
    alternatives: string;
    compensating_controls: string;
    controls: CodeRef[];
    conditions: string;
    customer_constraints: string;
    monitoring: string;
    revocation_triggers: string;
    follow_up_by: Person | null;
  };
  risk: PlanRisk & { owner: Person | null };
  assessment: CodeRef & {
    method_version: number;
    score: number | null;
    confidence: string | null;
    tolerance_exceeded: boolean;
  };
  level: Level | null;
  temporary: boolean;
  non_normal: boolean;
  plan: { option: string; href: string } | null;
  renews: CodeRef | null;
  renewals: (CodeRef & { state: AcceptanceState })[];
  cap: { value: number | null; unit: string; until: Day | null };
  decision_due: Day | null;
  decision_due_passed: boolean;
  problems: string[];
  problems_title: string;
  submit_url: string | null;
  signatures: AcceptanceSignature[];
  sign_url: string;
  sign_forms: SignForm[];
  revoke: (FormSchema & { url: string }) | null;
  edit_url: string | null;
}

// تعریف پرسشنامه‌ها و بررسی پاسخ‌ها (apps/api/questionnaire_pages.py)

export interface QuestionnaireRow {
  id: number;
  title: string;
  question_count: number;
  response_count: number;
  is_active: boolean;
  is_structured: boolean;
  href: string;
}

export interface QuestionnaireList extends Listing<QuestionnaireRow> {
  create_url: string | null;
}

/** سناریو (کد و عنوان) یا دسته (کد و نام). */
export interface CodeName {
  code: string;
  name: string;
}

export interface QuestionnaireOption {
  id: number;
  text: string;
  is_active: boolean;
  indicates_risk: boolean;
  scenario: CodeName | null;
  category: CodeName | null;
}

export interface QuestionnaireQuestion {
  id: number;
  order: number;
  text: string;
  help: string;
  kind: Choice;
  stage: Choice | null;
  required: boolean;
  is_active: boolean;
  options: QuestionnaireOption[];
  edit_url: string | null;
}

export interface QuestionnaireDetail {
  view: string;
  title: string;
  messages: PageMessage[];
  questionnaire: {
    id: number;
    title: string;
    description: string;
    is_active: boolean;
    is_structured: boolean;
  };
  questions: QuestionnaireQuestion[];
  add_question_url: string | null;
  edit_url: string | null;
  list_url: string;
}

export interface ReviewRow {
  id: number;
  questionnaire: string;
  org_unit: string;
  service: string | null;
  respondent: Person | null;
  interview: boolean;
  submitted_at: Day | null;
  pending_count: number;
  status: Choice;
  is_overdue: boolean;
  href: string;
}

export interface ReviewList extends Listing<ReviewRow> {
  queue_url: string;
}

export interface PendingRiskRow {
  id: number;
  description: string;
  source: string;
  scenario: CodeName | null;
  category: CodeName | null;
  status: Choice;
  risk: CodeRef | null;
  dismiss_reason: string;
  duplicate_of: CodeRef | null;
  convert_url: string | null;
  dismiss_url: string | null;
}

export interface ReviewAnswer {
  id: number;
  question: string;
  has_options: boolean;
  text: string;
  options: { text: string; indicates_risk: boolean }[];
}

export type StructuredQuestion = ResponseDetail["structured_questions"][number];

export interface ResponseReview {
  view: string;
  title: string;
  messages: PageMessage[];
  response: {
    id: number;
    questionnaire: { id: number; title: string; href: string };
    org_unit: string;
    service: CodeName | null;
    respondent: Person | null;
    recorded_by: Person | null;
    interview: boolean;
    status: Choice;
    is_overdue: boolean;
    is_structured: boolean;
    submitted_at: Moment | null;
    return_question: string;
    returned_at: Day | null;
    return_due: Deadline | null;
    reviewed_by: Person | null;
    reviewed_at: Day | null;
  };
  // پاسخ عادی
  fixed?: { label: string; value: string }[];
  answers?: ReviewAnswer[];
  new_item?: string;
  // پاسخ شاخه‌ای
  structured?: { data: unknown[]; questions: StructuredQuestion[] };
  pending_risks: PendingRiskRow[];
  answer_url: string | null;
  review: {
    pending_create_url: string;
    return_url: string;
    reviewed_url: string;
    undecided: boolean;
  } | null;
  list_url: string;
}

// اعلان‌ها و بازبینی‌های پایش (apps/api/monitoring.py)

export interface MonitoringRisk {
  id: number;
  code: string;
  title: string;
  href: string;
}

export interface MonitoringNotice {
  id: number;
  risk: MonitoringRisk;
  message: string;
  href: string;
  created_at: Moment;
  read: boolean;
  read_url: string | null;
}

export interface NoticeList {
  view: string;
  title: string;
  messages: PageMessage[];
  notices: MonitoringNotice[];
}

export interface ReviewDetail {
  view: string;
  title: string;
  messages: PageMessage[];
  review: {
    id: number;
    trigger: Choice;
    risk: MonitoringRisk;
    assessment: CodeRef | null;
    reason: string;
    due: Deadline | Day;
    responsible: Person | null;
    created_by: Person | null;
    created_at: Moment;
    completed_at: Moment | null;
    completed_by: Person | null;
    result: string;
  };
  complete: { url: string; result: FormField } | null;
}

// کتابخانه‌ی کنترل، ارزیابی اثربخشی و بیانیه‌ی کاربردپذیری (apps/api/controls.py)

export interface ControlRow {
  id: number;
  code: string;
  title: string;
  kind: Choice;
  owner: Person;
  operated_by: Choice;
  is_key: boolean;
  is_active: boolean;
  /** شماره‌ی کنترل‌های پیوست A، مثل 5.15. */
  iso_controls: string[];
  href: string;
}

export interface ControlList extends Listing<ControlRow> {
  create_url: string | null;
  soa_url: string | null;
}

export interface Applicability {
  value: "undetermined" | "applicable" | "not_applicable";
  label: string;
  implementation: Choice | null;
}

/** E ثبت‌شده‌ی یک ارزیابی اثربخشی، و اگر الان اعتبار کاهش ندارد، چرا (در Bc فقط E1 حساب می‌شود). */
export interface Effectiveness {
  e: number;
  problem: string | null;
  suspended: boolean;
}

export interface EffectivenessRow extends Effectiveness {
  id: number;
  code: string;
  scope: string;
  test_to: Day | null;
  valid_until: Day | null;
  verified_by: Person | null;
  href: string;
}

export interface ControlDetail extends RecordParts {
  view: string;
  title: string;
  messages: PageMessage[];
  control: ControlRow & { objective: string };
  effectiveness: EffectivenessRow[];
  iso_controls: { id: number; code: string; title: string; applicability: Applicability; href: string | null }[];
  risks: RiskBrief[];
  edit_url: string | null;
  add_assessment_url: string | null;
  list_url: string;
}

export interface ControlAssessmentDetail extends RecordParts {
  view: string;
  title: string;
  messages: PageMessage[];
  assessment: Effectiveness & {
    id: number;
    code: string;
    level_name: string | null;
    control: {
      id: number;
      code: string;
      title: string;
      kind: Choice;
      is_key: boolean;
      owner: Person;
      href: string;
    };
    scope: string;
    exists: boolean;
    design_ok: boolean;
    population: string;
    coverage_pct: string | null;
    critical_points: string;
    critical_points_covered: boolean;
    exceptions: string;
    known_gap: boolean;
    test_method: string;
    test_from: Day | null;
    test_to: Day | null;
    sample_size: number | null;
    sample_rationale: string;
    test_result: string;
    operating_ok: boolean;
    limited_effect_proven: boolean;
    failures: string;
    conditions: { label: string; value: string }[];
    rationale: string;
    confidence: Choice | null;
    verified_by: Person | null;
    valid_until: Deadline | null;
    evidence_age: number;
    method_version: { name: string; href: string };
    created_by: Person;
    created_at: Day;
  };
  /** شرط‌هایی از E ثبت‌شده که داده‌های فعلی برگه دیگر برقرار نمی‌کنند. */
  unmet: string[];
  evidence: {
    id: number;
    code: string;
    title: string;
    kind: Choice;
    observed_on: Day;
    expired: boolean;
    href: string;
  }[];
  paths: {
    id: number;
    name: string;
    assessment: { code: string; href: string };
    risk: { code: string; title: string };
    href: string;
  }[];
  edit_url: string | null;
}

export interface IsoTheme {
  value: number;
  label: string;
}

export interface SoaRow {
  id: number;
  code: string;
  title: string;
  title_en: string;
  theme: IsoTheme;
  applicability: Applicability;
  control_count: number;
  risk_count: number;
  /** کاربرد دارد ولی هیچ کنترل فعال سازمان به آن نگاشت نشده است. */
  gap: boolean;
  href: string;
}

export interface SoaList extends Listing<SoaRow> {
  summary: {
    total: number;
    applicable: number;
    not_applicable: number;
    undetermined: number;
    implemented: number;
    gaps: number;
  };
  controls_url: string;
}

export interface SoaDetail {
  view: string;
  title: string;
  messages: PageMessage[];
  iso_control: {
    id: number;
    code: string;
    title: string;
    title_en: string;
    theme: IsoTheme;
    applicability: Applicability;
    justification: string | null;
    updated_at: Day | null;
  };
  warning: string | null;
  controls: ControlRow[];
  risks: RiskBrief[];
  edit_url: string | null;
  edit_label: string;
  list_url: string;
}

// --- کاتالوگ و ساختار سازمانی ---

/** بازه‌ی اعتبار یک رکورد کاتالوگ (catalog/includes/validity.html). */
export interface Validity {
  from: Day | null;
  until: Day | null;
  expired: boolean;
}

export interface CustomerRow {
  id: number;
  name: string;
  is_key: boolean;
  /** مبنای مالی به ریال؛ خالی یعنی ثبت نشده. */
  financial_basis: number | null;
  is_active: boolean;
  edit_url: string | null;
}

export interface CustomerList extends Listing<CustomerRow> {
  create_url: string | null;
}

export interface ServiceRow {
  id: number;
  code: string;
  name: string;
  kind: Choice;
  org_unit: string;
  owner: Person;
  lifecycle_stage: Choice;
  is_critical: boolean;
  is_active: boolean;
  href: string;
}

export interface ServiceList extends Listing<ServiceRow> {
  create_url: string | null;
}

/** خدمتی که به این خدمت، تأمین‌کننده یا دارایی وابسته است (dependents_table.html). */
export interface Dependent {
  id: number;
  service: { code: string; name: string; is_critical: boolean; href: string };
  is_shared_point: boolean;
  description: string;
  validity: Validity;
}

export interface ServiceDetail {
  view: string;
  title: string;
  messages: PageMessage[];
  service: ServiceRow & { description: string; environment: Choice };
  commitments: {
    id: number;
    title: string;
    description: string;
    kind: Choice | null;
    clause_ref: string;
    /** خالی یعنی همه‌ی بانک‌ها. */
    customer: string | null;
    owner: Person | null;
    validity: Validity;
    edit_url: string | null;
  }[];
  add_commitment_url: string | null;
  dependencies: {
    id: number;
    target_kind: string;
    target: string;
    /** نام خدمت بالادستی همیشه هست، ولی پیوندش فقط اگر کاربر آن خدمت را می‌بیند. */
    target_url: string | null;
    is_shared_point: boolean;
    description: string;
    alternative: string;
    /** مرز مسئولیت؛ null یعنی هیچ‌کدام از پنج پرسش جواب ندارد. */
    boundary: { label: string; value: string }[] | null;
    validity: Validity;
    edit_url: string | null;
  }[];
  add_dependency: { label: string; href: string }[];
  dependents: Dependent[];
  customer_links: {
    id: number;
    customer: string;
    is_key: boolean;
    tolerance_notes: string;
    rto: string | null;
    mtpd: string | null;
    rpo: string | null;
    bia_reference: string;
    validity: Validity;
    edit_url: string | null;
  }[];
  add_customer_url: string | null;
  /** فقط برای خدمت فعال؛ جهان ریسک خدمت غیرفعال ندارد. */
  coverage: { cells: CoverageCell[]; table_url: string } | null;
  risks: RiskBrief[];
  create_risk_url: string | null;
  edit_url: string | null;
  list_url: string;
}

export interface SupplierRow {
  id: number;
  name: string;
  description: string;
  is_critical: boolean;
  contract_owner: Person | null;
  is_active: boolean;
  href: string;
}

export interface SupplierList extends Listing<SupplierRow> {
  create_url: string | null;
}

export interface SupplierDetail {
  view: string;
  title: string;
  messages: PageMessage[];
  supplier: SupplierRow;
  dependents: Dependent[];
  edit_url: string | null;
  list_url: string;
}

export interface AssetRow {
  id: number;
  code: string;
  name: string;
  kind: Choice;
  org_unit: string;
  owner: Person;
  data_class: Choice | null;
  /** حرف‌های تیک‌خورده‌ی محرمانگی، صحت و دسترس‌پذیری. */
  cia: ("C" | "I" | "A")[];
  is_active: boolean;
  href: string;
}

export interface AssetList extends Listing<AssetRow> {
  create_url: string | null;
}

export interface AssetDetail {
  view: string;
  title: string;
  messages: PageMessage[];
  asset: AssetRow;
  dependents: Dependent[];
  edit_url: string | null;
  list_url: string;
}

export interface CommitmentRow {
  id: number;
  title: string;
  description: string;
  kind: Choice | null;
  clause_ref: string;
  /** فقط خدمت‌هایی که کاربر می‌بیند. */
  services: { code: string; href: string }[];
  customer: string | null;
  owner: Person | null;
  validity: Validity;
  edit_url: string | null;
}

export interface CommitmentList extends Listing<CommitmentRow> {
  create_url: string | null;
}

export interface UnitRow {
  id: number;
  name: string;
  code: string;
  /** عمق در درخت؛ ردیف‌ها به ترتیب درخت می‌آیند و هر واحد بلافاصله بعد از واحد بالادستش. */
  depth: number;
  managers: Person[];
  is_active: boolean;
  edit_url: string | null;
}

export interface UnitList extends Listing<UnitRow> {
  create_url: string | null;
}

// --- روش ارزیابی ---

export interface MethodScale {
  code: string;
  name: string;
  scope: string;
  /** متن خام؛ بندها با خط خالی و عنوان با «## » (فیلتر paragraphs جنگو). */
  description: string;
  guidance: string;
  has_level_names: boolean;
  has_bounds: boolean;
  levels: { value: number; name: string; bounds: string | null; criteria: string }[];
}

/** رنگ و نام یک سطح ریسک در روش ارزیابی. */
export interface MethodLevel {
  name: string;
  color: string;
  text_color: string;
}

export interface MethodPage {
  view: string;
  title: string;
  messages: PageMessage[];
  version: {
    number: number;
    name: string;
    status: Choice;
    is_trial: boolean;
    source: string;
    based_on: string | null;
    approval_ref: string;
    approved_on: Day | null;
    approval_recorded_by: Person | null;
    activated_at: Moment | null;
    change_notes: string;
    likelihood_strategy: Choice;
    impact_strategy: Choice;
    impact_guidance: string;
    decision_guidance: string;
    acceptance_guidance: string;
  };
  versions: { number: number; name: string; status: Choice; current: boolean; href: string }[];
  likelihood_scales: MethodScale[];
  bc_rules: { condition: string; bc: number }[];
  bc_default: number | null;
  /** جدول A × B؛ برای هر A، مقدار L در B1 تا B5 (خانه‌ی خالی null). */
  l_scale: (MethodScale & { grid: { a: number; values: (number | null)[] }[] }) | null;
  levels_range: number[];
  impact_scales: MethodScale[];
  risk_levels: (MethodLevel & {
    min_score: number;
    max_score: number;
    decision_rule: string;
    co_approver: string;
    containment: string | null;
    plan: string | null;
    acceptance: string | null;
    review: string | null;
  })[];
  floors: { min_impact: number; min_level: string }[];
  decision_matrix: { likelihood: number; cells: { score: number; level: MethodLevel | null; raised: boolean }[] }[];
  parameters: { key: string; label: string; value: string; unit: string; note: string }[];
  active_url: string;
}

// مدیریت سامانه (apps/api/admin_pages.py): کاربران، ورود کارکنان، تعطیلات و سوابق ممیزی

export interface UserRow {
  id: number;
  name: string | null;
  username: string;
  personnel_code: string | null;
  org_unit: string | null;
  /** نام گروه‌ها، همان نقش‌های سامانه. */
  roles: string[];
  is_active: boolean;
}

export interface UserList extends Listing<UserRow> {
  import_url: string;
}

/** یک بخش گزارش ورود کارکنان؛ level برای بخش‌هایی که کار دستی لازم دارند. */
export interface ImportSection {
  title: string;
  count: number;
  lines: string[];
  level: "warning" | "danger" | null;
}

/**
 * نتیجه‌ی فرستادن فایل کارکنان (گزارش آزمایشی با confirm) یا تأیید آن (آن‌چه انجام شد، بی confirm). confirm همان
 * فیلدهای پنهان دکمه‌ی تأیید صفحه‌ی جنگوست که دوباره به همان view فرستاده می‌شود.
 */
export interface StaffImportResult extends FormResult {
  report: { dry_run: boolean; sections: ImportSection[] };
  confirm: { url: string; values: { token: string; deactivate_missing: boolean } } | null;
}

export interface HolidayRow {
  id: number;
  date: Day;
  weekday: string;
  title: string;
  edit_url: string;
  delete_url: string;
}

export interface HolidayList extends Listing<HolidayRow> {
  create_url: string;
  note: string;
}

export interface AuditTab {
  label: string;
  href: string;
}

export interface AuditEventRow {
  id: number;
  at: Moment;
  /** نام کاربر واردشده؛ برای ورود ناموفق و خط فرمان null. */
  user: string | null;
  username: string | null;
  event: Choice;
  /** ورود ناموفق و دسترسی ردشده. */
  warning: boolean;
  summary: string | null;
  ip_address: string | null;
}

export interface AuditEventList extends Listing<AuditEventRow> {
  tabs: AuditTab[];
  /** خروجی Excel با همین فیلترها؛ تا فیلترها درست نباشند null. */
  export_url: string | null;
}

export interface AuditChangeRow {
  id: number;
  at: Moment;
  user: Person | null;
  type: Choice;
  record: string;
  reason: string | null;
  changes: { label: string; old: string; new: string }[];
  /** ویرایشی که فیلد نمایش‌دادنی‌اش عوض نشده (مثلاً رمز یا نقش). */
  hidden_edit: boolean;
}

export interface AuditChangeList extends Listing<AuditChangeRow> {
  tabs: AuditTab[];
}

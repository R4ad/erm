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

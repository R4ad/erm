# Graph Report - erm  (2026-11-11)

## Corpus Check
- Large corpus: 624 files · ~300,354 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 5876 nodes · 19466 edges · 240 communities (152 shown, 88 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 1864 edges (avg confidence: 0.93)
- Token cost: 682,200 input · 0 output

## Community Hubs (Navigation)
- Risk Views, Models & Forms
- Treatment Actions & My Work
- Assessment Views & API
- Frontend UI Primitives
- Frontend Listing Pages
- Treatment Monitoring & Tests
- Schema Forms & Fields
- Frontend Cards & Form Pages
- Frontend API Types
- Frontend Record Detail Pages
- Django Forms & Jalali Fields
- Frontend Test Fixtures
- Risk Acceptance Logic
- Risk Universe Coverage
- Catalog Assets & Permissions
- Audit Log & Filtered Lists
- Vendored htmx (minified)
- Catalog Views & Forms
- View Mixins & Role Guards
- Jalali Calendar & Workdays
- Workflow Change Requests
- Assessment Review & Submission
- Methodology Engine Tests
- Frontend Feature Tests
- Organization Units
- Roles & Staff Import
- Vendored Bootstrap Core
- Questionnaire Response Forms
- Actions API Formatting
- Scoring Engine & Bands
- Questionnaire Views & Permissions
- Questionnaire Bridge Pages
- Method Tables & Version View
- Playwright E2E Tests
- Supplier Dependencies
- Bootstrap Tooltip (vendored)
- Pending Risks from Answers
- Audit Events & Tests
- Business Rules & v5 Method
- Method Version Lifecycle
- Questionnaire Submission Tests
- Risk Register Tests
- Frontend Dev Dependencies
- Holidays & Service Customers
- Accounts & Audit View Tests
- Django Bridge Core
- Session API & Base Templates
- API Integration Tests
- Services & Risk Scenarios
- Methodology Admin
- Risk Evidence & Links
- Bootstrap Component Base (vendored)
- Bootstrap Modal (vendored)
- Questionnaire Answer API
- Bridge Form Tests
- Impact Suggestions & Facts
- Methodology Model Tests
- Django App Configs
- Evidence & Design System
- Treatment & Acceptance Templates
- Question Options & Admin
- Bootstrap Carousel (vendored)
- API Page Listings
- Structured Questionnaire Answers
- Controls API
- Assessment Results & Likelihood
- Frontend Entry & Dependencies
- Staff Import Tests
- Service Commitments
- Evidence Tests
- Jalali Dates (frontend)
- Questionnaire Lists & Repair
- Questionnaire Bridge Tests
- Comments & Record Mixins
- Risk & Catalog Form Fields
- Catalog API
- Controls Tests
- Users & Role Tests
- Control Bridge Tests
- Bootstrap Config Base (vendored)
- Bootstrap Dropdown (vendored)
- SPA Route Table
- Control Effectiveness Tests
- Method Scales & Levels
- Workflow Lifecycle Tests
- Assessment Detail API
- API Form Descriptions
- Method Parameters
- TS App Config
- Catalog Bridge Tests
- Method Version Locking
- Risk Model & Status
- Vendored JS Helpers
- Bootstrap Template Factory (vendored)
- Risk Questions & Timeline
- Paths & Impact Details
- SoA Applicability
- Vite & E2E Server
- Assessment Bridge Tests
- Lifecycle & Assessment Rounds
- Control Assessment & Bc
- Likelihood Path Tests
- Controls & SoA Templates
- Questionnaire Questions
- Pending Risk Review Views
- Risk Creation Flow
- Bootstrap Tabs (vendored)
- Admin Bridge Tests
- Initiator & Assessment Edit
- Questionnaire Start Views
- Vendored Jalali Datepicker
- Audit Signals
- Frontend App Tests
- Theme & Storage
- TS Node Config
- Assessment Comparison
- Workflow Transition Views
- Bootstrap Collapse (vendored)
- Bootstrap ScrollSpy (vendored)
- Actions Admin
- Template Formatting Filters
- Frontend Formatting Utils
- Methodology Admin Tests
- Risks Admin
- ESLint Config
- Login & Auth
- Assessment Result Rules
- Catalog Admin
- Catalog View Tests
- Method Version Admin Actions
- Bootstrap Event Handler (vendored)
- Bootstrap Swipe (vendored)
- My Work API
- Impact Profile Form
- Assessment Workspace & Compare
- Likelihood Path Forms
- Schema Check Command
- Frontend Route Matching
- Bootstrap Backdrop (vendored)
- Attachments
- Controls Admin
- Control Create Views
- Risk Update & Closed Risks
- Compose Web Service
- Compose Monitoring Service
- Admin Page Tests
- README Frontend Notes
- Questionnaire Start API
- Method Version 1 Migration
- Methodology Test Fixtures
- Workflow Admin
- Frontend NPM Scripts
- Button & Link Components
- Vendored htmx Internals
- SPA Entry & CSP
- Assessment QC Review
- Assessment Create View
- Impact Profile Dimensions
- Comparison Trend
- Compose Healthchecks
- Compose Nginx Proxy
- Methodology API
- Compose Volumes
- Compose Database Service
- Reassessment Admin
- Assessment Admin
- Audit Event Admin
- ISO Annex A Migration
- Core Admin
- Django manage.py
- Role Groups Migration
- Monitoring Notice Admin
- Evidence Choices
- Core App Config
- Questionnaire Repair Migration
- Management Report
- Graphify Project Rules
- Compose Environment
- ResizeObserver Test Stub
- README Overview
- Custom User Admin
- Method Lock Migration
- Structured Questionnaire Migration
- Risk Status Migration
- TS Root Config
- Prettier Config
- Schema Check Rules
- User List Template
- Admin Edit Limits (v5)
- Delegated Approval (v5)
- Retirement Path Rule (v5)
- WCAG Accessibility Target
- Motion Guidelines
- Responsive Layout
- Typography (Inter/Vazirmatn)

## God Nodes (most connected - your core abstractions)
1. `make_user()` - 200 edges
2. `Role` - 183 edges
3. `Risk` - 145 edges
4. `AppLink()` - 129 edges
5. `cn()` - 121 edges
6. `OrgUnit` - 118 edges
7. `Badge()` - 107 edges
8. `make_service()` - 100 edges
9. `RiskCategory` - 86 edges
10. `useTitle()` - 86 edges

## Surprising Connections (you probably didn't know these)
- `Single Field Include (label, help text, errors)` --semantically_similar_to--> `Field()`  [INFERRED] [semantically similar]
  templates/includes/field.html → frontend/src/components/ui/field.tsx
- `level_badge.html (Risk Level Badge)` --semantically_similar_to--> `LevelBadge()`  [INFERRED] [semantically similar]
  apps/assessments/templates/assessments/includes/level_badge.html → frontend/src/components/ui/level-badge.tsx
- `Pagination Include (count, prev/next via querystring)` --semantically_similar_to--> `Pagination()`  [INFERRED] [semantically similar]
  templates/includes/pagination.html → frontend/src/components/ui/pagination.tsx
- `workspace.html (Risk Assessment Workspace)` --semantically_similar_to--> `AssessmentWorkspacePage()`  [INFERRED] [semantically similar]
  apps/assessments/templates/assessments/workspace.html → frontend/src/features/assessments/AssessmentWorkspacePage.tsx
- `comparison_table.html (Assessment Comparison Table)` --semantically_similar_to--> `ComparisonTable()`  [INFERRED] [semantically similar]
  apps/assessments/templates/assessments/includes/comparison_table.html → frontend/src/features/assessments/ComparisonTable.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Filterable list page pattern (filter_form + #results + pagination)** — apps_accounts_templates_accounts_user_list, apps_actions_templates_actions_acceptance_list, apps_actions_templates_actions_action_list [INFERRED 0.95]
- **Monitoring reviews and notices flow** — readme_monitoring_service, apps_actions_templates_actions_notices, apps_actions_templates_actions_review_detail, apps_actions_templates_actions_includes_my_work_sections [INFERRED 0.85]
- **Treatment plan reassessment flow** — apps_actions_templates_actions_plan_detail_reassessment, apps_actions_templates_actions_plan_detail, apps_actions_templates_actions_reassessment_form, apps_actions_templates_actions_includes_risk_treatment, apps_actions_templates_actions_includes_my_work_sections [INFERRED 0.85]
- **Assessment input forms for impact, initiator A and path B** — apps_assessments_templates_assessments_impact_form, apps_assessments_templates_assessments_initiator_form, apps_assessments_templates_assessments_path_form, apps_assessments_templates_assessments_impact_form_impact_profile_recording_rules, apps_assessments_templates_assessments_initiator_form_initiator_scale_a, apps_assessments_templates_assessments_path_form_path_barrier_b [INFERRED 0.85]
- **Control effectiveness E feeds path barrier Bc** — apps_controls_templates_controls_control_assessment_form_e_level_conditions, apps_controls_templates_controls_control_assessment_form_evidence_staleness, apps_assessments_templates_assessments_path_form_path_barrier_b, apps_controls_templates_controls_control_assessment_form, apps_controls_templates_controls_control_assessment_detail [INFERRED 0.85]
- **Assessment comparison flow from risk page to comparison table** — apps_assessments_templates_assessments_includes_risk_assessments, apps_assessments_views_compareview, apps_assessments_comparison_compare, apps_assessments_templates_assessments_includes_comparison_table, apps_assessments_templates_assessments_includes_level_badge [INFERRED 0.85]
- **Django templates mirrored by apps/api React bridge serializers** — apps_controls_templates_controls_soa_list, apps_api_controls_soa_list, apps_questionnaires_templates_questionnaires_response_detail, apps_api_questionnaire_pages_response_detail, apps_methodology_templates_methodology_version_detail, apps_api_methodology_version_detail, apps_risks_templates_risks_coverage, apps_api_pages_coverage, apps_controls_templates_controls_includes_control_table, apps_api_controls_control_row [INFERRED 0.85]
- **Questionnaire answer, review and pending-risk triage flow** — apps_questionnaires_templates_questionnaires_answer_home, apps_questionnaires_templates_questionnaires_response_answer, apps_questionnaires_templates_questionnaires_response_list, apps_questionnaires_templates_questionnaires_response_detail, apps_questionnaires_templates_questionnaires_includes_response_status, apps_questionnaires_templates_questionnaires_questionnaire_detail_risk_indicator_option, apps_questionnaires_templates_questionnaires_response_detail_review_completion_gate [INFERRED 0.85]
- **v5 method scoring rules shown on the method version page** — apps_methodology_templates_methodology_version_detail_paths_v5_likelihood, apps_methodology_templates_methodology_version_detail_bc_lowest_rule, apps_methodology_templates_methodology_version_detail_max_impact_strategy, apps_methodology_templates_methodology_version_detail_risk_score_l_times_i, apps_methodology_templates_methodology_version_detail_impact_floor [EXTRACTED 1.00]
- **Risk Detail Page Composition** — apps_risks_templates_risks_risk_detail, apps_risks_templates_risks_includes_risk_status, apps_workflow_templates_workflow_includes_risk_actions, apps_risks_templates_risks_includes_evidence_table, apps_workflow_templates_workflow_includes_risk_timeline, apps_workflow_context_risk_workflow [EXTRACTED 1.00]
- **Risk Universe Coverage Cell Display** — apps_risks_templates_risks_includes_coverage_cell, apps_risks_templates_risks_includes_coverage_badge, apps_risks_models_coverage_summary, apps_risks_models_coverage_status, docs_business_rules_risk_universe [INFERRED 0.85]
- **Merge/Split Proposal Flow** — apps_workflow_templates_workflow_includes_risk_actions, apps_workflow_templates_workflow_change_request_list, apps_workflow_templates_workflow_change_request_detail, apps_workflow_templates_workflow_includes_change_status, docs_business_rules_merge_and_split, apps_workflow_models_changerequest [INFERRED 0.85]
- **Risk Scoring Pipeline (A, B0, E, Bc, B -> L; profile -> I; L x I -> decision level)** — docs_risk_assessment_guide_initiator_a, docs_risk_assessment_guide_baseline_b0, docs_risk_assessment_guide_control_effectiveness_e, docs_risk_assessment_guide_barrier_credit_bc, docs_risk_assessment_guide_path_and_scenario_b, docs_risk_assessment_guide_likelihood_l, docs_risk_assessment_guide_impact_i, docs_risk_assessment_guide_risk_score, docs_risk_assessment_guide_decision_level, docs_risk_assessment_guide_precedence_rules [EXTRACTED 1.00]
- **Risk Monitoring & Notification Subsystem (reviews, triggers, acceptance expiry, notices, monitor_risks)** — docs_v5_logic_changes_periodic_review_and_triggers, docs_v5_logic_changes_acceptance_expiry, docs_v5_logic_changes_internal_notices, apps_actions_management_commands_monitor_risks, apps_actions_monitoring [INFERRED 0.85]
- **Classic Django Form Page Rendering (FormPageMixin -> form_page -> form_fields -> field)** — apps_core_views_formpagemixin, templates_form_page, templates_includes_form_fields, templates_includes_field, templates_base [INFERRED 0.95]

## Communities (240 total, 88 thin omitted)

### Community 0 - "Risk Views, Models & Forms"
Cohesion: 0.02
Nodes (95): Migration, Migration, Migration, Migration, Migration, Migration, Migration, Migration (+87 more)

### Community 1 - "Treatment Actions & My Work"
Cohesion: 0.02
Nodes (85): creation_problems(), ActionsConfig, risk_treatment(), MoveForm, RevokeForm, SignForm, Reassessment, Decision (+77 more)

### Community 2 - "Assessment Views & API"
Cohesion: 0.02
Nodes (62): action_evidence(), AssessmentCandidatesView, AssessmentListView, StartAssessmentView, CsrfView, LogoutView, ApiView, exception_handler() (+54 more)

### Community 3 - "Frontend UI Primitives"
Cohesion: 0.04
Nodes (127): Frontend Code Structure (TanStack Query, react-hook-form + Zod, i18n), Providers(), AppShell(), RouteProgress(), ShellSkeleton(), Brand(), BrandMark(), activeRoute() (+119 more)

### Community 4 - "Frontend Listing Pages"
Cohesion: 0.07
Nodes (113): FORM_ROUTES, AppLink(), Badge(), BadgeProps, Tone, tones, Crumb, PageHeader() (+105 more)

### Community 5 - "Treatment Monitoring & Tests"
Cohesion: 0.04
Nodes (76): AcceptanceSignatureInline, ActionUpdateInline, AcceptanceSignature, Authority, Decision, Meta, ActionUpdate, Meta (+68 more)

### Community 6 - "Schema Forms & Fields"
Cohesion: 0.04
Nodes (99): Radix-based UI Component Library, CalendarProps, DatePicker(), DatePickerProps, AriaInvalid, Checkbox(), ChoiceLabel(), ChoiceProps (+91 more)

### Community 7 - "Frontend Cards & Form Pages"
Cohesion: 0.05
Nodes (96): formPage(), keyedByPath(), questionFormPage(), Accordion, AccordionContent(), AccordionItem(), AccordionTrigger(), Count() (+88 more)

### Community 8 - "Frontend API Types"
Cohesion: 0.02
Nodes (107): ControlRows(), ControlTable(), IsoCodes(), FilterBarProps, AcceptanceDetail, AcceptanceSignature, AcceptanceState, ActionDetail (+99 more)

### Community 9 - "Frontend Record Detail Pages"
Cohesion: 0.09
Nodes (98): One-Button Bridge Actions with ConfirmDialog, Dossier Layout Pattern (Section, DossierLayout, SectionNav, DocSection), Deadline(), ConfirmDialog(), LevelBadge(), Alert(), AcceptanceDetailPage(), Decision() (+90 more)

### Community 10 - "Django Forms & Jalali Fields"
Cohesion: 0.03
Nodes (45): AcceptanceFilterForm, AcceptanceForm, Meta, ActionChoiceField, ActionFilterForm, ActionForm, Meta, AssessmentChoiceField (+37 more)

### Community 11 - "Frontend Test Fixtures"
Cohesion: 0.04
Nodes (96): defaults(), djangoQuery(), evidencePages(), done, AcceptanceList, AcceptanceRow, ActionList, ActionRow (+88 more)

### Community 12 - "Risk Acceptance Logic"
Cohesion: 0.05
Nodes (56): acceptance_cap(), acceptance_problems(), acceptances_to_sign(), authority_reasons(), can_revoke(), can_sign(), create_acceptance(), decision_text() (+48 more)

### Community 13 - "Risk Universe Coverage"
Cohesion: 0.06
Nodes (44): risk(), risk(), risk(), setup(), make_service(), Coverage, Meta, Status (+36 more)

### Community 14 - "Catalog Assets & Permissions"
Cohesion: 0.05
Nodes (52): assignee(), grc(), owner(), verifier(), committee(), authorities(), unit_manager(), Asset (+44 more)

### Community 15 - "Audit Log & Filtered Lists"
Cohesion: 0.04
Nodes (25): AcceptanceListView, ActionListView, ChangeFilterForm, EventFilterForm, PeriodFilterMixin, current_request(), log_event(), show_related() (+17 more)

### Community 16 - "Vendored htmx (minified)"
Cohesion: 0.10
Nodes (74): Ae(), an(), at(), B(), Be(), bt(), c(), ce() (+66 more)

### Community 17 - "Catalog Views & Forms"
Cohesion: 0.04
Nodes (46): AssetFilterForm, AssetForm, Meta, CommitmentFilterForm, CommitmentForm, Meta, CustomerFilterForm, CustomerForm (+38 more)

### Community 18 - "View Mixins & Role Guards"
Cohesion: 0.05
Nodes (32): RoleRequiredMixin, AssetCreateView, AssetUpdateView, BackToRecordMixin, CommitmentFormMixin, CommitmentUpdateView, CustomerCreateView, CustomerUpdateView (+24 more)

### Community 19 - "Jalali Calendar & Workdays"
Cohesion: 0.06
Nodes (26): test_jalali_months_and_periods(), value(), jalali_year(), jalali_year_range(), parse_jalali(), CodeCounter, Meta, next_code() (+18 more)

### Community 20 - "Workflow Change Requests"
Cohesion: 0.06
Nodes (23): test_a_reassessed_risk_needs_an_assessment_approved_in_the_new_round(), test_the_workgroup_sends_the_risk_to_treatment_only_with_an_approved_current_assessment(), ChangeRequestFilterForm, ChangeRequestForm, Meta, DecisionForm, RiskChoiceField, blocking_problems() (+15 more)

### Community 21 - "Assessment Review & Submission"
Cohesion: 0.08
Nodes (41): compute(), Outcome, outcome(), submission_problems(), _approve(), assessor_ids(), decide_referral(), dispute_party_ids() (+33 more)

### Community 22 - "Methodology Engine Tests"
Cohesion: 0.09
Nodes (40): Impact, Inputs, InvalidInput, path(), profile(), run(), summary(), tables() (+32 more)

### Community 23 - "Frontend Feature Tests"
Cohesion: 0.11
Nodes (38): done, pageAt(), pageAt(), setup(), compare(), dossier(), impactForm(), ImpactProfilePage() (+30 more)

### Community 24 - "Organization Units"
Cohesion: 0.06
Nodes (23): test_another_unit_cannot_see_the_response(), test_active_service_needs_an_active_unit_and_owner(), test_customer_name_is_unique_with_a_persian_message(), test_inactive_service_may_keep_an_inactive_unit_and_owner(), OrgUnitForm, Meta, UnitChoiceIterator, OrgUnit (+15 more)

### Community 25 - "Roles & Staff Import"
Cohesion: 0.07
Nodes (23): StaffFileForm, StaffImportConfirmForm, UserFilterForm, Command, role_required(), decorator(), Role, assign_managers() (+15 more)

### Community 26 - "Vendored Bootstrap Core"
Cohesion: 0.10
Nodes (39): be(), bi(), Ce(), ci(), De(), _e(), ei(), F() (+31 more)

### Community 27 - "Questionnaire Response Forms"
Cohesion: 0.09
Nodes (45): RequiredMark(), answerField(), answerKey(), fieldErrors(), isAnswered(), payloadFrom(), ResponseValues, submitSchema() (+37 more)

### Community 28 - "Actions API Formatting"
Cohesion: 0.10
Nodes (31): acceptance_detail(), acceptance_list(), _acceptance_note(), acceptance_row(), acceptance_state(), action_detail(), action_list(), action_row() (+23 more)

### Community 29 - "Scoring Engine & Bands"
Cohesion: 0.06
Nodes (30): as_band(), Band, calculate(), check_impacts(), check_likelihood(), check_path(), CheckedLikelihood, impact_band() (+22 more)

### Community 30 - "Questionnaire Views & Permissions"
Cohesion: 0.07
Nodes (22): DismissForm, Meta, PendingRiskForm, Meta, QuestionnaireForm, Meta, ResponseFilterForm, ResponseStartForm (+14 more)

### Community 31 - "Questionnaire Bridge Pages"
Cohesion: 0.06
Nodes (25): staff_import_form(), staff_import_result(), impact_forms(), impact_profile(), initiator_form(), path_form(), _coverage(), _pending_convert() (+17 more)

### Community 32 - "Method Tables & Version View"
Cohesion: 0.07
Nodes (12): effectiveness_badge.html (control E-level badge), ImpactStrategy, LikelihoodStrategy, can_see_drafts(), visible_versions(), MethodTables, methodology/version_detail.html (assessment method version page), test_floor_raises_the_level_but_not_the_score() (+4 more)

### Community 33 - "Playwright E2E Tests"
Cohesion: 0.11
Nodes (17): Answer, ApiCall, byPath(), expectAccessible(), Handler, isReply(), MockApi, REPLY (+9 more)

### Community 34 - "Supplier Dependencies"
Cohesion: 0.08
Nodes (23): DependencyForm, Meta, Dependency, Meta, Supplier, Meta, dependency_data(), grc() (+15 more)

### Community 36 - "Pending Risks from Answers"
Cohesion: 0.07
Nodes (17): test_a_unit_manager_starts_saves_and_submits_a_response(), PendingRisk, Meta, Source, Status, convert_pending(), dismiss_pending(), mark_reviewed() (+9 more)

### Community 37 - "Audit Events & Tests"
Cohesion: 0.09
Nodes (22): Command, AuditEvent, Event, Meta, AuditEventQuerySet, AuditLogIsReadOnly, client_ip(), describe_changes() (+14 more)

### Community 38 - "Business Rules & v5 Method"
Cohesion: 0.14
Nodes (30): Business Rules (قاعده‌های کسب‌وکار), Assessment Methodology Version (نسخه‌ی روش), Assessment Result and Quality Control, Assessment Types (inherent, current, target), Assets and Suppliers, Audit Log (سوابق ممیزی), Banks and Services, Calculation Engine (موتور محاسبه) (+22 more)

### Community 39 - "Method Version Lifecycle"
Cohesion: 0.10
Nodes (25): activate_version(), check_bounds(), check_likelihood_table(), check_risk_levels(), check_scales(), check_version(), copy_version(), record_approval() (+17 more)

### Community 40 - "Questionnaire Submission Tests"
Cohesion: 0.10
Nodes (31): Response, Channel, Meta, Status, submit_response(), add_question(), grc(), manager() (+23 more)

### Community 41 - "Risk Register Tests"
Cohesion: 0.12
Nodes (34): mark_covered_by_risk(), parse_tag_names(), category(), grc(), make_risk(), make_scenario(), risk_data(), scenario_risk_url() (+26 more)

### Community 42 - "Frontend Dev Dependencies"
Cohesion: 0.07
Nodes (39): devDependencies, axe-core@4.14.0, @axe-core/playwright@4.13.0, @babel/core@7.29.7, babel-plugin-react-compiler@1.0.0, eslint@9.39.5, jsdom@30.1.2, playwright-core@1.63.0 (+31 more)

### Community 43 - "Holidays & Service Customers"
Cohesion: 0.10
Nodes (28): test_a_moment_shows_the_tehran_day_not_the_utc_day(), test_every_model_with_history_is_tracked(), ServiceCustomer, Meta, grc(), link_data(), mellat(), service() (+20 more)

### Community 44 - "Accounts & Audit View Tests"
Cohesion: 0.11
Nodes (25): confirm(), imported_users(), listed(), pending_dir(), staff(), test_a_file_that_cannot_be_read_is_rejected_and_not_kept(), test_cancel_deletes_the_file_and_saves_nothing(), test_filters_by_unit_with_its_sub_units_role_and_status() (+17 more)

### Community 45 - "Django Bridge Core"
Cohesion: 0.08
Nodes (10): blocked(), CollectedMessages, FormBridgeView, link(), page_request(), PageBridgeView, rendered(), run() (+2 more)

### Community 46 - "Session API & Base Templates"
Cohesion: 0.08
Nodes (16): inbox_counts(), link(), navigation(), questionnaires/response_list.html (response review queue), Transition, Status, answerable_questions(), QuestionListView (+8 more)

### Community 47 - "API Integration Tests"
Cohesion: 0.11
Nodes (26): api(), approve(), csrf_client(), grc(), level(), make_questionnaire(), make_risk(), manager() (+18 more)

### Community 48 - "Services & Risk Scenarios"
Cohesion: 0.07
Nodes (19): ServiceForm, Meta, check_active_unit_and_owner(), Service, Environment, Kind, LifecycleStage, Meta (+11 more)

### Community 49 - "Methodology Admin"
Cohesion: 0.07
Nodes (15): BcRuleInline, ImpactFloorInline, LikelihoodCellInline, LockedHistoryAdmin, MethodParameterInline, RiskLevelInline, ScaleAdmin, ScaleInline (+7 more)

### Community 50 - "Risk Evidence & Links"
Cohesion: 0.07
Nodes (14): ExternalLinkInline, CoverageForm, Meta, ExternalLink, Kind, Meta, Tag, Meta (+6 more)

### Community 51 - "Bootstrap Component Base (vendored)"
Cohesion: 0.10
Nodes (4): mo, Qn, X, In()

### Community 52 - "Bootstrap Modal (vendored)"
Cohesion: 0.11
Nodes (6): Ln, un, bn(), gn(), hn(), ln()

### Community 53 - "Questionnaire Answer API"
Cohesion: 0.10
Nodes (12): answer_value(), AnswerHomeView, form_data(), response_detail(), response_row(), ResponseDetailView, selected_ids(), check_inputs() (+4 more)

### Community 54 - "Bridge Form Tests"
Cohesion: 0.16
Nodes (27): api(), form(), grc(), make_evidence(), make_risk(), media(), owner(), test_a_coverage_cell_saves_and_goes_back_to_the_same_filters() (+19 more)

### Community 55 - "Impact Suggestions & Facts"
Cohesion: 0.09
Nodes (24): impact_scales(), impact_summary(), ImpactSummary, stakeholder_facts(), StakeholderFacts, suggest_duration(), suggest_financial(), Suggestion (+16 more)

### Community 56 - "Methodology Model Tests"
Cohesion: 0.13
Nodes (20): RiskLevel, CoApprover, Meta, make_level(), make_version(), test_approval_and_activation_rules_of_a_version(), test_database_rejects_a_color_that_is_not_hex(), test_floor_must_point_to_a_level_of_the_same_version() (+12 more)

### Community 57 - "Django App Configs"
Cohesion: 0.06
Nodes (10): AccountsConfig, ApiConfig, AssessmentsConfig, CatalogConfig, MethodologyConfig, OrganizationConfig, QuestionnairesConfig, ReportsConfig (+2 more)

### Community 58 - "Evidence & Design System"
Cohesion: 0.08
Nodes (19): test_risk_details_do_not_expose_inaccessible_confidential_evidence(), test_workgroup_can_create_evidence_only_for_risks_under_assessment(), Evidence, AccessClass, Kind, Meta, Reliability, ERM Design System (MASTER) (+11 more)

### Community 59 - "Treatment & Acceptance Templates"
Cohesion: 0.13
Nodes (27): acceptance_detail.html (risk acceptance detail), Risk acceptance signature workflow, Acceptance validity cap per decision level, acceptance_list.html (risk acceptances list), action_detail.html (treatment action detail), Treatment action lifecycle (planned, approved, ready, in_progress, verified), action_list.html (treatment actions list), acceptance_status.html (acceptance status badge) (+19 more)

### Community 60 - "Question Options & Admin"
Cohesion: 0.09
Nodes (14): AnswerInline, NoDeleteAdmin, OptionInline, PendingRiskAdmin, QuestionAdmin, QuestionnaireAdmin, ResponseAdmin, OptionForm (+6 more)

### Community 62 - "API Page Listings"
Cohesion: 0.12
Nodes (17): change_list(), event_list(), holiday_list(), _tabs(), user_list(), filter_defaults(), listing(), category_list() (+9 more)

### Community 63 - "Structured Questionnaire Answers"
Cohesion: 0.14
Nodes (20): InitialEvidence, Meta, PathConsequence, PathControl, RiskInstance, RiskPath, ServiceObjective, ServiceRecord (+12 more)

### Community 64 - "Controls API"
Cohesion: 0.14
Nodes (17): applicability(), _applicability_of(), control_assessment_detail(), control_assessment_form(), control_detail(), control_list(), control_row(), effectiveness() (+9 more)

### Community 65 - "Assessment Results & Likelihood"
Cohesion: 0.12
Nodes (16): Computation, approved_likelihood(), assessment_rate_check(), band_or_none(), check_rate(), ControlRow, initiator_scale(), likelihood_summary() (+8 more)

### Community 66 - "Frontend Entry & Dependencies"
Cohesion: 0.08
Nodes (26): dependencies, clsx@2.1.1, @fontsource-variable/inter@5.3.0, @fontsource-variable/vazirmatn@5.3.0, get-nonce@1.0.1, @hookform/resolvers@5.9.1, lucide-react@1.57.0, radix-ui@1.8.1 (+18 more)

### Community 67 - "Staff Import Tests"
Cohesion: 0.21
Nodes (19): import_staff(), read_staff_file(), StaffRow, import_file(), make_file(), person(), test_bad_rows_are_reported_and_left_out(), test_dry_run_saves_nothing() (+11 more)

### Community 68 - "Service Commitments"
Cohesion: 0.15
Nodes (18): Commitment, Kind, Meta, visible_commitments(), commitment_data(), grc(), test_add_from_the_service_page_preselects_the_service_and_goes_back_to_it(), test_commitment_filters() (+10 more)

### Community 69 - "Evidence Tests"
Cohesion: 0.16
Nodes (24): comment_url(), evidence_data(), grc(), make_evidence(), make_risk(), media(), owner(), test_a_risk_owner_adds_evidence_only_to_their_own_risks() (+16 more)

### Community 70 - "Jalali Dates (frontend)"
Cohesion: 0.20
Nodes (24): Calendar(), go(), onKeyDown(), addDays(), addMonths(), BREAKS, d2g(), describeJalali() (+16 more)

### Community 71 - "Questionnaire Lists & Repair"
Cohesion: 0.10
Nodes (10): Questionnaire, Meta, columns(), make_old_schema(), run_repair(), test_the_repair_brings_back_the_columns_and_keeps_the_old_commitments_text(), test_the_repair_does_nothing_on_a_fresh_database(), setup_response() (+2 more)

### Community 72 - "Questionnaire Bridge Tests"
Cohesion: 0.16
Nodes (19): add_question(), api(), grc(), manager(), question_values(), questionnaire(), scenario(), submitted() (+11 more)

### Community 73 - "Comments & Record Mixins"
Cohesion: 0.08
Nodes (8): Comment, Meta, visible_record(), attachment_download(), CommentCreateView, CommentUpdateView, RecordMixin, Attachments and Comments

### Community 74 - "Risk & Catalog Form Fields"
Cohesion: 0.11
Nodes (6): active_or_current(), user_choices(), EvidenceForm, Meta, RiskScenarioForm, Meta

### Community 75 - "Catalog API"
Cohesion: 0.16
Nodes (18): asset_detail(), asset_list(), asset_row(), _boundary(), commitment_list(), customer_list(), dependents(), _duration() (+10 more)

### Community 76 - "Controls Tests"
Cohesion: 0.17
Nodes (20): auditor(), control_data(), grc(), iso(), make_control(), make_risk(), media(), owner() (+12 more)

### Community 77 - "Users & Role Tests"
Cohesion: 0.16
Nodes (8): User, call_as(), grc_only_view(), test_all_role_groups_exist_after_migrate(), test_manager_of_two_units_covers_both_subtrees_only(), test_system_admin_passes_every_role_check(), test_user_with_role_passes_and_others_get_403(), system_admin()

### Community 78 - "Control Bridge Tests"
Cohesion: 0.15
Nodes (15): api(), control(), grc(), owner(), test_assessment_detail_shows_the_sheet_and_warns_when_it_no_longer_holds(), test_control_detail_shows_effectiveness_mappings_and_risks(), test_grc_creates_and_edits_a_control_with_its_annex_a_mappings(), test_soa_lists_annex_a_with_its_summary_and_gaps() (+7 more)

### Community 79 - "Bootstrap Config Base (vendored)"
Cohesion: 0.11
Nodes (3): B, U, W

### Community 81 - "SPA Route Table"
Cohesion: 0.12
Nodes (14): _escape(), _js_pattern(), _react_route(), route_table(), _routes(), spa_route(), _walk(), test_treatment_pages_have_react_routes() (+6 more)

### Community 82 - "Control Effectiveness Tests"
Cohesion: 0.14
Nodes (17): valid_control_assessment(), control(), evidence(), grc(), make_assessment(), owner(), sheet(), test_database_rejects_e_outside_1_to_5_and_a_reasonless_assessment() (+9 more)

### Community 83 - "Method Scales & Levels"
Cohesion: 0.11
Nodes (9): Scale, BoundRule, Kind, Meta, ScaleLevel, Meta, methodology/includes/scale.html (scale levels table), bounds() (+1 more)

### Community 84 - "Workflow Lifecycle Tests"
Cohesion: 0.19
Nodes (20): get_transition(), make_risk(), test_a_merge_into_a_risk_that_closed_meanwhile_is_refused(), test_a_transition_from_another_status_is_refused(), test_an_approved_split_creates_new_risks_and_keeps_the_source(), test_asking_new_questions_sends_the_risk_back_until_they_are_answered(), test_closed_risks_take_no_new_evidence_or_links(), test_grc_proposes_a_merge_and_the_owner_approves_it() (+12 more)

### Community 85 - "Assessment Detail API"
Cohesion: 0.19
Nodes (16): assessment_detail(), compare(), _compare_cell(), comparison(), _evidence(), _header(), _impact_cell(), _impacts() (+8 more)

### Community 86 - "API Form Descriptions"
Cohesion: 0.17
Nodes (13): _review(), describe_field(), describe_form(), field_help(), field_kind(), field_value(), _flat_choices(), form_data() (+5 more)

### Community 87 - "Method Parameters"
Cohesion: 0.11
Nodes (8): MethodParameter, Key, Meta, test_every_parameter_has_a_value_and_a_unit(), test_numeric_bounds_of_a_and_f_follow_the_document(), test_texts_have_no_missing_or_double_spaces(), test_version_1_is_the_only_version_and_is_active_and_trial(), v5()

### Community 88 - "TS App Config"
Cohesion: 0.10
Nodes (20): compilerOptions, exactOptionalPropertyTypes, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+12 more)

### Community 89 - "Catalog Bridge Tests"
Cohesion: 0.22
Nodes (16): page(), api(), grc(), owner(), service(), test_a_commitment_from_a_service_starts_with_that_service(), test_a_dependency_is_added_through_the_django_form_and_returns_to_the_service(), test_banks_list_editable_only_by_the_catalog_team() (+8 more)

### Community 90 - "Method Version Locking"
Cohesion: 0.13
Nodes (11): test_missing_method_does_not_change_status(), MethodVersion, Meta, Status, test_a_draft_stays_editable(), test_content_of_a_version_that_is_not_a_draft_does_not_change(), test_even_direct_sql_cannot_change_a_locked_version(), test_no_version_is_ever_deleted() (+3 more)

### Community 91 - "Risk Model & Status"
Cohesion: 0.14
Nodes (9): Risk, Channel, Meta, Status, make_risk(), test_every_old_status_maps_to_a_current_one(), test_old_statuses_move_to_the_lifecycle_of_q15(), _split_part() (+1 more)

### Community 92 - "Vendored JS Helpers"
Cohesion: 0.17
Nodes (13): an, ee(), en(), me(), nt(), P(), r(), rt() (+5 more)

### Community 94 - "Risk Questions & Timeline"
Cohesion: 0.13
Nodes (7): RiskQuestionAnswerView, AnswerForm, Meta, RiskQuestion, Meta, answer_question(), QuestionAnswerView

### Community 95 - "Paths & Impact Details"
Cohesion: 0.12
Nodes (6): ImpactDetailInline, PathInline, ImpactDetail, Meta, Path, Meta

### Community 96 - "SoA Applicability"
Cohesion: 0.14
Nodes (6): ApplicabilityForm, Meta, Applicability, Implementation, Meta, SoaUpdateView

### Community 97 - "Vite & E2E Server"
Cohesion: 0.11
Nodes (11): dist, port, types, @rolldown/plugin-babel@0.2.4, @tailwindcss/vite@4.3.3, vite@8.3.4, @vitejs/plugin-react@6.1.2, @rolldown/plugin-babel (+3 more)

### Community 98 - "Assessment Bridge Tests"
Cohesion: 0.21
Nodes (12): test_the_plan_waits_for_its_rules_then_the_owner_approves_it(), api(), test_a_path_is_added_with_the_b0_table_beside_the_form(), test_a_workgroup_member_sees_the_referral_form(), test_quality_control_runs_through_the_same_views(), test_the_dossier_shows_the_engine_result_and_what_the_user_may_do(), test_the_impact_profile_is_one_page_of_prefixed_forms(), test_the_initiator_form_brings_the_risk_boundary_and_the_a_table() (+4 more)

### Community 99 - "Lifecycle & Assessment Rounds"
Cohesion: 0.14
Nodes (9): assessment_round_start(), round_current_assessments(), all_questions_answered(), approved_current_assessment(), can_perform(), ready_for_assessment(), retirement_evidence(), transitions_from() (+1 more)

### Community 100 - "Control Assessment & Bc"
Cohesion: 0.14
Nodes (5): control_assessment_detail.html (Control Effectiveness Assessment Detail), control_assessment_form.html (Control Effectiveness Assessment Form), ControlAssessmentFormMixin, ControlAssessmentUpdateView, ControlUpdateView

### Community 101 - "Likelihood Path Tests"
Cohesion: 0.21
Nodes (16): add_path(), assessed(), evidence(), grc(), make_control(), path_data(), post_initiator(), rate() (+8 more)

### Community 102 - "Controls & SoA Templates"
Cohesion: 0.14
Nodes (10): soa_summary(), control_detail.html (Control Detail), control_list.html (Control Library), Organizational control mapped to ISO 27001 Annex A, applicability_badge.html (SoA Applicability Badge), control_table.html (control list partial), soa_detail.html (ISO Annex A control SoA page), soa_list.html (Statement of Applicability) (+2 more)

### Community 103 - "Questionnaire Questions"
Cohesion: 0.16
Nodes (7): active_option_count(), QuestionForm, Meta, Question, Kind, Meta, QuestionFormMixin

### Community 104 - "Pending Risk Review Views"
Cohesion: 0.14
Nodes (3): PendingRiskCreateView, ResponseReturnView, ReviewActionMixin

### Community 107 - "Admin Bridge Tests"
Cohesion: 0.21
Nodes (12): api(), pending_dir(), test_a_holiday_is_saved_through_the_django_form(), test_audit_events_keep_the_filters_for_the_excel_export(), test_data_changes_show_what_changed(), test_only_the_system_admin_opens_the_admin_pages(), test_staff_import_cancel_deletes_the_file(), test_staff_import_rejects_a_file_it_cannot_read() (+4 more)

### Community 108 - "Initiator & Assessment Edit"
Cohesion: 0.14
Nodes (4): initiator_form.html (Initiator Factor A Form), AssessmentUpdateView, EditableAssessmentMixin, InitiatorView

### Community 109 - "Questionnaire Start Views"
Cohesion: 0.14
Nodes (5): questionnaires/answer_home.html (answer questionnaires home), response_status.html (response status badge), QuestionCreateView, QuestionnaireCreateView, ResponseStartView

### Community 110 - "Vendored Jalali Datepicker"
Cohesion: 0.13
Nodes (8): gt(), ut(), ae(), dpContainer(), i(), initTime(), u(), Zt()

### Community 111 - "Audit Signals"
Cohesion: 0.14
Nodes (6): AuditConfig, on_login(), on_login_failed(), on_logout(), track_relation(), on_change()

### Community 112 - "Frontend App Tests"
Cohesion: 0.18
Nodes (15): api(), renderApp(), createQueryClient(), risks(), setup(), assessmentDetail(), assessmentInReview(), compareAssessments() (+7 more)

### Community 113 - "Theme & Storage"
Cohesion: 0.20
Nodes (14): toggleCollapsed(), useMediaQuery(), readPreference(), writePreference(), apply(), applyStoredTheme(), Resolved, THEME_COLORS (+6 more)

### Community 114 - "TS Node Config"
Cohesion: 0.12
Nodes (15): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, noUnusedLocals, noUnusedParameters (+7 more)

### Community 115 - "Assessment Comparison"
Cohesion: 0.19
Nodes (10): test_the_comparison_helper_flags_a_method_change(), _a_value(), compare(), dimension_levels(), _dimension_text(), _dimension_value(), profile(), Profile (+2 more)

### Community 116 - "Workflow Transition Views"
Cohesion: 0.17
Nodes (3): TransitionForm, RiskActionMixin, TransitionView

### Community 119 - "Actions Admin"
Cohesion: 0.14
Nodes (4): RiskAcceptanceAdmin, RiskReviewAdmin, TreatmentActionAdmin, TreatmentPlanAdmin

### Community 120 - "Template Formatting Filters"
Cohesion: 0.23
Nodes (6): minutes(), paragraphs(), thousands(), test_minutes_are_shown_as_days_hours_and_minutes(), test_paragraphs_splits_on_blank_lines_and_escapes_html(), test_thousands_groups_digits_and_leaves_empty_values_empty()

### Community 121 - "Frontend Formatting Utils"
Cohesion: 0.23
Nodes (10): daysLeft(), isDeadline(), MONTHS, numbers, safeExternalUrl(), safeNext(), Day, Deadline (+2 more)

### Community 122 - "Methodology Admin Tests"
Cohesion: 0.29
Nodes (10): action_url(), change_url(), test_a_draft_is_not_activated(), test_actions_need_the_admin_panel_and_its_permissions(), test_activation_archives_the_active_version(), test_active_version_is_read_only_and_cannot_be_added_or_deleted(), test_approval_date_after_today_is_shown_on_the_form(), test_approval_page_lists_the_problems_and_then_records_the_letter() (+2 more)

### Community 123 - "Risks Admin"
Cohesion: 0.15
Nodes (6): CoverageAdmin, EvidenceAdmin, RiskAdmin, RiskCategoryAdmin, RiskScenarioAdmin, TagAdmin

### Community 124 - "ESLint Config"
Cohesion: 0.15
Nodes (12): @eslint/js@9.39.5, eslint-plugin-jsx-a11y@6.10.2, eslint-plugin-react-hooks@7.1.1, eslint-plugin-react-refresh@0.5.7, globals@16.5.0, typescript-eslint@8.71.2, @eslint/js, eslint-plugin-jsx-a11y (+4 more)

### Community 125 - "Login & Auth"
Cohesion: 0.18
Nodes (5): LoginForm, LoginView, LoginView, safe_next(), spa_ready()

### Community 126 - "Assessment Result Rules"
Cohesion: 0.27
Nodes (11): Non-normal acceptance (incomplete or low-confidence assessment), risk_treatment.html (risk page treatment and acceptance section), assessment_detail.html (assessment case file), Acceptance authority limits (out of authority / restricted), Escalation precedence rule (ongoing incident, binding prohibition, customer tolerance exceeded), Impact profile (dimensions x stakeholders, I = max valid level), Initiator factor A (rate basis: count, period, denominator, coverage), Likelihood model (L from A x B table) (+3 more)

### Community 127 - "Catalog Admin"
Cohesion: 0.32
Nodes (9): AssetAdmin, CommitmentAdmin, CustomerAdmin, DependencyAdmin, ServiceAdmin, ServiceCustomerInline, SupplierAdmin, register() (+1 more)

### Community 128 - "Catalog View Tests"
Cohesion: 0.29
Nodes (9): grc(), service_data(), test_customer_list_is_open_to_everyone_but_edit_buttons_only_to_editors(), test_duplicate_service_code_is_rejected(), test_form_offers_only_active_units_and_owners_but_keeps_the_current_ones(), test_new_service_is_saved_with_who_created_it_and_opens_its_page(), test_only_grc_and_system_admin_open_the_forms(), test_unit_filter_includes_subunits() (+1 more)

### Community 129 - "Method Version Admin Actions"
Cohesion: 0.32
Nodes (3): MethodVersionAdmin, ApprovalForm, methodversion/change_form.html (admin version object tools)

### Community 130 - "Bootstrap Event Handler (vendored)"
Cohesion: 0.21
Nodes (12): D(), I(), j(), k(), L(), N(), off(), on() (+4 more)

### Community 132 - "My Work API"
Cohesion: 0.31
Nodes (7): acceptance_item(), action_item(), item(), MyWorkView, risk_ref(), sections(), level_rank()

### Community 133 - "Impact Profile Form"
Cohesion: 0.33
Nodes (4): impact_form.html (Impact Profile Form), ImpactProfileView, customer_list.html (Bank List), Service-bank recovery times (RTO, MTPD, RPO)

### Community 134 - "Assessment Workspace & Compare"
Cohesion: 0.20
Nodes (5): risk_assessments.html (Risk Page Assessments Section), workspace.html (Risk Assessment Workspace), AssessmentCandidatesView, AssessmentWorkspaceView, CompareView

### Community 135 - "Likelihood Path Forms"
Cohesion: 0.25
Nodes (3): path_form.html (Likelihood Path Form), PathCreateView, PathFormMixin

### Community 136 - "Schema Check Command"
Cohesion: 0.22
Nodes (3): Command, migration_problems(), schema_problems()

### Community 137 - "Frontend Route Matching"
Cohesion: 0.29
Nodes (9): compile(), compiled, CompiledRoute, isFormRoute(), match(), parse(), toRoute(), RouteEntry (+1 more)

### Community 139 - "Attachments"
Cohesion: 0.22
Nodes (4): _save_letter(), Attachment, Meta, AttachmentUploadView

### Community 140 - "Controls Admin"
Cohesion: 0.20
Nodes (4): ApplicabilityAdmin, ControlAdmin, ControlAssessmentAdmin, IsoControlAdmin

### Community 143 - "Compose Web Service"
Cohesion: 0.20
Nodes (10): condition, db, web, build, depends_on, env_file, image, profiles (+2 more)

### Community 144 - "Compose Monitoring Service"
Cohesion: 0.20
Nodes (10): web, build, command, depends_on, env_file, image, profiles, restart (+2 more)

### Community 145 - "Admin Page Tests"
Cohesion: 0.22
Nodes (8): saved(), auditChangeList(), auditEventList(), holidayList(), staffImportDone(), staffImportDryRun(), staffImportForm(), userList()

### Community 146 - "README Frontend Notes"
Cohesion: 0.25
Nodes (7): login.html (classic Django login form), staff_import.html (HR staff import with dry-run report), spa_missing.html (React build missing notice), API form/page bridge (/api/forms/, /api/pages/), Frontend checks (lint, Vitest + axe, Playwright e2e), React frontend (frontend/, served at /app/), Login redirect to SPA (/app/login/, ?classic=1 fallback)

### Community 148 - "Method Version 1 Migration"
Cohesion: 0.28
Nodes (5): add_initial_history(), create_version_1(), decimal_or_none(), Migration, text()

### Community 149 - "Methodology Test Fixtures"
Cohesion: 0.31
Nodes (4): draft(), recorder(), v1(), yesterday()

### Community 150 - "Workflow Admin"
Cohesion: 0.33
Nodes (4): ChangeRequestAdmin, NoDeleteMixin, RiskQuestionAdmin, StatusTransitionAdmin

### Community 151 - "Frontend NPM Scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, format, lint, preview, test, test:e2e (+1 more)

### Community 152 - "Button & Link Components"
Cohesion: 0.47
Nodes (7): AppLinkProps, buttonClasses(), ButtonSize, ButtonVariant, ClassicLink(), ClassicLinkProps, ConfirmDialogProps

### Community 153 - "Vendored htmx Internals"
Cohesion: 0.39
Nodes (9): A(), je(), Pe(), u(), Ue(), ve(), we(), y() (+1 more)

### Community 154 - "SPA Entry & CSP"
Cohesion: 0.29
Nodes (4): content_security_policy(), index(), SPA HTML Entry (frontend/index.html), Shield-with-Checkmark Favicon

### Community 155 - "Assessment QC Review"
Cohesion: 0.25
Nodes (4): AssessmentReviewInline, AssessmentReview, Action, Meta

### Community 157 - "Impact Profile Dimensions"
Cohesion: 0.29
Nodes (6): C: Obligations & Compliance, D: Data & Integrity, F: Financial (gross loss / approved 12-month revenue), Impact Profile (S/D/F/C/R per stakeholder), R: Reputation & Customer Relationship, S: Service & Continuity (RTO / MTPD)

### Community 158 - "Comparison Trend"
Cohesion: 0.29
Nodes (4): test_text_cells_have_no_direction(), row(), _number(), trend()

### Community 160 - "Compose Healthchecks"
Cohesion: 0.43
Nodes (7): healthcheck, interval, retries, start_period, test, timeout, healthcheck

### Community 161 - "Compose Nginx Proxy"
Cohesion: 0.29
Nodes (7): depends_on, image, ports, profiles, restart, volumes, nginx

### Community 162 - "Methodology API"
Cohesion: 0.53
Nodes (4): _level(), _period(), _scale(), version_detail()

### Community 163 - "Compose Volumes"
Cohesion: 0.33
Nodes (5): services, volumes, media, pgdata, static

### Community 164 - "Compose Database Service"
Cohesion: 0.33
Nodes (6): env_file, image, ports, restart, volumes, db

### Community 178 - "Compose Environment"
Cohesion: 0.50
Nodes (4): ATTACHMENT_X_ACCEL_PREFIX, DATABASE_URL, environment, environment

### Community 180 - "README Overview"
Cohesion: 0.50
Nodes (4): Docker Compose prod profile (db, web, monitoring, nginx), ERM System (Enterprise Risk Management web app), Project structure (config, apps, frontend, templates, docker, docs), Settings modules (base, dev, prod)

## Ambiguous Edges - Review These
- `check_version()` → `methodversion/action.html (admin version action confirm)`  [AMBIGUOUS]
  apps/methodology/templates/admin/methodology/methodversion/action.html · relation: shares_data_with

## Knowledge Gaps
- **36 isolated node(s):** `graphify skill (/graphify trigger)`, `check_schema management command`, `Settings modules (base, dev, prod)`, `Project structure (config, apps, frontend, templates, docker, docs)`, `login.html (classic Django login form)` (+31 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1704 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **88 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Generic Django Form Page Template` connect `Session API & Base Templates` to `View Mixins & Role Guards`, `Frontend Cards & Form Pages`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Are the 124 inferred relationships involving `Role` (e.g. with `UserFilterForm` and `User`) actually correct?**
  _`Role` has 124 INFERRED edges - model-reasoned connections that need verification._
- **What connects `graphify skill (/graphify trigger)`, `check_schema management command`, `Settings modules (base, dev, prod)` to the rest of the system?**
  _36 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Risk Views, Models & Forms` be split into smaller, more focused modules?**
  _Cohesion score 0.017661082878474184 - nodes in this community are weakly interconnected._
- **Why does `FormPageMixin` connect `View Mixins & Role Guards` to `Risk Views, Models & Forms`, `SoA Applicability`, `Pending Risks from Answers`, `Questionnaire Questions`, `Pending Risk Review Views`, `Session API & Base Templates`, `Catalog Views & Forms`, `Risk Evidence & Links`, `Jalali Calendar & Workdays`, `Organization Units`, `Questionnaire Views & Permissions`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Are the 90 inferred relationships involving `Risk` (e.g. with `risk_treatment()` and `record_trigger()`) actually correct?**
  _`Risk` has 90 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `check_version()` and `methodversion/action.html (admin version action confirm)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
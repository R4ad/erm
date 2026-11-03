from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.functional import cached_property
from django.views import View
from django.views.generic import CreateView, DetailView, UpdateView

from apps.assessments.comparison import compare
from apps.assessments.services import decision_assessment
from apps.core.records import record_extras
from apps.core.views import FilteredListView
from apps.risks.models import Risk
from apps.risks.permissions import visible_evidence, visible_risks

from . import acceptance as acc
from . import reassessment as reassess
from .forms import (
    AcceptanceFilterForm,
    AcceptanceForm,
    ActionFilterForm,
    ActionForm,
    MoveForm,
    PlanForm,
    ReassessmentForm,
    RevokeForm,
    SignForm,
)
from .models import AcceptanceSignature, RiskAcceptance, TreatmentAction, TreatmentPlan
from .mywork import my_work
from .permissions import (
    can_add_action,
    can_approve_plan,
    can_edit_action,
    can_edit_plan,
    can_edit_acceptance,
    can_edit_plans,
    is_current_plan,
    visible_acceptances,
    visible_actions,
    visible_plans,
)
from .services import (
    BY_NAME,
    NOTE,
    PlanError,
    approve_plan,
    available_moves,
    can_move,
    containment_due,
    create_plan,
    decision_due,
    pending_actions,
    perform_move,
    plan_creation_problems,
    plan_problems,
    plan_required,
    unverified_dependencies,
)


def my_work_view(request):
    return render(request, "actions/my_work.html", my_work(request.user))


class PlanFormMixin:
    model = TreatmentPlan
    form_class = PlanForm
    template_name = "form_page.html"

    def get_form_kwargs(self):
        return {**super().get_form_kwargs(), "risk": self.risk}


class PlanCreateView(PlanFormMixin, CreateView):
    @cached_property
    def risk(self):
        return get_object_or_404(visible_risks(self.request.user), pk=self.kwargs["risk_pk"])

    def dispatch(self, request, *args, **kwargs):
        if not can_edit_plans(request.user):
            raise PermissionDenied
        problems = plan_creation_problems(self.risk)
        if problems:
            for problem in problems:
                messages.error(request, problem)
            return redirect(self.risk.get_absolute_url() + "#treatment")
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        try:
            self.object = create_plan(form.instance, self.risk, self.request.user)
        except PlanError as error:
            for problem in error.problems:
                messages.error(self.request, problem)
            return redirect(self.risk.get_absolute_url() + "#treatment")
        messages.success(self.request, "طرح مواجهه ثبت شد. حالا اقدام‌ها را اضافه کنید.")
        return redirect(self.object.get_absolute_url())

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"طرح مواجهه برای {self.risk}", cancel_url=self.risk.get_absolute_url(), **kwargs
        )


class PlanUpdateView(PlanFormMixin, UpdateView):
    def get_queryset(self):
        return visible_plans(self.request.user).select_related("risk")

    def get_object(self, queryset=None):
        plan = super().get_object(queryset)
        if not can_edit_plan(self.request.user, plan):
            raise PermissionDenied
        return plan

    @property
    def risk(self):
        return self.object.risk

    def form_valid(self, form):
        form.instance._history_user = self.request.user
        response = super().form_valid(form)
        messages.success(self.request, "تغییرات طرح مواجهه ذخیره شد.")
        return response

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"ویرایش {self.object}", cancel_url=self.object.get_absolute_url(), **kwargs
        )


class PlanDetailView(DetailView):
    template_name = "actions/plan_detail.html"
    context_object_name = "plan"

    def get_queryset(self):
        return visible_plans(self.request.user).select_related(
            "risk__owner", "assessment__decision_level", "target_assessment__decision_level", "owner_approved_by"
        )

    def get_context_data(self, **kwargs):
        plan = self.object
        user = self.request.user
        approvable = can_approve_plan(user, plan)
        return super().get_context_data(
            risk=plan.risk,
            actions=plan.actions.select_related("owner", "assignee", "verifier", "dimension"),
            problems=plan_problems(plan),
            pending=list(pending_actions(plan)),
            plan_required=plan_required(plan.level),
            containment_due=containment_due(plan.risk, plan.level),
            can_edit=can_edit_plan(user, plan),
            can_add_action=can_add_action(user, plan),
            can_approve=approvable,
            acceptances=plan.acceptances.select_related("assessment__decision_level", "follow_up_by"),
            **plan_reassessment_context(plan, user),
            can_add_acceptance=can_edit_plans(user) and is_current_plan(plan) and not acc.creation_problems(plan.risk),
            **record_extras(plan, user),
            **kwargs,
        )


def plan_reassessment_context(plan, user):
    reassessment = getattr(plan, "reassessment", None)
    pending = reassessment is None and not reassess.reassessment_problems(plan)
    context = {"reassessment": reassessment, "can_reassess": pending and can_edit_plans(user)}
    if reassessment or pending:
        context["comparison"] = compare(reassess.comparison_assessments(plan, reassessment))
    return context


class PlanApproveView(View):
    def post(self, request, pk):
        plan = get_object_or_404(visible_plans(request.user).select_related("risk"), pk=pk)
        try:
            approve_plan(plan, request.user)
        except PlanError as error:
            for problem in error.problems:
                messages.error(request, problem)
        else:
            messages.success(request, "طرح مواجهه تأیید شد و اقدام‌هایش مصوب شدند.")
        return redirect(plan.get_absolute_url())


class ActionFormMixin:
    model = TreatmentAction
    form_class = ActionForm
    template_name = "form_page.html"

    def get_form_kwargs(self):
        return {**super().get_form_kwargs(), "plan": self.plan}


class ActionCreateView(ActionFormMixin, CreateView):
    @cached_property
    def plan(self):
        return get_object_or_404(visible_plans(self.request.user).select_related("risk"), pk=self.kwargs["plan_pk"])

    def dispatch(self, request, *args, **kwargs):
        if not can_add_action(request.user, self.plan):
            raise PermissionDenied
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        action = form.instance
        action.plan = self.plan
        action.created_by = self.request.user
        action._history_user = self.request.user
        response = super().form_valid(form)
        note = " و منتظر تأیید مالک ریسک است" if self.plan.is_owner_approved else ""
        messages.success(self.request, f"اقدام {self.object.code} ثبت شد{note}.")
        return response

    def get_success_url(self):
        return self.plan.get_absolute_url()

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"اقدام تازه برای {self.plan}", cancel_url=self.plan.get_absolute_url(), **kwargs
        )


class ActionUpdateView(ActionFormMixin, UpdateView):
    def get_queryset(self):
        return visible_actions(self.request.user).select_related("plan__risk", "plan__assessment")

    def get_object(self, queryset=None):
        action = super().get_object(queryset)
        if not can_edit_action(self.request.user, action):
            raise PermissionDenied
        return action

    @property
    def plan(self):
        return self.object.plan

    def form_valid(self, form):
        form.instance._history_user = self.request.user
        response = super().form_valid(form)
        messages.success(self.request, f"تغییرات اقدام {self.object.code} ذخیره شد.")
        return response

    def get_success_url(self):
        return self.object.get_absolute_url()

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"ویرایش اقدام {self.object.code}", cancel_url=self.object.get_absolute_url(), **kwargs
        )


def action_evidence(user, action):
    """شاهد اجرا از شواهد همان ریسک که کاربر می‌بیند."""
    return visible_evidence(user).filter(risks=action.plan.risk)


class ActionDetailView(DetailView):
    template_name = "actions/action_detail.html"
    context_object_name = "action"

    def get_queryset(self):
        return visible_actions(self.request.user).select_related(
            "plan__risk", "plan__assessment", "owner", "assignee", "verifier", "dimension", "created_by"
        )

    def get_context_data(self, **kwargs):
        action = self.object
        user = self.request.user
        risk = action.plan.risk
        return super().get_context_data(
            plan=action.plan,
            risk=risk,
            risk_visible=visible_risks(user).filter(pk=risk.pk).exists(),
            updates=action.updates.select_related("created_by"),
            moves=available_moves(user, action),
            can_note=can_move(user, action, NOTE),
            move_form=MoveForm(evidence=action_evidence(user, action)),
            evidence=visible_evidence(user).filter(treatment_actions=action),
            waiting_for=unverified_dependencies(action),
            can_edit=can_edit_action(user, action),
            **record_extras(action, user),
            **kwargs,
        )


class ActionMoveView(View):
    def post(self, request, pk):
        action = get_object_or_404(visible_actions(request.user).select_related("plan__risk"), pk=pk)
        name = request.POST.get("move", "")
        if name not in BY_NAME:
            raise PermissionDenied
        form = MoveForm(request.POST, evidence=action_evidence(request.user, action))
        if not form.is_valid():
            for errors in form.errors.values():
                for error in errors:
                    messages.error(request, error)
            return redirect(action.get_absolute_url() + "#progress")
        try:
            perform_move(action, request.user, name, form.cleaned_data["note"], list(form.cleaned_data["evidence"]))
        except PlanError as error:
            for problem in error.problems:
                messages.error(request, problem)
        else:
            messages.success(request, f"اقدام {action.code}: {action.get_status_display()}.")
        return redirect(action.get_absolute_url() + "#progress")


class ActionListView(FilteredListView):
    template_name = "actions/action_list.html"
    context_object_name = "actions"
    filter_form_class = ActionFilterForm

    def get_queryset(self):
        self.queryset = visible_actions(self.request.user).select_related("plan__risk", "owner", "assignee")
        return super().get_queryset()

    def get_filter_form_kwargs(self):
        return {"user": self.request.user}


class AcceptanceFormMixin:
    model = RiskAcceptance
    form_class = AcceptanceForm
    template_name = "form_page.html"

    def get_form_kwargs(self):
        return {**super().get_form_kwargs(), "risk": self.risk, "assessment": self.assessment}


class AcceptanceCreateView(AcceptanceFormMixin, CreateView):
    @cached_property
    def risk(self):
        return get_object_or_404(visible_risks(self.request.user), pk=self.kwargs["risk_pk"])

    @cached_property
    def assessment(self):
        return decision_assessment(self.risk)

    def dispatch(self, request, *args, **kwargs):
        if not can_edit_plans(request.user):
            raise PermissionDenied
        problems = acc.creation_problems(self.risk)
        if problems:
            for problem in problems:
                messages.error(request, problem)
            return redirect(self.risk.get_absolute_url() + "#acceptances")
        return super().dispatch(request, *args, **kwargs)

    def get_initial(self):
        return {"follow_up_by": self.request.user.pk}

    def form_valid(self, form):
        try:
            self.object = acc.create_acceptance(form.instance, self.risk, self.request.user)
        except PlanError as error:
            for problem in error.problems:
                messages.error(self.request, problem)
            return redirect(self.risk.get_absolute_url() + "#acceptances")
        self.object.controls.set(form.cleaned_data["controls"])
        messages.success(
            self.request, f"پذیرش {self.object.code} به‌صورت پیش‌نویس ثبت شد. بعد از بازبینی برای امضا بفرستید."
        )
        return redirect(self.object.get_absolute_url())

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"پذیرش ریسک {self.risk.code} بر اساس {self.assessment.code}",
            cancel_url=self.risk.get_absolute_url() + "#acceptances",
            **kwargs,
        )


class AcceptanceUpdateView(AcceptanceFormMixin, UpdateView):
    def get_queryset(self):
        return visible_acceptances(self.request.user).select_related("risk", "assessment__decision_level")

    def get_object(self, queryset=None):
        acceptance = super().get_object(queryset)
        if not can_edit_acceptance(self.request.user, acceptance):
            raise PermissionDenied
        return acceptance

    @property
    def risk(self):
        return self.object.risk

    @property
    def assessment(self):
        return self.object.assessment

    def form_valid(self, form):
        form.instance._history_user = self.request.user
        response = super().form_valid(form)
        messages.success(self.request, f"تغییرات پذیرش {self.object.code} ذخیره شد.")
        return response

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"ویرایش پذیرش {self.object.code}", cancel_url=self.object.get_absolute_url(), **kwargs
        )


class AcceptanceDetailView(DetailView):
    template_name = "actions/acceptance_detail.html"
    context_object_name = "acceptance"

    def get_queryset(self):
        return visible_acceptances(self.request.user).select_related(
            "risk__owner",
            "risk__org_unit",
            "risk__service",
            "assessment__decision_level",
            "assessment__method_version",
            "plan",
            "renews",
            "follow_up_by",
            "created_by",
            "closed_by",
        )

    def get_context_data(self, **kwargs):
        acceptance = self.object
        user = self.request.user
        risk = acceptance.risk
        signatures = {item.authority: item for item in acceptance.signatures.select_related("created_by", "letter")}
        rows = [
            {
                "authority": authority,
                "label": acc.AUTH(authority).label,
                "reason": reason,
                "signature": signatures.get(authority),
            }
            for authority, reason in acc.authority_reasons(acceptance.assessment, risk)
        ]
        open_ = acceptance.status in acc.OPEN_STATUSES
        context = {
            "risk": risk,
            "assessment": acceptance.assessment,
            "level": acceptance.level,
            "rows": rows,
            "unit_managers": acc.unit_managers(risk)
            if acc.AUTH.UNIT_MANAGER in [row["authority"] for row in rows]
            else [],
            "problems": acc.acceptance_problems(acceptance) if open_ else [],
            "cap": acc.acceptance_cap(acceptance.level, acceptance.start_date),
            "temporary": acc.is_temporary(acceptance.level),
            "non_normal": acc.is_non_normal(acceptance.assessment),
            "sign_forms": [SignForm(authority=authority) for authority in acc.signable_authorities(user, acceptance)],
            "can_edit": can_edit_acceptance(user, acceptance),
            "can_submit": can_edit_acceptance(user, acceptance),
            "can_revoke": acc.can_revoke(user, acceptance),
            "revoke_form": RevokeForm(),
            "renewals": acceptance.renewals.all(),
            **record_extras(acceptance, user),
        }
        if risk.status == Risk.Status.TREATMENT_PLAN and open_:
            context["decision_due"] = decision_due(risk, acceptance.level)
            context["decision_due_passed"] = context["decision_due"] < timezone.localdate()
        return super().get_context_data(**context, **kwargs)


class AcceptanceSubmitView(View):
    def post(self, request, pk):
        acceptance = get_object_or_404(visible_acceptances(request.user).select_related("risk"), pk=pk)
        try:
            acc.submit_acceptance(acceptance, request.user)
        except PlanError as error:
            for problem in error.problems:
                messages.error(request, problem)
        else:
            messages.success(request, f"پذیرش {acceptance.code} برای امضا فرستاده شد.")
        return redirect(acceptance.get_absolute_url())


class AcceptanceSignView(View):
    def post(self, request, pk):
        acceptance = get_object_or_404(visible_acceptances(request.user).select_related("risk"), pk=pk)
        authority = request.POST.get("authority", "")
        if authority not in acc.AUTH.values:
            raise PermissionDenied
        form = SignForm(request.POST, request.FILES, authority=authority)
        decision = request.POST.get("decision", "")
        if decision not in AcceptanceSignature.Decision.values:
            raise PermissionDenied
        if not form.is_valid():
            for errors in form.errors.values():
                for error in errors:
                    messages.error(request, error)
            return redirect(acceptance.get_absolute_url() + "#signatures")
        data = form.cleaned_data
        try:
            acceptance = acc.sign_acceptance(
                acceptance,
                request.user,
                authority,
                decision,
                note=data["note"],
                reference=data.get("reference", ""),
                reference_date=data.get("reference_date"),
                letter=data.get("letter"),
            )
        except PlanError as error:
            for problem in error.problems:
                messages.error(request, problem)
        else:
            if acceptance.status == RiskAcceptance.Status.ACTIVE:
                messages.success(request, f"همه‌ی امضاها کامل شد و پذیرش {acceptance.code} معتبر است.")
            elif acceptance.status == RiskAcceptance.Status.REJECTED:
                messages.success(request, f"پذیرش {acceptance.code} رد شد.")
            else:
                messages.success(request, "امضای شما ثبت شد.")
        return redirect(acceptance.get_absolute_url() + "#signatures")


class AcceptanceRevokeView(View):
    def post(self, request, pk):
        acceptance = get_object_or_404(visible_acceptances(request.user).select_related("risk"), pk=pk)
        form = RevokeForm(request.POST)
        try:
            acc.revoke_acceptance(acceptance, request.user, form.data.get("reason", ""))
        except PlanError as error:
            for problem in error.problems:
                messages.error(request, problem)
        else:
            messages.success(request, f"پذیرش {acceptance.code} لغو شد.")
        return redirect(acceptance.get_absolute_url())


class AcceptanceListView(FilteredListView):
    template_name = "actions/acceptance_list.html"
    context_object_name = "acceptances"
    filter_form_class = AcceptanceFilterForm

    def get_queryset(self):
        self.queryset = visible_acceptances(self.request.user).select_related(
            "risk", "assessment__decision_level", "follow_up_by"
        )
        return super().get_queryset()


class ReassessmentCreateView(CreateView):
    form_class = ReassessmentForm
    template_name = "actions/reassessment_form.html"

    @cached_property
    def plan(self):
        return get_object_or_404(
            visible_plans(self.request.user).select_related("risk", "assessment", "target_assessment"),
            pk=self.kwargs["plan_pk"],
        )

    def dispatch(self, request, *args, **kwargs):
        if not can_edit_plans(request.user):
            raise PermissionDenied
        problems = reassess.reassessment_problems(self.plan)
        if problems:
            for problem in problems:
                messages.error(request, problem)
            return redirect(self.plan.get_absolute_url() + "#reassessment")
        return super().dispatch(request, *args, **kwargs)

    def get_initial(self):
        return {"responsible": self.request.user.pk}

    def form_valid(self, form):
        try:
            reassess.record_reassessment(self.plan, form.instance, self.request.user)
        except PlanError as error:
            for problem in error.problems:
                form.add_error(None, problem)
            return self.form_invalid(form)
        messages.success(self.request, "بازسنجی ثبت شد و طرح بسته شد.")
        return redirect(self.plan.get_absolute_url() + "#reassessment")

    def get_context_data(self, **kwargs):
        plan = self.plan
        return super().get_context_data(
            plan=plan,
            risk=plan.risk,
            title=f"بازسنجی {plan}",
            cancel_url=plan.get_absolute_url(),
            open_actions=plan.actions.exclude(status=TreatmentAction.Status.VERIFIED),
            **compare(reassess.comparison_assessments(plan)),
            **kwargs,
        )

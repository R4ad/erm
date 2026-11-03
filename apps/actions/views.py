from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.functional import cached_property
from django.views import View
from django.views.generic import CreateView, DetailView, UpdateView

from apps.core.records import record_extras
from apps.core.views import FilteredListView
from apps.risks.permissions import visible_evidence, visible_risks

from .forms import ActionFilterForm, ActionForm, MoveForm, PlanForm
from .models import TreatmentAction, TreatmentPlan
from .mywork import my_work
from .permissions import (
    can_add_action,
    can_approve_plan,
    can_edit_action,
    can_edit_plan,
    can_edit_plans,
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
            **record_extras(plan, user),
            **kwargs,
        )


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

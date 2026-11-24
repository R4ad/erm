from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.utils.functional import cached_property
from django.views.generic import CreateView, DetailView, FormView, ListView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.core.views import FilteredListView
from apps.risks.models import Risk
from apps.risks.permissions import REGISTER_EDIT_ROLES, visible_risks

from .forms import AnswerForm, ChangeRequestFilterForm, ChangeRequestForm, DecisionForm, TransitionForm
from .lifecycle import blocking_problems, can_perform, get_transition
from .models import ChangeRequest
from .permissions import answerable_questions, visible_change_requests
from .services import (
    WorkflowError,
    answer_question,
    can_decide,
    change_problems,
    decide_change,
    perform_transition,
    propose_change,
)


class RiskActionMixin:
    """کاری روی یک ریسک؛ ریسکی که کاربر نمی‌بیند ۴۰۴ است."""

    @cached_property
    def risk(self):
        return get_object_or_404(visible_risks(self.request.user), pk=self.kwargs["risk_pk"])


class TransitionView(RiskActionMixin, FormView):
    """انجام یک انتقال جدول چرخه‌ی عمر: شرط‌های برقرارنشده را نشان می‌دهد و فیلدهای لازم همان انتقال را می‌گیرد."""

    form_class = TransitionForm
    template_name = "workflow/transition_form.html"

    @cached_property
    def transition(self):
        transition = get_transition(self.kwargs["name"])
        if transition is None:
            raise Http404
        return transition

    def dispatch(self, request, *args, **kwargs):
        risk, transition = self.risk, self.transition
        if not can_perform(request.user, transition):
            raise PermissionDenied
        if not transition.starts_from(risk.status):
            messages.error(
                request,
                f"«{transition.label}» از وضعیت {transition.source_label} است و ریسک {risk.code} "
                f"الان «{risk.get_status_display()}» است.",
            )
            return redirect(risk.get_absolute_url())
        return super().dispatch(request, *args, **kwargs)

    def get_form_kwargs(self):
        return {**super().get_form_kwargs(), "transition": self.transition}

    def form_valid(self, form):
        data = form.cleaned_data
        try:
            perform_transition(
                self.risk,
                self.transition,
                self.request.user,
                reason=data.get("reason", ""),
                meeting_date=data.get("meeting_date"),
                questions=data.get("questions"),
            )
        except WorkflowError as error:
            for problem in error.problems:
                form.add_error(None, problem)
            return self.form_invalid(form)
        messages.success(self.request, f"ریسک {self.risk.code} به «{self.transition.target_label}» رفت.")
        return redirect(self.risk.get_absolute_url())

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            risk=self.risk,
            transition=self.transition,
            problems=blocking_problems(self.transition, self.risk),
            **kwargs,
        )


class QuestionListView(ListView):
    """پرسش‌های بازی که کاربر باید جواب بدهد؛ بخشی از ماژول «پاسخ به سؤال‌ها»."""

    template_name = "workflow/question_list.html"
    context_object_name = "questions"

    def get_queryset(self):
        return answerable_questions(self.request.user).select_related("risk", "risk__org_unit", "asked_by")


class QuestionAnswerView(UpdateView):
    form_class = AnswerForm
    template_name = "form_page.html"

    def get_queryset(self):
        return answerable_questions(self.request.user).select_related("risk")

    def form_valid(self, form):
        answer_question(self.object, self.request.user, form.cleaned_data["answer"])
        messages.success(self.request, f"جواب پرسش ریسک {self.object.risk.code} ثبت شد.")
        return redirect("workflow:question_list")

    def get_context_data(self, **kwargs):
        question = self.object
        return super().get_context_data(
            title=f"جواب پرسش ریسک {question.risk}",
            intro=question.text,
            cancel_url=reverse("workflow:question_list"),
            **kwargs,
        )


class ChangeRequestCreateView(RoleRequiredMixin, RiskActionMixin, CreateView):
    """پیشنهاد ادغام یا تفکیک با دلیل؛ با تأیید مالک ریسک انجام می‌شود."""

    roles = REGISTER_EDIT_ROLES
    form_class = ChangeRequestForm
    template_name = "form_page.html"

    @cached_property
    def kind(self):
        if self.kwargs["kind"] not in ChangeRequest.Kind.values:
            raise Http404
        return self.kwargs["kind"]

    def dispatch(self, request, *args, **kwargs):
        if not (request.user.is_system_admin or request.user.has_role(*self.roles)):
            raise PermissionDenied
        problems = change_problems(self.risk, self.kind)
        if problems:
            for problem in problems:
                messages.error(request, problem)
            return redirect(self.risk.get_absolute_url())
        return super().dispatch(request, *args, **kwargs)

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["instance"] = ChangeRequest(kind=self.kind, risk=self.risk, proposed_by=self.request.user)
        kwargs["user"] = self.request.user
        return kwargs

    def form_valid(self, form):
        data = form.cleaned_data
        try:
            request = propose_change(
                self.risk,
                self.kind,
                self.request.user,
                data["reason"],
                merge_into=data.get("merge_into"),
                parts=data.get("parts", ""),
            )
        except WorkflowError as error:
            for problem in error.problems:
                form.add_error(None, problem)
            return self.form_invalid(form)
        messages.success(self.request, f"پیشنهاد {request.get_kind_display()} ثبت شد و منتظر تأیید مالک ریسک است.")
        return redirect(self.risk.get_absolute_url())

    def get_context_data(self, **kwargs):
        label = ChangeRequest.Kind(self.kind).label
        return super().get_context_data(
            title=f"پیشنهاد {label} ریسک {self.risk}", cancel_url=self.risk.get_absolute_url(), **kwargs
        )


class ChangeRequestListView(FilteredListView):
    filter_form_class = ChangeRequestFilterForm
    template_name = "workflow/change_request_list.html"
    context_object_name = "requests"

    def get_queryset(self):
        self.queryset = visible_change_requests(self.request.user).select_related(
            "risk", "risk__owner", "merge_into", "proposed_by"
        )
        return super().get_queryset()

    def get_filter_form_kwargs(self):
        return {"user": self.request.user}


class ChangeRequestDetailView(DetailView):
    template_name = "workflow/change_request_detail.html"
    context_object_name = "change"

    def get_queryset(self):
        return visible_change_requests(self.request.user).select_related(
            "risk", "risk__owner", "merge_into", "proposed_by", "decided_by"
        )

    def get_context_data(self, **kwargs):
        change = self.object
        user = self.request.user
        visible = visible_risks(user)
        return super().get_context_data(
            can_decide=can_decide(user, change),
            form=kwargs.pop("form", None) or DecisionForm(),
            parts=visible.filter(split_from=change.risk, created_at__range=(change.created_at, change.decided_at))
            if change.kind == ChangeRequest.Kind.SPLIT and change.status == ChangeRequest.Status.APPROVED
            else [],
            **kwargs,
        )

    def post(self, request, *args, **kwargs):
        self.object = change = self.get_object()
        if not can_decide(request.user, change):
            raise PermissionDenied
        form = DecisionForm(request.POST)
        if form.is_valid():
            approve = form.cleaned_data["decision"] == "approve"
            try:
                created = decide_change(change, request.user, approve, form.cleaned_data["note"])
            except WorkflowError as error:
                for problem in error.problems:
                    form.add_error(None, problem)
            else:
                if not approve:
                    messages.success(request, f"پیشنهاد {change.get_kind_display()} رد شد.")
                elif change.kind == ChangeRequest.Kind.MERGE:
                    messages.success(request, f"ریسک {change.risk.code} در {change.merge_into.code} ادغام و بسته شد.")
                else:
                    codes = "، ".join(part.code for part in created)
                    messages.success(request, f"ریسک {change.risk.code} تفکیک شد؛ ریسک‌های تازه: {codes}.")
                return redirect(change.risk.get_absolute_url())
        return self.render_to_response(self.get_context_data(form=form))

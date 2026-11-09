from django.contrib import messages
from django.contrib.messages.views import SuccessMessageMixin
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse, reverse_lazy
from django.utils.functional import cached_property
from django.views.generic import CreateView, DetailView, FormView, ListView, UpdateView, View

from apps.accounts.permissions import RoleRequiredMixin
from apps.catalog.views import BackToRecordMixin
from apps.core.jalali import to_jalali
from apps.core.views import FilteredListView, FormPageMixin
from apps.risks.views import RiskCreateView
from apps.workflow.permissions import answerable_questions

from .forms import (
    DismissForm,
    OptionFormSet,
    PendingRiskForm,
    QuestionForm,
    QuestionnaireForm,
    ResponseAnswerForm,
    ResponseFilterForm,
    ResponseStartForm,
    ReturnForm,
    active_option_count,
)
from .models import Option, PendingRisk, Question, Questionnaire, Response
from .permissions import (
    MANAGE_ROLES,
    answerable_units,
    can_edit_response,
    can_manage_questionnaires,
    visible_responses,
)
from .services import (
    convert_pending,
    dismiss_pending,
    mark_reviewed,
    missing_required,
    return_response,
    save_answer,
    submit_response,
)


class AnswerHomeView(ListView):
    """ماژول «پاسخ به سؤال‌ها»: پرسشنامه‌های فعال برای شروع پاسخ تازه، و پاسخ‌هایی که کاربر داده یا ثبت کرده."""

    template_name = "questionnaires/answer_home.html"
    context_object_name = "questionnaires"

    def get_queryset(self):
        return Questionnaire.objects.filter(is_active=True, is_structured=True)

    def get_context_data(self, **kwargs):
        user = self.request.user
        mine = Response.objects.filter(Q(respondent=user) | Q(recorded_by=user))
        return super().get_context_data(
            my_responses=mine.select_related("questionnaire", "org_unit", "service", "respondent"),
            can_answer=answerable_units(user).exists(),
            # پرسش‌هایی که عضو GRC برای ارزیابی ریسک‌های واحد طرح کرده است (قدم ۱۴).
            risk_question_count=answerable_questions(user).count(),
            **kwargs,
        )


class QuestionnaireListView(ListView):
    """فهرست همه‌ی پرسشنامه‌ها برای تعریف و ویرایش. سؤال‌ها محرمانه نیستند، پس همه می‌بینند."""

    template_name = "questionnaires/questionnaire_list.html"
    context_object_name = "questionnaires"

    def get_queryset(self):
        return Questionnaire.objects.annotate(
            question_count=Count("questions", filter=Q(questions__is_active=True), distinct=True),
            response_count=Count("responses", distinct=True),
        )

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_manage_questionnaires(self.request.user), **kwargs)


class QuestionnaireDetailView(DetailView):
    model = Questionnaire
    template_name = "questionnaires/questionnaire_detail.html"
    context_object_name = "questionnaire"

    def get_context_data(self, **kwargs):
        questions = self.object.questions.prefetch_related("options__scenario", "options__category")
        return super().get_context_data(
            questions=questions, can_edit=can_manage_questionnaires(self.request.user), **kwargs
        )


class QuestionnaireFormMixin(RoleRequiredMixin, SuccessMessageMixin, BackToRecordMixin, FormPageMixin):
    roles = MANAGE_ROLES
    model = Questionnaire
    form_class = QuestionnaireForm
    success_url = reverse_lazy("questionnaires:questionnaire_list")


class QuestionnaireCreateView(QuestionnaireFormMixin, CreateView):
    success_message = "پرسشنامه‌ی «%(title)s» ثبت شد. حالا سؤال‌هایش را اضافه کنید."


class QuestionnaireUpdateView(QuestionnaireFormMixin, UpdateView):
    success_message = "تغییرات پرسشنامه‌ی «%(title)s» ذخیره شد."


class QuestionFormMixin(RoleRequiredMixin, FormPageMixin):
    """سؤال و گزینه‌هایش در یک صفحه: فرم سؤال و formset گزینه‌ها با هم ذخیره می‌شوند."""

    roles = MANAGE_ROLES
    model = Question
    form_class = QuestionForm
    template_name = "questionnaires/question_form.html"

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        if not self.object:
            kwargs["instance"] = Question(questionnaire=self.questionnaire)
        return kwargs

    def get_formset(self):
        data = self.request.POST if self.request.method == "POST" else None
        return OptionFormSet(data, instance=self.object or Question(), prefix="options")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.setdefault("formset", self.get_formset())
        context["cancel_url"] = self.questionnaire.get_absolute_url()
        context["title"] = f"{context['title']} در «{self.questionnaire}»"
        return context

    def post(self, request, *args, **kwargs):
        self.object = self.get_object() if "pk" in kwargs else None
        form = self.get_form()
        formset = self.get_formset()
        if form.is_valid() and formset.is_valid():
            kind = form.cleaned_data["kind"]
            needs_choices = kind in (Question.Kind.SINGLE, Question.Kind.MULTIPLE)
            if needs_choices and active_option_count(formset) < 2:
                form.add_error(None, "سؤال گزینه‌ای دست‌کم دو گزینه‌ی فعال می‌خواهد.")
            else:
                return self.save(form, formset)
        return self.render_to_response(self.get_context_data(form=form, formset=formset))

    @transaction.atomic
    def save(self, form, formset):
        question = form.save(commit=False)
        question.questionnaire = self.questionnaire
        question.save()
        if question.kind == Question.Kind.YES_NO and not question.options.exists():
            # دو گزینه‌ی ثابت؛ اگر در همین فرم پر شده باشند، همان‌ها ذخیره می‌شوند.
            if active_option_count(formset) == 0:
                Option.objects.create(question=question, order=1, text="بله")
                Option.objects.create(question=question, order=2, text="خیر")
        if question.has_options:
            formset.instance = question
            formset.save()
        messages.success(self.request, f"سؤال «{question.text[:60]}» ذخیره شد.")
        return redirect(self.questionnaire.get_absolute_url())


class QuestionCreateView(QuestionFormMixin, CreateView):
    @cached_property
    def questionnaire(self):
        return get_object_or_404(Questionnaire, pk=self.kwargs["questionnaire_pk"])

    def get_initial(self):
        last = self.questionnaire.questions.order_by("-order").first()
        return {"order": (last.order + 1) if last else 1}


class QuestionUpdateView(QuestionFormMixin, UpdateView):
    @cached_property
    def questionnaire(self):
        return self.object.questionnaire


class ResponseStartView(CreateView):
    """شروع پاسخ تازه به یک پرسشنامه‌ی فعال: مدیر واحد برای واحد خودش، عضو GRC برای ثبت مصاحبه به نام یک مدیر."""

    model = Response
    form_class = ResponseStartForm
    template_name = "form_page.html"

    @cached_property
    def questionnaire(self):
        return get_object_or_404(Questionnaire, pk=self.kwargs["questionnaire_pk"], is_active=True)

    def dispatch(self, request, *args, **kwargs):
        if not answerable_units(request.user).exists():
            raise PermissionDenied
        return super().dispatch(request, *args, **kwargs)

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["user"] = self.request.user
        kwargs["instance"] = Response(questionnaire=self.questionnaire)
        return kwargs

    def form_valid(self, form):
        response = form.instance
        response.recorded_by = self.request.user
        if not response.respondent_id:
            response.respondent = self.request.user
        is_interview = response.respondent_id != self.request.user.pk
        response.channel = Response.Channel.INTERVIEW if is_interview else Response.Channel.QUESTIONNAIRE
        self.object = form.save()
        return redirect("questionnaires:response_answer", pk=self.object.pk)

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"پاسخ تازه به «{self.questionnaire}»",
            cancel_url=reverse("questionnaires:answer_home"),
            **kwargs,
        )


class ResponseListView(FilteredListView):
    """پاسخ‌هایی که کاربر می‌بیند؛ صف بررسی عضو GRC با فیلتر «ارسال‌شده»."""

    filter_form_class = ResponseFilterForm
    template_name = "questionnaires/response_list.html"
    context_object_name = "responses"

    def get_queryset(self):
        pending = Count("pending_risks", filter=Q(pending_risks__status=PendingRisk.Status.PENDING))
        self.queryset = (
            visible_responses(self.request.user)
            .select_related("questionnaire", "org_unit", "service", "respondent")
            .annotate(pending_count=pending)
        )
        return super().get_queryset().order_by("-submitted_at", "-created_at")


class ResponseDetailView(DetailView):
    template_name = "questionnaires/response_detail.html"
    context_object_name = "response"

    def get_queryset(self):
        return visible_responses(self.request.user).select_related(
            "questionnaire", "org_unit", "service", "respondent", "recorded_by", "reviewed_by"
        )

    def get_context_data(self, **kwargs):
        response = self.object
        user = self.request.user
        answers = response.answers.select_related("question").prefetch_related("options")
        can_review = can_manage_questionnaires(user)
        pending = response.pending_risks.select_related("scenario", "category", "risk", "duplicate_of")
        return super().get_context_data(
            answers=answers,
            pending_risks=pending,
            can_edit=can_edit_response(user, response),
            can_review=can_review and response.status == Response.Status.SUBMITTED,
            can_decide=can_review,
            undecided=any(item.is_pending for item in pending),
            **kwargs,
        )


class ResponseAnswerView(UpdateView):
    """پر کردن پاسخ. «ذخیره» پیش‌نویس را نگه می‌دارد و «ارسال» آن را بعد از چک سؤال‌های اجباری به صف GRC می‌فرستد."""

    form_class = ResponseAnswerForm
    template_name = "questionnaires/response_answer.html"
    context_object_name = "response"

    def dispatch(self, request, *args, **kwargs):
        response = get_object_or_404(visible_responses(request.user), pk=kwargs["pk"])
        if response.questionnaire.is_structured:
            if not can_edit_response(request.user, response):
                raise PermissionDenied
            return redirect(f"/app/responses/{response.pk}")
        return super().dispatch(request, *args, **kwargs)

    def get_queryset(self):
        return visible_responses(self.request.user).select_related("questionnaire", "org_unit", "service")

    def get_object(self, queryset=None):
        response = super().get_object(queryset)
        if not can_edit_response(self.request.user, response):
            raise PermissionDenied
        return response

    @transaction.atomic
    def form_valid(self, form):
        response = form.save()
        for question, value in form.answer_values():
            save_answer(response, question, value)
        if "submit" not in self.request.POST:
            messages.success(self.request, "پاسخ ذخیره شد. هر وقت کامل شد، «ارسال» را بزنید.")
            return redirect("questionnaires:response_answer", pk=response.pk)
        missing = missing_required(response)
        if missing:
            for question in missing:
                form.add_error(form.question_field_name(question), "این سؤال اجباری است.")
            messages.warning(self.request, "جواب‌ها ذخیره شد، ولی پاسخ بدون سؤال‌های اجباری ارسال نمی‌شود.")
            return self.render_to_response(self.get_context_data(form=form))
        submit_response(response)
        count = response.pending_risks.filter(status=PendingRisk.Status.PENDING).count()
        messages.success(self.request, f"پاسخ برای بررسی عضو GRC ارسال شد. ریسک در انتظار: {count}")
        return redirect(response.get_absolute_url())


class ReviewActionMixin(RoleRequiredMixin):
    """کارهای عضو GRC روی پاسخ ارسال‌شده."""

    roles = MANAGE_ROLES

    @cached_property
    def response(self):
        return get_object_or_404(visible_responses(self.request.user), pk=self.kwargs["pk"])

    def check_submitted(self):
        if self.response.status != Response.Status.SUBMITTED:
            messages.error(self.request, "این کار فقط روی پاسخ ارسال‌شده انجام می‌شود.")
            return redirect(self.response.get_absolute_url())
        return None


class ResponseReturnView(ReviewActionMixin, FormView):
    form_class = ReturnForm
    template_name = "form_page.html"

    def get(self, request, *args, **kwargs):
        return self.check_submitted() or super().get(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return self.check_submitted() or super().post(request, *args, **kwargs)

    def form_valid(self, form):
        return_response(self.response, form.cleaned_data["question"])
        messages.success(self.request, f"پاسخ برگشت داده شد؛ مهلت جواب تا {to_jalali(self.response.return_due)}.")
        return redirect(self.response.get_absolute_url())

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"برگشت پاسخ «{self.response}»", cancel_url=self.response.get_absolute_url(), **kwargs
        )


class ResponseMarkReviewedView(ReviewActionMixin, View):
    def post(self, request, *args, **kwargs):
        blocked = self.check_submitted()
        if blocked:
            return blocked
        if self.response.pending_risks.filter(status=PendingRisk.Status.PENDING).exists():
            messages.error(request, "اول همه‌ی ریسک‌های در انتظار این پاسخ را ثبت کنید یا کنار بگذارید.")
        else:
            mark_reviewed(self.response, request.user)
            messages.success(request, "بررسی این پاسخ تمام شد.")
        return redirect(self.response.get_absolute_url())


class PendingRiskCreateView(ReviewActionMixin, SuccessMessageMixin, FormPageMixin, CreateView):
    """عضو GRC از جواب متنی یا قلم‌های ثابت، دستی «ریسک در انتظار» می‌سازد."""

    model = PendingRisk
    form_class = PendingRiskForm
    success_message = "ریسک در انتظار ساخته شد."

    def get(self, request, *args, **kwargs):
        return self.check_submitted() or super().get(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return self.check_submitted() or super().post(request, *args, **kwargs)

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["instance"] = PendingRisk(response=self.response, source=PendingRisk.Source.MANUAL)
        return kwargs

    def get_success_url(self):
        return self.response.get_absolute_url()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = f"ریسک در انتظار تازه از پاسخ «{self.response}»"
        context["cancel_url"] = self.response.get_absolute_url()
        return context


class PendingDecisionMixin(RoleRequiredMixin):
    roles = MANAGE_ROLES

    @cached_property
    def pending(self):
        return get_object_or_404(
            PendingRisk.objects.select_related("response__org_unit", "response__service", "scenario", "category"),
            pk=self.kwargs["pk"],
            response__in=visible_responses(self.request.user),
        )

    def check_pending(self):
        if not self.pending.is_pending:
            messages.error(self.request, "تکلیف این ریسک در انتظار پیش‌تر تعیین شده است.")
            return redirect(self.pending.response.get_absolute_url())
        return None


class PendingRiskConvertView(PendingDecisionMixin, RiskCreateView):
    """تبدیل ریسک در انتظار به ریسک «ثبت‌شده در رجیستر»، با داده‌های پاسخ که از پیش پر شده‌اند."""

    def get(self, request, *args, **kwargs):
        return self.check_pending() or super().get(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return self.check_pending() or super().post(request, *args, **kwargs)

    def get_initial(self):
        pending = self.pending
        response = pending.response
        first_line = pending.description.splitlines()[0] if pending.description else ""
        initial = {
            "title": pending.scenario.title if pending.scenario else first_line[:300],
            "description": pending.description,
            "scenario": pending.scenario,
            "category": pending.category or (pending.scenario.category if pending.scenario else None),
            "service": response.service,
            "org_unit": response.org_unit,
            "channel": response.channel,
        }
        return {key: value for key, value in initial.items() if value}

    @transaction.atomic
    def form_valid(self, form):
        result = super().form_valid(form)
        convert_pending(self.pending, self.object, self.request.user)
        return result

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = "ثبت ریسک در انتظار در رجیستر"
        context["cancel_url"] = self.pending.response.get_absolute_url()
        return context


class PendingRiskDismissView(PendingDecisionMixin, FormPageMixin, UpdateView):
    model = PendingRisk
    form_class = DismissForm

    def get_object(self, queryset=None):
        return self.pending

    def get(self, request, *args, **kwargs):
        return self.check_pending() or super().get(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return self.check_pending() or super().post(request, *args, **kwargs)

    def form_valid(self, form):
        data = form.cleaned_data
        dismiss_pending(self.pending, self.request.user, data["dismiss_reason"], data["duplicate_of"])
        messages.success(self.request, "ریسک در انتظار کنار گذاشته شد.")
        return redirect(self.pending.response.get_absolute_url())

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = "کنار گذاشتن ریسک در انتظار"
        context["cancel_url"] = self.pending.response.get_absolute_url()
        return context

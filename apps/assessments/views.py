from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404, redirect
from django.utils.functional import cached_property
from django.views import View
from django.views.generic import CreateView, DetailView, TemplateView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.methodology.models import MethodParameter
from apps.risks.models import Evidence
from apps.risks.permissions import visible_risks

from .comparison import compare
from .forms import AssessmentForm, ImpactDetailForm, InitiatorForm, PathForm, ReferralForm, ReviewForm
from .models import AssessmentReview, Path
from .results import outcome, submission_problems
from .review import (
    ReviewError,
    can_decide_referral,
    can_review,
    can_submit,
    decide_referral,
    review,
    submit,
)
from .permissions import ASSESSMENT_EDIT_ROLES, can_edit_assessment, visible_assessments
from .services import (
    AssessmentError,
    create_assessment,
    creation_problems,
    default_horizon,
    impact_scales,
    impact_summary,
    initiator_scale,
    likelihood_summary,
    parameter,
    stakeholder_facts,
    stakeholders,
)


class AssessmentCreateView(RoleRequiredMixin, CreateView):
    """ارزیابی تازه برای یک ریسک، با نسخه‌ی روش فعال. بعد از ثبت، پروفایل پیامد باز می‌شود."""

    roles = ASSESSMENT_EDIT_ROLES
    form_class = AssessmentForm
    template_name = "form_page.html"

    @cached_property
    def risk(self):
        return get_object_or_404(visible_risks(self.request.user), pk=self.kwargs["risk_pk"])

    def dispatch(self, request, *args, **kwargs):
        if not (request.user.is_system_admin or request.user.has_role(*self.roles)):
            raise PermissionDenied
        problems = creation_problems(self.risk)
        if problems:
            for problem in problems:
                messages.error(request, problem)
            return redirect(self.risk.get_absolute_url())
        return super().dispatch(request, *args, **kwargs)

    def get_form_kwargs(self):
        return {**super().get_form_kwargs(), "risk": self.risk}

    def get_initial(self):
        return {"horizon_months": default_horizon()}

    def form_valid(self, form):
        data = form.cleaned_data
        try:
            assessment = create_assessment(
                self.risk,
                self.request.user,
                data["kind"],
                horizon_months=data["horizon_months"],
                horizon_rationale=data.get("horizon_rationale", ""),
                target_due=data.get("target_due"),
                meeting_date=data.get("meeting_date"),
                assumptions=data.get("assumptions", ""),
            )
        except AssessmentError as error:
            for problem in error.problems:
                form.add_error(None, problem)
            return self.form_invalid(form)
        messages.success(self.request, f"ارزیابی {assessment.code} ثبت شد؛ حالا پروفایل پیامد را کامل کنید.")
        return redirect("assessments:impact_profile", assessment.pk)

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"ارزیابی تازه برای {self.risk}", cancel_url=self.risk.get_absolute_url(), **kwargs
        )


class AssessmentDetailView(DetailView):
    template_name = "assessments/assessment_detail.html"
    context_object_name = "assessment"

    def get_queryset(self):
        return visible_assessments(self.request.user).select_related("risk", "method_version", "created_by")

    def get_context_data(self, **kwargs):
        assessment = self.object
        user = self.request.user
        submit_allowed = can_submit(user, assessment)
        return super().get_context_data(
            summary=impact_summary(assessment),
            likelihood=likelihood_summary(assessment),
            outcome=outcome(assessment),
            can_edit=can_edit_assessment(user, assessment),
            can_submit=submit_allowed,
            submission_problems=submission_problems(assessment) if submit_allowed else [],
            can_review=can_review(user, assessment),
            can_decide_referral=can_decide_referral(user, assessment),
            reviews=assessment.reviews.select_related("created_by"),
            review_form=ReviewForm(),
            referral_form=ReferralForm(),
            **kwargs,
        )


class ReviewActionView(View):
    """کارهای کنترل کیفیت. هر ایراد به صورت پیام برمی‌گردد و صفحه‌ی ارزیابی دوباره باز می‌شود."""

    def post(self, request, pk):
        assessment = get_object_or_404(
            visible_assessments(request.user).select_related("risk", "method_version"), pk=pk
        )
        try:
            message = self.perform(assessment, request)
        except ReviewError as error:
            for problem in error.problems:
                messages.error(request, problem)
        else:
            messages.success(request, message)
        return redirect(f"{assessment.get_absolute_url()}#review")


class SubmitView(ReviewActionView):
    def perform(self, assessment, request):
        if not can_submit(request.user, assessment):
            raise PermissionDenied
        submit(assessment, request.user, request.POST.get("notes", ""))
        return f"ارزیابی {assessment.code} برای کنترل کیفیت فرستاده شد."


class ReviewView(ReviewActionView):
    def perform(self, assessment, request):
        if not can_review(request.user, assessment):
            raise PermissionDenied
        form = ReviewForm(request.POST)
        form.is_valid()
        action = request.POST.get("action", "")
        review(assessment, request.user, action, form.cleaned_data.get("notes", ""))
        return f"ارزیابی {assessment.code}: {AssessmentReview.Action(action).label} ثبت شد."


class ReferralView(ReviewActionView):
    def perform(self, assessment, request):
        if not can_decide_referral(request.user, assessment):
            raise PermissionDenied
        form = ReferralForm(request.POST)
        if not form.is_valid():
            raise ReviewError([error for errors in form.errors.values() for error in errors])
        action = request.POST.get("action", "")
        data = form.cleaned_data
        decide_referral(assessment, request.user, action, data.get("notes", ""), data.get("meeting_date"))
        return f"تصمیم کارگروه برای ارزیابی {assessment.code} ثبت شد."


class EditableAssessmentMixin:
    """ارزیابی‌ای که کاربر می‌بیند و اجازه‌ی ویرایشش را دارد؛ وگرنه ۴۰۴ یا ۴۰۳."""

    def get_assessment(self, pk=None):
        assessment = get_object_or_404(
            visible_assessments(self.request.user).select_related("risk", "method_version"),
            pk=self.kwargs["pk"] if pk is None else pk,
        )
        if not can_edit_assessment(self.request.user, assessment):
            raise PermissionDenied
        return assessment


class AssessmentUpdateView(EditableAssessmentMixin, UpdateView):
    form_class = AssessmentForm
    template_name = "form_page.html"

    def get_object(self, queryset=None):
        return self.get_assessment()

    def get_form_kwargs(self):
        return {**super().get_form_kwargs(), "risk": self.object.risk}

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, f"تغییرات ارزیابی {self.object.code} ذخیره شد.")
        return response

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"ویرایش ارزیابی {self.object}", cancel_url=self.object.get_absolute_url(), **kwargs
        )


class ImpactProfileView(EditableAssessmentMixin, TemplateView):
    """پروفایل پیامد: برای داتین و هر بانک متأثر، سطح هر بُعد با دلیل و شاهد (بخش ۸ و جواب س۵۵). سامانه سطح S را از
    مدت اختلال و RTO و MTPD، و سطح F را از درصد زیان پیشنهاد می‌دهد و تصمیم با ارزیاب است (جواب س۵۶)."""

    template_name = "assessments/impact_form.html"

    @cached_property
    def assessment(self):
        return self.get_assessment()

    def build_groups(self, data=None):
        assessment = self.assessment
        version = assessment.method_version
        fraction = parameter(version, MethodParameter.Key.S_RTO_FRACTION)
        evidence = Evidence.objects.filter(risks=assessment.risk).order_by("code")
        existing = {(impact.customer_id, impact.scale_id): impact for impact in assessment.impacts.all()}
        scales = impact_scales(assessment)
        groups = []
        for customer in stakeholders(assessment):
            facts = stakeholder_facts(assessment, customer)
            forms = [
                ImpactDetailForm(
                    data,
                    prefix=f"{customer.pk if customer else 'datin'}-{scale.code}",
                    scale=scale,
                    customer=customer,
                    facts=facts,
                    fraction=fraction,
                    evidence=evidence,
                    instance=existing.get((customer.pk if customer else None, scale.pk)),
                )
                for scale in scales
            ]
            groups.append({"customer": customer, "facts": facts, "forms": forms})
        return groups

    def get_context_data(self, groups=None, **kwargs):
        assessment = self.assessment
        version = assessment.method_version
        return super().get_context_data(
            assessment=assessment,
            groups=groups or self.build_groups(),
            provisional_level=parameter(version, MethodParameter.Key.S_PROVISIONAL_LEVEL),
            **kwargs,
        )

    def post(self, request, *args, **kwargs):
        groups = self.build_groups(request.POST)
        forms = [form for group in groups for form in group["forms"]]
        # همه‌ی فرم‌ها اعتبارسنجی می‌شوند، نه فقط تا اولین ایراد، تا پیشنهاد و ایراد هر خانه نشان داده شود.
        valid = [form.is_valid() for form in forms]
        if not all(valid):
            messages.error(request, "بعضی خانه‌ها ایراد دارند؛ پیام زیر هر خانه را ببینید.")
            return self.render_to_response(self.get_context_data(groups=groups))
        with transaction.atomic():
            for form in forms:
                form.save(self.assessment)
        messages.success(request, f"پروفایل پیامد ارزیابی {self.assessment.code} ذخیره شد.")
        return redirect(self.assessment.get_absolute_url())


def evidence_choices(risk, current=()):
    """شواهد این ریسک، به‌اضافه‌ی شاهدی که قبلاً انتخاب شده و بعداً از ریسک جدا شده، تا بی‌صدا حذف نشود."""
    return Evidence.objects.filter(Q(risks=risk) | Q(pk__in=[item.pk for item in current])).distinct().order_by("code")


class InitiatorView(EditableAssessmentMixin, UpdateView):
    """عامل آغازگر (بخش ۱۴): تعریف آغازگر و واحد شمارش از ریسک، و مسیر و داده و سطح A در همین ارزیابی."""

    form_class = InitiatorForm
    template_name = "assessments/initiator_form.html"

    def get_object(self, queryset=None):
        return self.get_assessment()

    def get_form_kwargs(self):
        current = list(self.object.a_evidence.all()) if self.object.pk else []
        return {**super().get_form_kwargs(), "evidence": evidence_choices(self.object.risk, current)}

    def form_valid(self, form):
        form.save()
        messages.success(self.request, f"عامل آغازگر ارزیابی {self.object.code} ذخیره شد.")
        return redirect(f"{self.object.get_absolute_url()}#likelihood")

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            assessment=self.object, risk=self.object.risk, scale=initiator_scale(self.object.method_version), **kwargs
        )


class PathFormMixin(EditableAssessmentMixin):
    form_class = PathForm
    template_name = "assessments/path_form.html"

    def get_form_kwargs(self):
        current = list(self.object.evidence.all()) if self.object else []
        return {
            **super().get_form_kwargs(),
            "assessment": self.assessment,
            "evidence": evidence_choices(self.assessment.risk, current),
        }

    def form_valid(self, form):
        path = form.save()
        messages.success(self.request, f"مسیر «{path.name}» ذخیره شد.")
        return redirect(path.get_absolute_url())

    def get_context_data(self, **kwargs):
        version = self.assessment.method_version
        return super().get_context_data(
            assessment=self.assessment,
            b0_scale=version.scales.prefetch_related("levels").get(code="B0"),
            bc_rules=version.bc_rules.all(),
            cancel_url=f"{self.assessment.get_absolute_url()}#likelihood",
            **kwargs,
        )


class PathCreateView(PathFormMixin, CreateView):
    @cached_property
    def assessment(self):
        return self.get_assessment()

    def dispatch(self, request, *args, **kwargs):
        self.assessment  # دسترسی پیش از هر کاری بررسی می‌شود
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        return super().get_context_data(title=f"مسیر تازه برای {self.assessment}", **kwargs)


class EditablePathMixin(PathFormMixin):
    """مسیری که ارزیابی‌اش را کاربر می‌بیند و ویرایش می‌کند."""

    def get_object(self, queryset=None):
        path = get_object_or_404(Path, pk=self.kwargs["pk"])
        self.assessment = self.get_assessment(path.assessment_id)
        return path


class PathUpdateView(EditablePathMixin, UpdateView):
    def get_context_data(self, **kwargs):
        return super().get_context_data(title=f"ویرایش مسیر «{self.object.name}»", **kwargs)


class PathDeleteView(EditablePathMixin, View):
    """مسیر پیش‌نویس حذف می‌شود و حذفش در تاریخچه می‌ماند."""

    def post(self, request, *args, **kwargs):
        path = self.get_object()
        name = path.name
        path.delete()
        messages.success(request, f"مسیر «{name}» حذف شد.")
        return redirect(f"{self.assessment.get_absolute_url()}#likelihood")


class CompareView(TemplateView):
    """مقایسه‌ی دو تا چهار ارزیابی یک ریسک. با ?ids=12,15,13 به همان ترتیب، و از فرم صفحه‌ی ریسک (?id=12&id=15) به
    ترتیب ثبت تا قدیمی‌ترین ستون اول و مبنای جهت تغییر باشد."""

    template_name = "assessments/compare.html"

    def get_context_data(self, **kwargs):
        picked = self.request.GET.getlist("id")
        raw = picked or self.request.GET.get("ids", "").split(",")
        try:
            ids = list(dict.fromkeys(int(item) for item in raw if item.strip()))
        except ValueError:
            raise Http404 from None
        if picked:
            ids.sort()
        found = {
            item.pk: item
            for item in visible_assessments(self.request.user)
            .filter(pk__in=ids)
            .select_related("risk", "method_version", "decision_level", "base_level")
        }
        if not ids or len(found) != len(ids) or len({item.risk_id for item in found.values()}) != 1:
            raise Http404
        assessments = [found[pk] for pk in ids]
        risk = assessments[0].risk
        if not 2 <= len(ids) <= 4:
            return super().get_context_data(risk=risk, error="دو تا چهار ارزیابی را برای مقایسه انتخاب کنید.", **kwargs)
        return super().get_context_data(risk=risk, **compare(assessments), **kwargs)

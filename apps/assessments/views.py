from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect
from django.utils.functional import cached_property
from django.views.generic import CreateView, DetailView, TemplateView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.methodology.models import MethodParameter
from apps.risks.models import Evidence
from apps.risks.permissions import visible_risks

from .forms import AssessmentForm, ImpactDetailForm
from .permissions import ASSESSMENT_EDIT_ROLES, can_edit_assessment, visible_assessments
from .services import (
    AssessmentError,
    create_assessment,
    creation_problems,
    default_horizon,
    impact_scales,
    impact_summary,
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
        return super().get_context_data(
            summary=impact_summary(assessment),
            can_edit=can_edit_assessment(self.request.user, assessment),
            **kwargs,
        )


class EditableAssessmentMixin:
    """ارزیابی‌ای که کاربر می‌بیند و اجازه‌ی ویرایشش را دارد؛ وگرنه ۴۰۴ یا ۴۰۳."""

    def get_assessment(self):
        assessment = get_object_or_404(
            visible_assessments(self.request.user).select_related("risk", "method_version"), pk=self.kwargs["pk"]
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

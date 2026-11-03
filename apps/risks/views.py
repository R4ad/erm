from django.contrib import messages
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse, reverse_lazy
from django.utils.functional import cached_property
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.generic import CreateView, DetailView, ListView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.catalog.permissions import visible_services
from apps.catalog.views import BackToRecordMixin
from apps.core.views import FilteredListView, FormPageMixin

from .forms import (
    CoverageFilterForm,
    CoverageForm,
    ExternalLinkForm,
    RiskCategoryForm,
    RiskFilterForm,
    RiskForm,
    RiskScenarioForm,
    ScenarioFilterForm,
)
from .models import Coverage, ExternalLink, Risk, RiskCategory, RiskScenario
from .permissions import (
    REGISTER_EDIT_ROLES,
    CATEGORY_EDIT_ROLES,
    COVERAGE_EDIT_ROLES,
    can_edit_register,
    can_edit_categories,
    can_edit_coverage,
    visible_risks,
)
from .services import (
    active_categories,
    active_risks,
    coverage_rows,
    critical_coverage,
    mark_covered_by_risk,
    save_coverage,
    status_counts,
)


class CoverageView(FilteredListView):
    """جدول پوشش جهان ریسک: یک سطر برای هر خدمت فعالی که کاربر می‌بیند و یک ستون برای هر دسته‌ی فعال."""

    filter_form_class = CoverageFilterForm
    template_name = "risks/coverage.html"
    context_object_name = "services"

    def get_queryset(self):
        self.queryset = self.base_services().select_related("org_unit")
        # فیلتر «کامل» با annotate گروه‌بندی می‌کند و Django در کوئری گروه‌بندی‌شده ترتیب پیش‌فرض مدل را نمی‌گذارد.
        return super().get_queryset().order_by("code")

    def base_services(self):
        # خدمت غیرفعال فقط سابقه است و در جهان ریسک دوره نمی‌آید.
        return visible_services(self.request.user).filter(is_active=True)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        categories = active_categories()
        services = self.base_services()
        context.update(
            categories=categories,
            rows=coverage_rows(context["services"], categories, visible_risks(self.request.user)),
            critical=critical_coverage(services, categories),
            counts=status_counts(services, categories),
            can_edit=can_edit_coverage(self.request.user),
        )
        return context


class CoverageUpdateView(RoleRequiredMixin, UpdateView):
    """ثبت وضعیت یک خانه‌ی «خدمت × دسته». خانه‌ای که ردیف ندارد با همین صفحه ساخته می‌شود."""

    roles = COVERAGE_EDIT_ROLES
    form_class = CoverageForm
    template_name = "risks/coverage_form.html"

    def get_object(self, queryset=None):
        service = get_object_or_404(
            visible_services(self.request.user).filter(is_active=True), pk=self.kwargs["service_pk"]
        )
        category = get_object_or_404(RiskCategory, pk=self.kwargs["category_pk"], is_active=True)
        cell = Coverage.objects.filter(service=service, category=category).first()
        return cell or Coverage(service=service, category=category)

    def form_valid(self, form):
        cell = form.instance
        save_coverage(cell, self.request.user, form.cleaned_data["status"], form.cleaned_data["reason"])
        messages.success(
            self.request, f"وضعیت «{cell.category}» برای خدمت «{cell.service.name}»: {cell.get_status_display()}."
        )
        return redirect(self.get_success_url())

    def get_success_url(self):
        # برگشت به همان صفحه و فیلترهای جدول؛ فقط نشانی داخل همین سامانه پذیرفته می‌شود.
        next_url = self.request.POST.get("next") or self.request.GET.get("next")
        if next_url and url_has_allowed_host_and_scheme(next_url, {self.request.get_host()}):
            return next_url
        return reverse("risks:coverage")

    def get_context_data(self, **kwargs):
        cell = self.object
        risks = visible_risks(self.request.user).filter(service=cell.service, category=cell.category)
        return super().get_context_data(
            cell=cell,
            next=self.request.GET.get("next") or self.request.POST.get("next") or "",
            cancel_url=self.get_success_url(),
            cell_risks=active_risks(risks).select_related("owner"),
            can_edit_register=can_edit_register(self.request.user),
            **kwargs,
        )


class RiskCategoryListView(ListView):
    model = RiskCategory
    template_name = "risks/category_list.html"
    context_object_name = "categories"

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_edit_categories(self.request.user), **kwargs)


class RiskCategoryCreateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, CreateView):
    roles = CATEGORY_EDIT_ROLES
    model = RiskCategory
    form_class = RiskCategoryForm
    success_url = reverse_lazy("risks:category_list")
    success_message = "دسته‌ی «%(code)s %(name)s» ثبت شد."


class RiskCategoryUpdateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, UpdateView):
    roles = CATEGORY_EDIT_ROLES
    model = RiskCategory
    form_class = RiskCategoryForm
    success_url = reverse_lazy("risks:category_list")
    success_message = "تغییرات دسته‌ی «%(code)s %(name)s» ذخیره شد."



class ScenarioListView(FilteredListView):
    """کتابخانه‌ی سناریوهای مرجع. همه‌ی کاربران آن را می‌بینند، چون سناریو به خدمت یا واحد خاصی بسته نیست."""

    filter_form_class = ScenarioFilterForm
    queryset = RiskScenario.objects.select_related("category")
    template_name = "risks/scenario_list.html"
    context_object_name = "scenarios"

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_edit_register(self.request.user), **kwargs)


class ScenarioDetailView(DetailView):
    queryset = RiskScenario.objects.select_related("category")
    template_name = "risks/scenario_detail.html"
    context_object_name = "scenario"

    def get_context_data(self, **kwargs):
        # از ریسک‌های ساخته‌شده از این سناریو فقط آن‌هایی که کاربر می‌بیند.
        risks = visible_risks(self.request.user).filter(scenario=self.object)
        return super().get_context_data(
            risks=risks.select_related("service", "org_unit", "owner"),
            can_edit=can_edit_register(self.request.user),
            **kwargs,
        )


class ScenarioFormMixin(RoleRequiredMixin, BackToRecordMixin, FormPageMixin):
    roles = REGISTER_EDIT_ROLES
    model = RiskScenario
    form_class = RiskScenarioForm
    success_url = reverse_lazy("risks:scenario_list")


class ScenarioCreateView(ScenarioFormMixin, CreateView):
    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, f"سناریوی «{self.object}» ثبت شد.")
        return response


class ScenarioUpdateView(ScenarioFormMixin, UpdateView):
    def form_valid(self, form):
        response = super().form_valid(form)
        version = f" و نسخه‌ی آن {self.object.version} شد" if form.cleaned_data.get("major_change") else ""
        messages.success(self.request, f"تغییرات سناریوی «{self.object}» ذخیره شد{version}.")
        return response


class RiskListView(FilteredListView):
    """رجیستر ریسک: ریسک‌هایی که کاربر می‌بیند، تازه‌ترین اول."""

    filter_form_class = RiskFilterForm
    template_name = "risks/risk_list.html"
    context_object_name = "risks"

    def get_filter_form_kwargs(self):
        return {"user": self.request.user}

    def get_queryset(self):
        self.queryset = visible_risks(self.request.user).select_related("service", "category", "org_unit", "owner")
        return super().get_queryset()

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_edit_register(self.request.user), **kwargs)


class RiskDetailView(DetailView):
    template_name = "risks/risk_detail.html"
    context_object_name = "risk"

    def get_queryset(self):
        # ریسکی که کاربر اجازه‌ی دیدنش را ندارد اصلاً پیدا نمی‌شود (۴۰۴).
        return visible_risks(self.request.user).select_related(
            "scenario", "service", "category", "org_unit", "owner"
        )

    def get_context_data(self, **kwargs):
        risk = self.object
        user = self.request.user
        service_visible = risk.service_id and visible_services(user).filter(pk=risk.service_id).exists()
        return super().get_context_data(
            customers=risk.customers.all(),
            tags=risk.tags.all(),
            links=risk.links.all(),
            # نام خدمت همیشه دیده می‌شود، ولی پیوند به صفحه‌اش فقط اگر کاربر اجازه‌ی دیدنش را دارد.
            service_url=risk.service.get_absolute_url() if service_visible else None,
            can_edit=can_edit_register(user),
            **kwargs,
        )


class RiskFormMixin(RoleRequiredMixin, BackToRecordMixin, FormPageMixin):
    roles = REGISTER_EDIT_ROLES
    model = Risk
    form_class = RiskForm
    success_url = reverse_lazy("risks:risk_list")

    def form_valid(self, form):
        response = super().form_valid(form)
        message = self.success_text()
        cell = mark_covered_by_risk(self.object, self.request.user)
        if cell:
            message += f" خانه‌ی {cell.category.code} خدمت {cell.service.code} در جهان ریسک «بررسی‌شده» شد."
        messages.success(self.request, message)
        return response


class RiskCreateView(RiskFormMixin, CreateView):
    def get_initial(self):
        """ثبت ریسک از صفحه‌ی سناریو، خدمت یا خانه‌ی جهان ریسک، همان‌ها را از پیش انتخاب می‌کند."""
        initial = {"channel": Risk.Channel.INTERVIEW}
        scenario = self.from_param("scenario", RiskScenario.objects.filter(is_active=True))
        if scenario:
            initial.update(scenario=scenario, title=scenario.title, category=scenario.category)
        service = self.from_param("service", visible_services(self.request.user).filter(is_active=True))
        if service:
            initial.update(service=service, org_unit=service.org_unit)
        category = self.from_param("category", RiskCategory.objects.filter(is_active=True))
        if category:
            initial["category"] = category
        return initial

    def from_param(self, name, queryset):
        value = self.request.GET.get(name, "")
        return queryset.filter(pk=value).first() if value.isdecimal() else None

    def success_text(self):
        return f"ریسک «{self.object}» ثبت شد."


class RiskUpdateView(RiskFormMixin, UpdateView):
    def get_queryset(self):
        return visible_risks(self.request.user)

    def success_text(self):
        return f"تغییرات ریسک «{self.object}» ذخیره شد."


class ExternalLinkFormMixin(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin):
    """افزودن و ویرایش پیوند بیرونی؛ بعد از ذخیره یا انصراف به صفحه‌ی همان ریسک برمی‌گردد."""

    roles = REGISTER_EDIT_ROLES
    model = ExternalLink
    form_class = ExternalLinkForm

    def get_success_url(self):
        return self.object.risk.get_absolute_url()

    def get_success_message(self, cleaned_data):
        return f"پیوند «{self.object}» برای ریسک {self.object.risk.code} ذخیره شد."

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        risk = context["form"].instance.risk
        context["title"] = f"{context['title']} برای ریسک {risk.code}"
        context["cancel_url"] = risk.get_absolute_url()
        return context


class ExternalLinkCreateView(ExternalLinkFormMixin, CreateView):
    @cached_property
    def risk(self):
        return get_object_or_404(visible_risks(self.request.user), pk=self.kwargs["risk_pk"])

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["instance"] = ExternalLink(risk=self.risk)
        return kwargs


class ExternalLinkUpdateView(ExternalLinkFormMixin, UpdateView):
    def get_queryset(self):
        return ExternalLink.objects.filter(risk__in=visible_risks(self.request.user)).select_related("risk")

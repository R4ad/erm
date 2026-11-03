from django.contrib import messages
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse, reverse_lazy
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.generic import CreateView, ListView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.catalog.permissions import visible_services
from apps.core.views import FilteredListView, FormPageMixin

from .forms import CoverageFilterForm, CoverageForm, RiskCategoryForm
from .models import Coverage, RiskCategory
from .permissions import UNIVERSE_EDIT_ROLES, can_edit_universe
from .services import active_categories, coverage_rows, critical_coverage, save_coverage, status_counts


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
            rows=coverage_rows(context["services"], categories),
            critical=critical_coverage(services, categories),
            counts=status_counts(services, categories),
            can_edit=can_edit_universe(self.request.user),
        )
        return context


class CoverageUpdateView(RoleRequiredMixin, UpdateView):
    """ثبت وضعیت یک خانه‌ی «خدمت × دسته». خانه‌ای که ردیف ندارد با همین صفحه ساخته می‌شود."""

    roles = UNIVERSE_EDIT_ROLES
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
        return super().get_context_data(
            cell=self.object,
            next=self.request.GET.get("next") or self.request.POST.get("next") or "",
            cancel_url=self.get_success_url(),
            **kwargs,
        )


class RiskCategoryListView(ListView):
    model = RiskCategory
    template_name = "risks/category_list.html"
    context_object_name = "categories"

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_edit_universe(self.request.user), **kwargs)


class RiskCategoryCreateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, CreateView):
    roles = UNIVERSE_EDIT_ROLES
    model = RiskCategory
    form_class = RiskCategoryForm
    success_url = reverse_lazy("risks:category_list")
    success_message = "دسته‌ی «%(code)s %(name)s» ثبت شد."


class RiskCategoryUpdateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, UpdateView):
    roles = UNIVERSE_EDIT_ROLES
    model = RiskCategory
    form_class = RiskCategoryForm
    success_url = reverse_lazy("risks:category_list")
    success_message = "تغییرات دسته‌ی «%(code)s %(name)s» ذخیره شد."


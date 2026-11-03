from django.contrib.messages.views import SuccessMessageMixin
from django.db.models import Prefetch
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.urls import reverse_lazy
from django.utils.functional import cached_property
from django.views.generic import CreateView, DetailView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.core.views import FilteredListView, FormPageMixin
from apps.risks.permissions import can_edit_coverage, can_edit_register, visible_risks
from apps.risks.services import active_categories, coverage_rows

from .forms import (
    AssetFilterForm,
    AssetForm,
    CommitmentFilterForm,
    CommitmentForm,
    CustomerFilterForm,
    CustomerForm,
    DependencyForm,
    ServiceCustomerForm,
    ServiceFilterForm,
    ServiceForm,
    SupplierFilterForm,
    SupplierForm,
)
from .models import Asset, Commitment, Customer, Dependency, Service, ServiceCustomer, Supplier
from .permissions import (
    EDIT_ROLES,
    can_edit_catalog,
    visible_assets,
    visible_commitments,
    visible_dependents,
    visible_services,
)


class BackToRecordMixin:
    """بعد از ذخیره به صفحه‌ی همان رکورد می‌رود. انصرافِ ویرایش هم به همان صفحه برمی‌گردد؛
    انصرافِ ساختن به success_url، یعنی فهرست."""

    def get_success_url(self):
        return self.object.get_absolute_url()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        if self.object:
            context["cancel_url"] = self.object.get_absolute_url()
        return context


class CustomerListView(FilteredListView):
    model = Customer
    filter_form_class = CustomerFilterForm
    template_name = "catalog/customer_list.html"
    context_object_name = "customers"

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_edit_catalog(self.request.user), **kwargs)


class CustomerCreateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, CreateView):
    roles = EDIT_ROLES
    model = Customer
    form_class = CustomerForm
    success_url = reverse_lazy("catalog:customer_list")
    success_message = "بانک «%(name)s» ثبت شد."


class CustomerUpdateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, UpdateView):
    roles = EDIT_ROLES
    model = Customer
    form_class = CustomerForm
    success_url = reverse_lazy("catalog:customer_list")
    success_message = "تغییرات بانک «%(name)s» ذخیره شد."


class ServiceListView(FilteredListView):
    filter_form_class = ServiceFilterForm
    template_name = "catalog/service_list.html"
    context_object_name = "services"

    def get_queryset(self):
        # فهرست از خدمت‌هایی شروع می‌شود که کاربر اجازه‌ی دیدنشان را دارد؛ فیلترها روی همین‌ها اعمال می‌شوند.
        self.queryset = visible_services(self.request.user).select_related("org_unit", "owner")
        return super().get_queryset()

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_edit_catalog(self.request.user), **kwargs)


class ServiceDetailView(DetailView):
    template_name = "catalog/service_detail.html"
    context_object_name = "service"

    def get_queryset(self):
        # خدمتی که کاربر اجازه‌ی دیدنش را ندارد اصلاً پیدا نمی‌شود (۴۰۴)، نه این‌که پیدا شود و رد شود.
        return visible_services(self.request.user).select_related("org_unit", "owner")

    def get_context_data(self, **kwargs):
        user = self.request.user
        dependencies = list(self.object.dependencies.select_related("upstream_service", "supplier", "asset"))
        # نام خدمت بالادستی همیشه دیده می‌شود، ولی پیوند به صفحه‌اش فقط اگر کاربر اجازه‌ی دیدنش را دارد.
        # تأمین‌کننده را همه می‌بینند، و دارایی‌ای را که خدمتی قابل‌دیدن به آن وابسته است هم.
        visible_upstream = set(
            visible_services(user).filter(dependents__service=self.object).values_list("pk", flat=True)
        )
        for dependency in dependencies:
            hidden = dependency.upstream_service_id and dependency.upstream_service_id not in visible_upstream
            dependency.target_url = None if hidden else dependency.target.get_absolute_url()
        return super().get_context_data(
            can_edit=can_edit_catalog(user),
            customer_links=self.object.customer_links.select_related("customer"),
            commitments=self.object.commitments.select_related("customer", "owner"),
            dependencies=dependencies,
            dependents=visible_dependents(self.object, user),
            # جهان ریسک فقط خدمت‌های فعال را دارد (قدم ۱۰).
            coverage=(
                coverage_rows([self.object], active_categories(), visible_risks(user))[0][1]
                if self.object.is_active
                else []
            ),
            can_edit_coverage=can_edit_coverage(user),
            risks=visible_risks(user).filter(service=self.object).select_related("category", "owner"),
            can_edit_risks=can_edit_register(user),
            **kwargs,
        )


class ServiceCreateView(RoleRequiredMixin, SuccessMessageMixin, BackToRecordMixin, FormPageMixin, CreateView):
    roles = EDIT_ROLES
    model = Service
    form_class = ServiceForm
    success_url = reverse_lazy("catalog:service_list")
    success_message = "خدمت «%(name)s» ثبت شد."


class ServiceUpdateView(RoleRequiredMixin, SuccessMessageMixin, BackToRecordMixin, FormPageMixin, UpdateView):
    roles = EDIT_ROLES
    model = Service
    form_class = ServiceForm
    success_message = "تغییرات خدمت «%(name)s» ذخیره شد."


class ServiceCustomerFormMixin(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin):
    """مشترک افزودن و ویرایش بانک یک خدمت. بعد از ذخیره یا انصراف به صفحه‌ی همان خدمت برمی‌گردد."""

    roles = EDIT_ROLES
    model = ServiceCustomer
    form_class = ServiceCustomerForm

    def get_success_url(self):
        return self.object.service.get_absolute_url()

    def get_success_message(self, cleaned_data):
        return f"بانک «{self.object.customer}» برای خدمت «{self.object.service.name}» ذخیره شد."


class ServiceCustomerCreateView(ServiceCustomerFormMixin, CreateView):
    def dispatch(self, request, *args, **kwargs):
        self.service = get_object_or_404(Service, pk=kwargs["service_pk"])
        return super().dispatch(request, *args, **kwargs)

    def get_form_kwargs(self):
        # فرم از همان اول می‌داند ردیف مال کدام خدمت است؛ خدمت از نشانی صفحه می‌آید، نه از فرم.
        return super().get_form_kwargs() | {"instance": ServiceCustomer(service=self.service)}

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = f"افزودن بانک به خدمت {self.service}"
        context["cancel_url"] = self.service.get_absolute_url()
        return context


class ServiceCustomerUpdateView(ServiceCustomerFormMixin, UpdateView):
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = f"ویرایش بانک «{self.object.customer}» در خدمت {self.object.service}"
        context["cancel_url"] = self.object.service.get_absolute_url()
        return context


class SupplierListView(FilteredListView):
    queryset = Supplier.objects.select_related("contract_owner")
    filter_form_class = SupplierFilterForm
    template_name = "catalog/supplier_list.html"
    context_object_name = "suppliers"

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_edit_catalog(self.request.user), **kwargs)


class SupplierDetailView(DetailView):
    queryset = Supplier.objects.select_related("contract_owner")
    template_name = "catalog/supplier_detail.html"
    context_object_name = "supplier"

    def get_context_data(self, **kwargs):
        user = self.request.user
        return super().get_context_data(
            can_edit=can_edit_catalog(user), dependents=visible_dependents(self.object, user), **kwargs
        )


class SupplierCreateView(RoleRequiredMixin, SuccessMessageMixin, BackToRecordMixin, FormPageMixin, CreateView):
    roles = EDIT_ROLES
    model = Supplier
    form_class = SupplierForm
    success_url = reverse_lazy("catalog:supplier_list")
    success_message = "تأمین‌کننده‌ی «%(name)s» ثبت شد."


class SupplierUpdateView(RoleRequiredMixin, SuccessMessageMixin, BackToRecordMixin, FormPageMixin, UpdateView):
    roles = EDIT_ROLES
    model = Supplier
    form_class = SupplierForm
    success_message = "تغییرات تأمین‌کننده‌ی «%(name)s» ذخیره شد."


class AssetListView(FilteredListView):
    filter_form_class = AssetFilterForm
    template_name = "catalog/asset_list.html"
    context_object_name = "assets"

    def get_queryset(self):
        self.queryset = visible_assets(self.request.user).select_related("org_unit", "owner")
        return super().get_queryset()

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_edit_catalog(self.request.user), **kwargs)


class AssetDetailView(DetailView):
    template_name = "catalog/asset_detail.html"
    context_object_name = "asset"

    def get_queryset(self):
        return visible_assets(self.request.user).select_related("org_unit", "owner")

    def get_context_data(self, **kwargs):
        user = self.request.user
        return super().get_context_data(
            can_edit=can_edit_catalog(user), dependents=visible_dependents(self.object, user), **kwargs
        )


class AssetCreateView(RoleRequiredMixin, SuccessMessageMixin, BackToRecordMixin, FormPageMixin, CreateView):
    roles = EDIT_ROLES
    model = Asset
    form_class = AssetForm
    success_url = reverse_lazy("catalog:asset_list")
    success_message = "دارایی «%(name)s» ثبت شد."


class AssetUpdateView(RoleRequiredMixin, SuccessMessageMixin, BackToRecordMixin, FormPageMixin, UpdateView):
    roles = EDIT_ROLES
    model = Asset
    form_class = AssetForm
    success_message = "تغییرات دارایی «%(name)s» ذخیره شد."


class CommitmentListView(FilteredListView):
    filter_form_class = CommitmentFilterForm
    template_name = "catalog/commitment_list.html"
    context_object_name = "commitments"

    def get_queryset(self):
        # کنار هر تعهد فقط خدمت‌هایی نشان داده می‌شوند که کاربر اجازه‌ی دیدنشان را دارد.
        services = Prefetch("services", queryset=visible_services(self.request.user))
        commitments = visible_commitments(self.request.user).select_related("customer", "owner")
        self.queryset = commitments.prefetch_related(services)
        return super().get_queryset()

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_edit_catalog(self.request.user), **kwargs)


class CommitmentFormMixin(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin):
    """مشترک ساختن و ویرایش تعهد. اگر از صفحه‌ی یک خدمت آمده باشیم (?service=شناسه در نشانی)،
    بعد از ذخیره یا انصراف به صفحه‌ی همان خدمت برمی‌گردیم؛ وگرنه به فهرست تعهدها."""

    roles = EDIT_ROLES
    model = Commitment
    form_class = CommitmentForm
    success_url = reverse_lazy("catalog:commitment_list")

    @cached_property
    def from_service(self):
        service_id = self.request.GET.get("service", "")
        if not service_id.isdecimal():
            return None
        return visible_services(self.request.user).filter(pk=service_id).first()

    def get_success_url(self):
        return self.from_service.get_absolute_url() if self.from_service else self.success_url

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["cancel_url"] = self.get_success_url()
        return context


class CommitmentCreateView(CommitmentFormMixin, CreateView):
    success_message = "تعهد «%(title)s» ثبت شد."

    def get_initial(self):
        # دکمه‌ی «افزودن تعهد» در صفحه‌ی خدمت، همان خدمت را از پیش انتخاب می‌کند.
        return {"services": [self.from_service]} if self.from_service else {}


class CommitmentUpdateView(CommitmentFormMixin, UpdateView):
    success_message = "تغییرات تعهد «%(title)s» ذخیره شد."


class DependencyFormMixin(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin):
    """مشترک افزودن و ویرایش وابستگی. بعد از ذخیره یا انصراف به صفحه‌ی همان خدمت برمی‌گردد."""

    roles = EDIT_ROLES
    model = Dependency
    form_class = DependencyForm

    def get_success_url(self):
        return self.object.service.get_absolute_url()

    def get_success_message(self, cleaned_data):
        return f"وابستگی خدمت «{self.object.service.name}» به «{self.object.target}» ذخیره شد."


class DependencyCreateView(DependencyFormMixin, CreateView):
    # نوع وابستگی در نشانی صفحه می‌آید و به فیلد همان نوع در مدل می‌رسد.
    TARGETS = {"service": "upstream_service", "supplier": "supplier", "asset": "asset"}

    def dispatch(self, request, *args, **kwargs):
        self.service = get_object_or_404(Service, pk=kwargs["service_pk"])
        if kwargs["kind"] not in self.TARGETS:
            raise Http404
        self.target = self.TARGETS[kwargs["kind"]]
        return super().dispatch(request, *args, **kwargs)

    def get_form_kwargs(self):
        return super().get_form_kwargs() | {"instance": Dependency(service=self.service), "target": self.target}

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        kind = Dependency._meta.get_field(self.target).verbose_name
        context["title"] = f"وابستگی خدمت {self.service} به {kind}"
        context["cancel_url"] = self.service.get_absolute_url()
        return context


class DependencyUpdateView(DependencyFormMixin, UpdateView):
    def get_form_kwargs(self):
        return super().get_form_kwargs() | {"target": self.object.target_field}

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = f"ویرایش وابستگی خدمت {self.object.service} به «{self.object.target}»"
        context["cancel_url"] = self.object.service.get_absolute_url()
        return context

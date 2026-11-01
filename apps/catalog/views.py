from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import get_object_or_404
from django.urls import reverse_lazy
from django.views.generic import CreateView, DetailView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.core.views import FilteredListView, FormPageMixin

from .forms import (
    AssetFilterForm,
    AssetForm,
    CustomerFilterForm,
    CustomerForm,
    ServiceCustomerForm,
    ServiceFilterForm,
    ServiceForm,
    SupplierFilterForm,
    SupplierForm,
)
from .models import Asset, Customer, Service, ServiceCustomer, Supplier
from .permissions import EDIT_ROLES, can_edit_catalog, visible_assets, visible_services


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
        return super().get_context_data(
            can_edit=can_edit_catalog(self.request.user),
            customer_links=self.object.customer_links.select_related("customer"),
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
        return super().get_context_data(can_edit=can_edit_catalog(self.request.user), **kwargs)


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
        return super().get_context_data(can_edit=can_edit_catalog(self.request.user), **kwargs)


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

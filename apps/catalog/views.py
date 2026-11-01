from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import get_object_or_404
from django.urls import reverse_lazy
from django.views.generic import CreateView, DetailView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.core.views import FilteredListView, FormPageMixin

from .forms import (
    CustomerFilterForm,
    CustomerForm,
    ServiceCustomerForm,
    ServiceFilterForm,
    ServiceForm,
)
from .models import Customer, Service, ServiceCustomer
from .permissions import EDIT_ROLES, can_edit_catalog, visible_services


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


class ServiceCreateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, CreateView):
    roles = EDIT_ROLES
    model = Service
    form_class = ServiceForm
    success_url = reverse_lazy("catalog:service_list")  # دکمه‌ی انصراف
    success_message = "خدمت «%(name)s» ثبت شد."

    def get_success_url(self):
        return self.object.get_absolute_url()  # بعد از ذخیره، صفحه‌ی همان خدمت


class ServiceUpdateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, UpdateView):
    roles = EDIT_ROLES
    model = Service
    form_class = ServiceForm
    success_message = "تغییرات خدمت «%(name)s» ذخیره شد."

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["cancel_url"] = self.object.get_absolute_url()
        return context


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

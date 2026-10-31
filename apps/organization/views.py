from django.contrib.messages.views import SuccessMessageMixin
from django.urls import reverse_lazy
from django.views.generic import CreateView, ListView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.core.views import FormPageMixin

from .forms import OrgUnitForm
from .models import OrgUnit
from .services import unit_tree


class OrgUnitListView(ListView):
    template_name = "organization/unit_list.html"
    context_object_name = "units"

    def get_queryset(self):
        return unit_tree(OrgUnit.objects.prefetch_related("managers"))

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["can_edit"] = self.request.user.is_system_admin
        return context


class OrgUnitCreateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, CreateView):
    model = OrgUnit
    form_class = OrgUnitForm
    success_url = reverse_lazy("organization:unit_list")
    success_message = "واحد «%(name)s» اضافه شد."


class OrgUnitUpdateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, UpdateView):
    model = OrgUnit
    form_class = OrgUnitForm
    success_url = reverse_lazy("organization:unit_list")
    success_message = "تغییرات واحد «%(name)s» ذخیره شد."
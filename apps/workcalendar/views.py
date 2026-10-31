from django.contrib import messages
from django.contrib.messages.views import SuccessMessageMixin
from django.urls import reverse_lazy
from django.utils import timezone
from django.views.generic import CreateView, DeleteView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.core.jalali import jalali_year
from apps.core.views import FilteredListView, FormPageMixin

from .forms import HolidayFilterForm, HolidayForm
from .models import Holiday


class HolidayListView(RoleRequiredMixin, FilteredListView):
    model = Holiday
    filter_form_class = HolidayFilterForm
    paginate_by = 100
    template_name = "workcalendar/holiday_list.html"
    context_object_name = "holidays"

    def get_filter_data(self):
        data = self.request.GET.copy()
        if "year" not in data:
            data["year"] = jalali_year(timezone.localdate())  # پیش‌فرض: تعطیلات امسال
        return data


class HolidayCreateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, CreateView):
    model = Holiday
    form_class = HolidayForm
    success_url = reverse_lazy("workcalendar:holiday_list")
    success_message = "تعطیلی «%(title)s» ثبت شد."


class HolidayUpdateView(RoleRequiredMixin, SuccessMessageMixin, FormPageMixin, UpdateView):
    model = Holiday
    form_class = HolidayForm
    success_url = reverse_lazy("workcalendar:holiday_list")
    success_message = "تغییرات تعطیلی «%(title)s» ذخیره شد."


class HolidayDeleteView(RoleRequiredMixin, DeleteView):
    model = Holiday
    http_method_names = ["post"]
    success_url = reverse_lazy("workcalendar:holiday_list")

    def form_valid(self, form):
        messages.success(self.request, f"تعطیلی «{self.object.title}» حذف شد.")
        return super().form_valid(form)
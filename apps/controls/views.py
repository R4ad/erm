from django.contrib import messages
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.urls import reverse_lazy
from django.utils.functional import cached_property
from django.views.generic import CreateView, DetailView, UpdateView

from apps.accounts.permissions import RoleRequiredMixin
from apps.catalog.views import BackToRecordMixin
from apps.core.records import record_extras
from apps.core.views import FilteredListView, FormPageMixin
from apps.risks.permissions import visible_risks

from .forms import ApplicabilityForm, ControlFilterForm, ControlForm, SoaFilterForm
from .models import Applicability, Control, IsoControl
from .permissions import CONTROL_EDIT_ROLES, CONTROL_SEE_ALL_ROLES, can_edit_controls, visible_controls
from .services import soa_summary


class ControlListView(FilteredListView):
    """کتابخانه‌ی کنترل: کنترل‌هایی که کاربر می‌بیند."""

    filter_form_class = ControlFilterForm
    template_name = "controls/control_list.html"
    context_object_name = "controls"

    def get_queryset(self):
        self.queryset = visible_controls(self.request.user).select_related("owner").prefetch_related("iso_controls")
        return super().get_queryset()

    def get_context_data(self, **kwargs):
        return super().get_context_data(can_edit=can_edit_controls(self.request.user), **kwargs)


class ControlDetailView(DetailView):
    template_name = "controls/control_detail.html"
    context_object_name = "control"

    def get_queryset(self):
        # کنترلی که کاربر اجازه‌ی دیدنش را ندارد اصلاً پیدا نمی‌شود (۴۰۴).
        return visible_controls(self.request.user).select_related("owner")

    def get_context_data(self, **kwargs):
        control = self.object
        user = self.request.user
        return super().get_context_data(
            iso_controls=control.iso_controls.select_related("applicability"),
            # از ریسک‌هایی که به این کنترل تکیه دارند فقط آن‌هایی که کاربر می‌بیند.
            risks=visible_risks(user).filter(controls=control).select_related("service", "category", "owner"),
            can_edit=can_edit_controls(user),
            **record_extras(control, user),
            **kwargs,
        )


class ControlFormMixin(RoleRequiredMixin, BackToRecordMixin, FormPageMixin):
    roles = CONTROL_EDIT_ROLES
    model = Control
    form_class = ControlForm
    success_url = reverse_lazy("controls:control_list")


class ControlCreateView(ControlFormMixin, CreateView):
    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, f"کنترل «{self.object}» ثبت شد.")
        return response


class ControlUpdateView(ControlFormMixin, UpdateView):
    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, f"تغییرات کنترل «{self.object}» ذخیره شد.")
        return response


class SoaListView(RoleRequiredMixin, FilteredListView):
    """بیانیه‌ی کاربردپذیری: همه‌ی کنترل‌های پیوست A، با کاربرد، دلیل، وضعیت اجرا و ردیابی به کنترل‌ها و ریسک‌ها."""

    roles = CONTROL_SEE_ALL_ROLES
    filter_form_class = SoaFilterForm
    template_name = "controls/soa_list.html"
    context_object_name = "iso_controls"
    paginate_by = 100  # همه‌ی ۹۳ کنترل در یک صفحه

    def get_queryset(self):
        risks = visible_risks(self.request.user)
        # order_by صریح، چون جنگو ترتیب Meta را در کوئری‌های شمارشی به کار نمی‌برد.
        self.queryset = (
            IsoControl.objects.select_related("applicability")
            .annotate(
                control_count=Count("controls", filter=Q(controls__is_active=True), distinct=True),
                risk_count=Count("controls__risks", filter=Q(controls__risks__in=risks), distinct=True),
            )
            .order_by("theme", "number")
        )
        return super().get_queryset()

    def get_context_data(self, **kwargs):
        return super().get_context_data(summary=soa_summary(), can_edit=can_edit_controls(self.request.user), **kwargs)


class SoaDetailView(RoleRequiredMixin, DetailView):
    """یک کنترل پیوست A: ردیف بیانیه، کنترل‌های سازمان که آن را اجرا می‌کنند و ریسک‌هایی که به آن‌ها تکیه دارند."""

    roles = CONTROL_SEE_ALL_ROLES
    queryset = IsoControl.objects.select_related("applicability")
    template_name = "controls/soa_detail.html"
    context_object_name = "iso_control"

    def get_context_data(self, **kwargs):
        iso_control = self.object
        user = self.request.user
        controls = iso_control.controls.select_related("owner").prefetch_related("iso_controls")
        risks = visible_risks(user).filter(controls__in=controls).distinct()
        return super().get_context_data(
            applicability=getattr(iso_control, "applicability", None),
            controls=controls,
            has_active_controls=any(control.is_active for control in controls),
            risks=risks.select_related("service", "category", "owner"),
            can_edit=can_edit_controls(user),
            **kwargs,
        )


class SoaUpdateView(RoleRequiredMixin, FormPageMixin, UpdateView):
    """ثبت یا ویرایش ردیف بیانیه برای یک کنترل پیوست A. ردیفی که نیست با اولین ذخیره ساخته می‌شود."""

    roles = CONTROL_EDIT_ROLES
    model = Applicability
    form_class = ApplicabilityForm

    @cached_property
    def iso_control(self):
        return get_object_or_404(IsoControl, pk=self.kwargs["pk"])

    def get_object(self, queryset=None):
        try:
            return self.iso_control.applicability
        except Applicability.DoesNotExist:
            return Applicability(iso_control=self.iso_control)

    def get_success_url(self):
        return self.iso_control.get_absolute_url()

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, f"ردیف {self.iso_control.code} بیانیه‌ی کاربردپذیری ذخیره شد.")
        return response

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = f"بیانیه‌ی کاربردپذیری: {self.iso_control.code} {self.iso_control.title_en}"
        context["cancel_url"] = self.iso_control.get_absolute_url()
        return context

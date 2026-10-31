from django.contrib import messages
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from openpyxl import Workbook

from apps.accounts.permissions import RoleRequiredMixin, role_required
from apps.accounts.roles import Role
from apps.core.jalali import to_jalali_datetime
from apps.core.views import FilteredListView

from .forms import ChangeFilterForm, EventFilterForm
from .models import AuditEvent
from .services import HISTORY_TYPES, describe_changes, log_event, tracked_models

# مدیر سامانه همیشه دسترسی دارد (RoleRequiredMixin)؛ «فقط مشاهده» همان ممیز است.
AUDIT_ROLES = [Role.VIEWER]


class EventListView(RoleRequiredMixin, FilteredListView):
    roles = AUDIT_ROLES
    queryset = AuditEvent.objects.select_related("user")
    filter_form_class = EventFilterForm
    paginate_by = 50
    template_name = "audit/event_list.html"
    context_object_name = "events"


class ChangeListView(RoleRequiredMixin, FilteredListView):
    roles = AUDIT_ROLES
    filter_form_class = ChangeFilterForm
    template_name = "audit/change_list.html"

    def get_filter_data(self):
        data = self.request.GET.copy()
        if "model" not in data:
            data["model"] = tracked_models()[0]._meta.label_lower
        return data

    def get_queryset(self):
        # queryset به نوع رکورد انتخاب‌شده بستگی دارد، پس خود فرم آن را می‌سازد.
        self.filter_form = self.filter_form_class(self.get_filter_data())
        if not self.filter_form.is_valid():
            return []
        return self.filter_form.filter()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # تغییرات هر ردیف فقط برای همین صفحه حساب می‌شود، نه برای همه‌ی ردیف‌ها.
        context["rows"] = [
            {"record": record, "type": HISTORY_TYPES[record.history_type], "changes": describe_changes(record)}
            for record in context["page_obj"]
        ]
        return context


@role_required(*AUDIT_ROLES)
def event_export(request):
    """همان فهرست با همان فیلترها، به‌صورت فایل Excel. خود این خروجی هم یک رویداد ثبت می‌کند."""
    form = EventFilterForm(request.GET)
    if not form.is_valid():
        messages.error(request, "فیلترها درست نیستند؛ اول آن‌ها را اصلاح کنید.")
        return redirect("audit:event_list")

    book = Workbook()
    sheet = book.active
    sheet.title = "رویدادها"
    sheet.sheet_view.rightToLeft = True
    sheet.append(["زمان", "نام", "نام کاربری", "رویداد", "شرح", "نشانی IP", "مرورگر"])
    rows = 0
    for event in form.filter(AuditEvent.objects.select_related("user")).iterator():
        name = event.user.get_full_name() if event.user else ""
        sheet.append(
            [to_jalali_datetime(event.at), name, event.username, event.get_event_display(), event.summary,
             event.ip_address or "", event.user_agent]
        )
        rows += 1

    filters = {key: value for key, value in request.GET.items() if value}
    log_event(AuditEvent.Event.EXPORT, request, report="رویدادهای Audit Log", filters=filters, rows=rows)

    response = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    response["Content-Disposition"] = f'attachment; filename="audit-events-{timezone.localdate():%Y%m%d}.xlsx"'
    book.save(response)
    return response


def permission_denied(request, exception=None):
    """جای صفحه‌ی ۴۰۳ خود Django (handler403 در config/urls.py): هر دسترسی ردشده را هم ثبت می‌کند."""
    log_event(AuditEvent.Event.PERMISSION_DENIED, request, path=request.get_full_path(), method=request.method)
    return render(request, "403.html", status=403)

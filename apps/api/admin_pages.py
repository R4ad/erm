"""صفحه‌های مدیریت سامانه در رابط React: کاربران، ورود کارکنان، تعطیلات و سوابق ممیزی
(accounts/user_list.html و staff_import.html، workcalendar/holiday_list.html و audit/).

مثل pages.py، هر تابع context همان view جنگو را به JSON می‌دهد؛ دسترسی (مدیر سامانه، و برای سوابق ممیزی نقش «فقط
مشاهده») را خود view چک می‌کند. خروجی Excel سوابق همان نشانی جنگوست و فایل را خود جنگو می‌سازد و ثبت می‌کند.
"""

from django.urls import reverse

from apps.audit.models import AuditEvent

from . import formatting as fmt
from .listing import listing

# --- کاربران ---


def user_list(context, request):
    rows = [
        {
            "id": user.pk,
            "name": user.get_full_name() or None,
            "username": user.username,
            "personnel_code": user.personnel_code or None,
            "org_unit": str(user.org_unit) if user.org_unit_id else None,
            "roles": [group.name for group in user.groups.all()],
            "is_active": user.is_active,
        }
        for user in context["users"]
    ]
    return {"title": "کاربران", **listing(context, rows), "import_url": reverse("accounts:staff_import")}


# --- ورود کارکنان ---


def staff_import_form(context, request):
    """صفحه‌ی بارگذاری فایل: عنوان و توضیح قالب جنگو، و دکمه‌ای که می‌گوید اول فقط گزارش آزمایشی ساخته می‌شود."""
    return {
        "title": "ورود کارکنان از فایل منابع انسانی",
        "intro": "اول گزارش آزمایشی نشان داده می‌شود و تا آن را تأیید نکنید، چیزی ذخیره نمی‌شود.",
        "submit": "بارگذاری و گزارش آزمایشی",
        "cancel_url": reverse("accounts:user_list"),
    }


def staff_import_result(context, request):
    """گزارش ورود کارکنان، بعد از بارگذاری (آزمایشی، با تأیید) یا بعد از تأیید (آن‌چه واقعاً انجام شد).

    confirm همان فرم پنهان قالب جنگوست: شناسه‌ی فایلی که منتظر تأیید است و گزینه‌ی غیرفعال کردن. شناسه تصادفی است و
    فقط به همان فایل آخر اشاره می‌کند؛ تأیید و لغو را باز هم view جنگو با دسترسی مدیر سامانه انجام می‌دهد.
    """
    confirm_form = context.get("confirm_form")
    confirm = None
    if confirm_form is not None:
        confirm = {
            "url": reverse("accounts:staff_import_confirm"),
            "values": {
                "token": str(confirm_form.initial["token"]),
                "deactivate_missing": bool(confirm_form.initial["deactivate_missing"]),
            },
        }
    sections = [
        {
            "title": section.title,
            "count": section.count,
            "lines": [str(line) for line in section.lines],
            "level": section.level or None,
        }
        for section in context["report"].sections()
    ]
    return {
        "default_message": "گزارش آزمایشی آماده است؛ هنوز چیزی ذخیره نشده است." if confirm else "انجام شد.",
        "report": {"dry_run": confirm is not None, "sections": sections},
        "confirm": confirm,
    }


# --- تعطیلات ---


def holiday_list(context, request):
    rows = [
        {
            "id": holiday.pk,
            "date": fmt.day(holiday.date),
            "weekday": holiday.weekday_name,
            "title": holiday.title,
            "edit_url": reverse("workcalendar:holiday_update", args=[holiday.pk]),
            "delete_url": reverse("workcalendar:holiday_delete", args=[holiday.pk]),
        }
        for holiday in context["holidays"]
    ]
    return {
        "title": "تعطیلات",
        **listing(context, rows),
        "create_url": reverse("workcalendar:holiday_create"),
        "note": "پنجشنبه و جمعه همیشه تعطیل‌اند و لازم نیست این‌جا ثبت شوند. تعطیلات رسمی هر سال را از تقویم رسمی وارد کنید.",
    }


# --- سوابق ممیزی ---

WARNING_EVENTS = {AuditEvent.Event.LOGIN_FAILED, AuditEvent.Event.PERMISSION_DENIED}


def _tabs():
    return [
        {"label": "ورود و رویدادها", "href": reverse("audit:event_list")},
        {"label": "تغییرات داده", "href": reverse("audit:change_list")},
    ]


def event_list(context, request):
    rows = [
        {
            "id": event.pk,
            "at": fmt.moment(event.at),
            "user": (event.user.get_full_name() or event.username) if event.user_id else None,
            "username": event.username or None,
            "event": fmt.choice(event, "event"),
            "warning": event.event in WARNING_EVENTS,
            "summary": event.summary or None,
            "ip_address": event.ip_address or None,
        }
        for event in context["events"]
    ]
    # خروجی با همان فیلترهای همین صفحه؛ فیلتر نادرست در جنگو به صفحه‌ی فهرست با پیام خطا برمی‌گردد، پس این‌جا
    # تا فیلترها درست نشده‌اند دکمه‌ای نیست.
    query = request.GET.urlencode()
    export_url = None
    if context["filter_form"].is_valid():
        export_url = reverse("audit:event_export") + (f"?{query}" if query else "")
    return {
        "title": "سوابق ممیزی",
        **listing(context, rows),
        "tabs": _tabs(),
        "export_url": export_url,
    }


def change_list(context, request):
    rows = []
    for row in context["rows"]:
        record = row["record"]
        changes = [{"label": str(label), "old": str(old), "new": str(new)} for label, old, new in row["changes"]]
        rows.append(
            {
                "id": record.history_id,
                "at": fmt.moment(record.history_date),
                "user": fmt.person(record.history_user),
                "type": {"value": record.history_type, "label": row["type"]},
                "record": str(record.instance),
                "reason": record.history_change_reason or None,
                "changes": changes,
                # ویرایشی که فیلد نمایش‌دادنی‌اش عوض نشده (مثلاً رمز یا نقش)؛ قالب جنگو همین را می‌گوید.
                "hidden_edit": record.history_type == "~" and not changes,
            }
        )
    return {"title": "سوابق ممیزی", **listing(context, rows), "tabs": _tabs()}


ADMIN_PAGES = {
    "accounts:user_list": user_list,
    "workcalendar:holiday_list": holiday_list,
    "audit:event_list": event_list,
    "audit:change_list": change_list,
}

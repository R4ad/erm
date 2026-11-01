import ipaddress

from django.apps import apps
from django.db import models
from simple_history.models import DeletedObject, HistoricalRecords

from apps.core.jalali import to_jalali, to_jalali_datetime

from .models import AuditEvent

HISTORY_TYPES = {"+": "ایجاد", "~": "ویرایش", "-": "حذف"}


def client_ip(request):
    """نشانی کاربر. پشت nginx، REMOTE_ADDR نشانی خود nginx است؛ پس آخرین مقدار X-Forwarded-For را می‌خوانیم
    که nginx خودمان گذاشته. مقدارهای قبلی این سرآیند را کاربر می‌تواند جعل کند. این فقط وقتی درست است که
    کانتینر web مستقیم در دسترس نباشد و همه‌ی درخواست‌ها از nginx بیایند (docker-compose.yml همین‌طور است)."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    address = forwarded.split(",")[-1] if forwarded else request.META.get("REMOTE_ADDR", "")
    try:
        return str(ipaddress.ip_address(address.strip()))
    except ValueError:
        return None  # مقدار نادرست را ذخیره نمی‌کنیم؛ PostgreSQL آن را نمی‌پذیرد


def current_request():
    """درخواستی که الان در حال اجراست. میان‌افزار simple-history آن را برای هر درخواست نگه می‌دارد.
    در دستور مدیریتی و تست بدون درخواست، None است."""
    return getattr(HistoricalRecords.context, "request", None)


def log_event(event, request=None, user=None, username=None, **details):
    """یک رویداد Audit Log ثبت می‌کند. اگر user داده نشود، کاربر واردشده‌ی همان درخواست است."""
    request = request or current_request()
    if user is None and request is not None:
        request_user = getattr(request, "user", None)
        if request_user is not None and request_user.is_authenticated:
            user = request_user
    if username is None:
        username = user.get_username() if user else ""
    return AuditEvent.objects.create(
        user=user,
        username=username[:150],
        event=event,
        ip_address=client_ip(request) if request else None,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:300] if request else "",
        details=details,
    )


def tracked_models():
    """همه‌ی مدل‌هایی که history = HistoricalRecords() دارند. مدل تازه با تاریخچه خودکار این‌جا می‌آید."""
    found = [model for model in apps.get_models() if hasattr(model._meta, "simple_history_manager_attribute")]
    return sorted(found, key=lambda model: str(model._meta.verbose_name))


def show_value(field, value):
    """مقدار یک فیلد را برای نمایش به فارسی برمی‌گرداند."""
    if isinstance(value, DeletedObject):
        # diff_against برای ForeignKey خالی یا رکورد حذف‌شده این را می‌دهد
        return "—" if value.pk is None else f"{value.model._meta.verbose_name} حذف‌شده (شناسه {value.pk})"
    if value is None or value == "":
        return "—"
    if field.choices:
        return dict(field.flatchoices).get(value, value)
    if isinstance(field, models.BooleanField):
        return "بله" if value else "خیر"
    if isinstance(field, models.DateTimeField):
        return to_jalali_datetime(value)
    if isinstance(field, models.DateField):
        return to_jalali(value)
    return str(value)  # برای ForeignKey، diff_against خود شیء را می‌دهد و str نامش است


def describe_changes(record):
    """فهرست (نام فیلد، مقدار قبلی، مقدار تازه) برای یک ردیف «ویرایش» تاریخچه، در مقایسه با ردیف قبلی."""
    if record.history_type != "~":
        return []
    previous = record.prev_record
    if previous is None:
        return []
    delta = record.diff_against(previous, foreign_keys_are_objs=True)
    rows = []
    for change in delta.changes:
        field = record._meta.get_field(change.field)
        old, new = show_value(field, change.old), show_value(field, change.new)
        if old != new:  # مثلاً فرم ادمین کسر ثانیه‌ی زمان را می‌اندازد؛ تغییری که دیده نمی‌شود نشان داده نمی‌شود
            rows.append((field.verbose_name, old, new))
    return rows
"""شکل JSON چیزهایی که در همه‌ی endpointها تکرار می‌شوند: تاریخ شمسی، شخص، سطح ریسک و گزینه‌ها."""

import datetime

from django.utils import timezone

from apps.core.jalali import WEEKDAY_NAMES, to_jalali, to_jalali_datetime


def day(value):
    """تاریخ: iso برای مقایسه و jalali (مثل 1405/08/13) برای نمایش. لحظه (datetime) روز همان لحظه به وقت تهران
    است، نه روز UTC آن؛ ثبت ساعت ۱ بامداد تهران روز قبل نشان داده نمی‌شود."""
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        value = timezone.localdate(value)
    return {"iso": value.isoformat(), "jalali": to_jalali(value)}


def deadline(value):
    """مهلت: مثل day، به‌اضافه‌ی روزهای مانده (منفی یعنی گذشته) نسبت به امروز."""
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        value = timezone.localdate(value)  # مهلت ساعتی، مثل مهلت مهار، روز همان لحظه را نشان می‌دهد
    today = timezone.localdate()
    return {**day(value), "days_left": (value - today).days, "overdue": value < today}


def moment(value):
    if value is None:
        return None
    return {"iso": value.isoformat(), "jalali": to_jalali_datetime(value)}


def today():
    value = timezone.localdate()
    return {**day(value), "weekday": WEEKDAY_NAMES[value.weekday()]}


def person(user):
    if user is None:
        return None
    return {"id": user.pk, "name": user.get_full_name() or user.username}


def level(risk_level):
    """سطح ریسک با رنگی که نسخه‌ی روش ارزیابی برایش تعیین کرده است."""
    if risk_level is None:
        return None
    return {
        "rank": risk_level.rank,
        "name": risk_level.name,
        "color": risk_level.color,
        "text_color": risk_level.text_color,
    }


# ریسک تازه‌ی فرم شناسایی تا وقتی عضو GRC دسته‌اش را تعیین نکرده دسته ندارد (پیش از ارزیابی اجباری است).
NO_CATEGORY = "بدون دسته"


def category(value):
    """دسته‌ی ریسک به شکل {code, name}؛ برای ریسک بی‌دسته None تا رابط «بدون دسته» بنویسد."""
    if value is None:
        return None
    return {"code": value.code, "name": value.name}


def category_code(risk):
    """کد دسته برای جاهایی که فقط متن کوتاه نشان می‌دهند؛ ریسک بی‌دسته خط تیره می‌گیرد، نه «None»."""
    return risk.category.code if risk.category_id else "—"


def category_or_blank(risk):
    """برای صفحه‌هایی که فقط ریسک ارزیابی‌شده را نشان می‌دهند و دسته را همیشه شیء می‌خوانند (دسته پیش از ارزیابی
    اجباری است)؛ ریسک قدیمی بی‌دسته هم به‌جای خطا «بدون دسته» می‌گیرد."""
    return category(risk.category) or {"code": "", "name": NO_CATEGORY}


def choice(instance, field_name):
    """مقدار و برچسب فارسی یک فیلد choices."""
    value = getattr(instance, field_name)
    if value in ("", None):
        return None
    return {"value": value, "label": getattr(instance, f"get_{field_name}_display")()}


def field_choices(form, name):
    """گزینه‌های یک فیلد فرم جنگو با همان برچسب‌هایی که صفحه‌های جنگو نشان می‌دهند (مثلاً درخت واحدها)."""
    return [{"value": str(value), "label": str(label)} for value, label in form.fields[name].choices if value != ""]


def form_errors(form):
    """خطاهای فرم: هر فیلد فهرست پیام‌هایش، و خطاهای کل فرم با کلید __all__."""
    return {name: [str(message) for message in messages] for name, messages in form.errors.items()}

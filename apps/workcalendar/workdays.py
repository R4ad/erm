"""روز کاری: هر روز جز پنجشنبه، جمعه و تعطیلات ثبت‌شده."""

from calendar import FRIDAY, THURSDAY
from datetime import timedelta

import jdatetime

from .models import Holiday

WEEKEND = {THURSDAY, FRIDAY}


def holidays_after(day):
    """تاریخ همه‌ی تعطیلات ثبت‌شده بعد از day. هر سال حدود ۲۵ ردیف است، پس یک پرس‌وجو بس است."""
    return set(Holiday.objects.filter(date__gt=day).values_list("date", flat=True))


def is_working_day(day, holidays=None):
    if day.weekday() in WEEKEND:
        return False
    if holidays is None:
        return not Holiday.objects.filter(date=day).exists()
    return day not in holidays


def add_working_days(start, days, holidays=None):
    """روز کاری days ام بعد از start. خود start شمرده نمی‌شود."""
    if holidays is None:
        holidays = holidays_after(start)
    day = start
    while days > 0:
        day += timedelta(days=1)
        if is_working_day(day, holidays):
            days -= 1
    return day


def working_days_between(start, end, holidays=None):
    """تعداد روزهای کاری بعد از start تا end، با خود end. اگر end پیش از start باشد صفر است."""
    if holidays is None:
        holidays = holidays_after(start)
    return sum(is_working_day(start + timedelta(days=offset), holidays) for offset in range(1, (end - start).days + 1))


def add_months(start, months):
    """ماه تقویم شمسی (بخش ۱۹): ۱۰ مهر و ۶ ماه یعنی ۱۰ فروردین. اگر ماه مقصد آن روز را نداشته باشد، آخرین روزش."""
    day = jdatetime.date.fromgregorian(date=start)
    index = day.month - 1 + months
    year, month = day.year + index // 12, index % 12 + 1
    last = 31 if month <= 6 else 30 if month <= 11 else (30 if jdatetime.date(year, 1, 1).isleap() else 29)
    return jdatetime.date(year, month, min(day.day, last)).togregorian()


def add_period(start, value, unit, holidays=None):
    """تاریخ value واحد بعد از start، با واحدهای نسخه‌ی روش: ساعت، روز تقویمی، روز کاری، هفته و ماه شمسی. ساعت روی
    تاریخ به روز کامل گرد می‌شود؛ مهلت ساعتی دقیق از خود زمان حساب می‌شود."""
    if unit == "hour":
        return start + timedelta(days=-(-value // 24))
    if unit == "day":
        return start + timedelta(days=value)
    if unit == "working_day":
        return add_working_days(start, value, holidays)
    if unit == "week":
        return start + timedelta(weeks=value)
    if unit == "month":
        return add_months(start, value)
    raise ValueError(f"واحد ناشناخته: {unit}")

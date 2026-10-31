"""روز کاری: هر روز جز پنجشنبه، جمعه و تعطیلات ثبت‌شده."""

from calendar import FRIDAY, THURSDAY
from datetime import timedelta

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
    return sum(
        is_working_day(start + timedelta(days=offset), holidays)
        for offset in range(1, (end - start).days + 1)
    )
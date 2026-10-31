import jdatetime
from django.utils import timezone

# به ترتیب weekday() پایتون، که از دوشنبه (0) شروع می‌شود
WEEKDAY_NAMES = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"]


def to_jalali(day):
    """تاریخ میلادی را به متن شمسی مثل 1405/08/09 تبدیل می‌کند."""
    return jdatetime.date.fromgregorian(date=day).strftime("%Y/%m/%d")


def parse_jalali(text):
    """متن شمسی مثل ۱۴۰۵/۸/۹ را به تاریخ میلادی تبدیل می‌کند. برای متن نادرست ValueError می‌دهد."""
    parts = text.replace("-", "/").split("/")
    if len(parts) != 3:
        raise ValueError(text)
    year, month, day = (int(part) for part in parts)  # int رقم فارسی و فاصله‌ی دو طرف را هم می‌پذیرد
    if not 1300 <= year <= 1500:
        raise ValueError(text)  # سال دورقمی، مثل 05/08/09، پذیرفته نمی‌شود
    return jdatetime.date(year, month, day).togregorian()


def jalali_year(day):
    return jdatetime.date.fromgregorian(date=day).year


def jalali_year_range(year):
    """روز اول سال شمسی و روز اول سال بعدش، هر دو میلادی."""
    return jdatetime.date(year, 1, 1).togregorian(), jdatetime.date(year + 1, 1, 1).togregorian()


def to_jalali_datetime(moment):
    """زمان (aware) را به وقت تهران و متن شمسی مثل 1405/08/09 14:30 تبدیل می‌کند."""
    return jdatetime.datetime.fromgregorian(datetime=timezone.localtime(moment)).strftime("%Y/%m/%d %H:%M")

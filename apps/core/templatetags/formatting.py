from django import template

register = template.Library()


@register.filter
def thousands(value):
    """عدد را با جداکننده‌ی هزارگان نشان می‌دهد: 12000000000 → 12,000,000,000. مقدار خالی، خالی می‌ماند.
    floatformat این کار را برای زبان فارسی نمی‌کند، چون تنظیمات فارسی Django رقم‌ها را گروه نمی‌کند."""
    if value is None or value == "":
        return ""
    return f"{value:,}"


@register.filter
def minutes(value):
    """مدت به دقیقه را خوانا می‌کند: 90 → «1 ساعت و 30 دقیقه»، 1500 → «1 روز و 1 ساعت».
    روز این‌جا ۲۴ ساعت است، نه روز کاری."""
    if value is None or value == "":
        return ""
    days, rest = divmod(int(value), 24 * 60)
    hours, mins = divmod(rest, 60)
    parts = [f"{count} {unit}" for count, unit in [(days, "روز"), (hours, "ساعت"), (mins, "دقیقه")] if count]
    return " و ".join(parts) or "0 دقیقه"

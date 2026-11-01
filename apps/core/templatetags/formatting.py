from django import template

register = template.Library()


@register.filter
def thousands(value):
    """عدد را با جداکننده‌ی هزارگان نشان می‌دهد: 12000000000 → 12,000,000,000. مقدار خالی، خالی می‌ماند.
    floatformat این کار را برای زبان فارسی نمی‌کند، چون تنظیمات فارسی Django رقم‌ها را گروه نمی‌کند."""
    if value is None or value == "":
        return ""
    return f"{value:,}"

from django import template
from django.utils.html import escape, format_html
from django.utils.safestring import mark_safe

register = template.Library()


@register.filter
def paragraphs(text):
    """متن بلند را بند به بند نشان می‌دهد. بندها با یک خط خالی از هم جدا می‌شوند و بندی که با «## » شروع شود
    عنوان است. همه‌چیز escape می‌شود، پس متنی که در پنل مدیریت نوشته شده نمی‌تواند HTML یا اسکریپت به صفحه بیاورد."""
    html = []
    for block in (text or "").split("\n\n"):
        block = block.strip()
        if not block:
            continue
        if block.startswith("## "):
            html.append(format_html('<h4 class="h6 mt-3">{}</h4>', block[3:]))
        else:
            html.append(format_html("<p>{}</p>", mark_safe(escape(block).replace("\n", "<br>"))))
    return mark_safe("".join(html))


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

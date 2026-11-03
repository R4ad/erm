from django import template

from apps.controls.permissions import can_view_soa as _can_view_soa

register = template.Library()


@register.filter
def can_view_soa(user):
    """برای منوی اصلی: پیوند بیانیه‌ی کاربردپذیری فقط به کسی که آن را می‌بیند نشان داده می‌شود."""
    return user.is_authenticated and _can_view_soa(user)

from apps.accounts.roles import Role
from apps.catalog.permissions import visibility_condition

from .models import Risk

# این نقش‌ها وضعیت خانه‌های جدول پوشش را ثبت و ویرایش می‌کنند (س۳۷). مدیر سامانه همیشه می‌تواند.
COVERAGE_EDIT_ROLES = [Role.GRC_MEMBER, Role.SECURITY_WORKGROUP]
# این نقش‌ها دسته‌های ریسک را ثبت و ویرایش می‌کنند (س۴۱). مدیر سامانه همیشه می‌تواند.
CATEGORY_EDIT_ROLES = [Role.GRC_MEMBER]
# این نقش‌ها سناریوهای مرجع، ریسک‌ها و پیوندهایشان را ثبت و ویرایش می‌کنند. مدیر سامانه همیشه می‌تواند.
# مدیر واحد ریسک را فقط از راه پرسشنامه پیشنهاد می‌دهد (قدم ۱۲).
REGISTER_EDIT_ROLES = [Role.GRC_MEMBER]


def can_edit_coverage(user):
    return user.is_system_admin or user.has_role(*COVERAGE_EDIT_ROLES)


def can_edit_categories(user):
    return user.is_system_admin or user.has_role(*CATEGORY_EDIT_ROLES)


def can_edit_register(user):
    return user.is_system_admin or user.has_role(*REGISTER_EDIT_ROLES)


def visible_risks(user):
    """ریسک‌هایی که این کاربر می‌بیند، با همان قاعده‌ی خدمت روی واحد و مالک خود ریسک: نقش‌های «همه را
    می‌بیند»، مدیر واحد در واحدهای تحت مدیریتش، ممیز در دامنه‌اش، و مالک ریسک‌های خودش."""
    condition = visibility_condition(user)
    risks = Risk.objects.all()
    return risks if condition is None else risks.filter(condition)

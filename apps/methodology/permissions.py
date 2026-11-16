from apps.accounts.roles import Role

from .models import MethodVersion

# این نقش‌ها پیش‌نویس‌ها و نسخه‌های تصویب‌شده‌ای را هم که هنوز فعال نشده‌اند می‌بینند (س۹ قدم ۸).
# مدیر سامانه همیشه می‌بیند. نسخه‌ی فعال و نسخه‌های بایگانی را همه‌ی کاربران می‌بینند.
SEE_DRAFTS_ROLES = [Role.GRC_MEMBER, Role.SECURITY_WORKGROUP, Role.SECURITY_COMMITTEE, Role.VIEWER]


# متولی روش: پیش‌نویس می‌سازد، پارامترهایش را عوض می‌کند و برای تصویب می‌فرستد (فیگما ۱۷).
MANAGE_ROLES = [Role.GRC_MEMBER]


def can_manage_method(user):
    return user.is_system_admin or user.has_role(*MANAGE_ROLES)


def can_see_drafts(user):
    return user.is_system_admin or user.has_role(*SEE_DRAFTS_ROLES)


def visible_versions(user):
    """نسخه‌هایی که این کاربر می‌بیند. هر صفحه‌ای که نسخه‌ی روش نشان می‌دهد از همین‌جا شروع می‌کند."""
    versions = MethodVersion.objects.all()
    if can_see_drafts(user):
        return versions
    return versions.filter(status__in=[MethodVersion.Status.ACTIVE, MethodVersion.Status.ARCHIVED])

from django.db.models import Q

from apps.accounts.roles import Role

from .models import Service

# این نقش‌ها همه‌ی خدمت‌ها را می‌بینند. مدیر سامانه همیشه همه را می‌بیند.
SEE_ALL_ROLES = [Role.GRC_MEMBER, Role.SECURITY_WORKGROUP, Role.SECURITY_COMMITTEE]
# این نقش‌ها بانک و خدمت ثبت و ویرایش می‌کنند. مدیر سامانه همیشه می‌تواند.
EDIT_ROLES = [Role.GRC_MEMBER]


def can_edit_catalog(user):
    return user.is_system_admin or user.has_role(*EDIT_ROLES)


def visible_services(user):
    """خدمت‌هایی که این کاربر می‌بیند. هر صفحه‌ای که خدمت نشان می‌دهد از همین‌جا شروع می‌کند."""
    services = Service.objects.all()
    if user.is_system_admin or user.has_role(*SEE_ALL_ROLES):
        return services
    condition = Q(owner=user)  # مالک خدمت، خدمت خودش را می‌بیند
    if user.has_role(Role.UNIT_MANAGER):
        condition |= Q(org_unit__in=user.managed_unit_ids())  # واحدهای تحت مدیریت و زیرمجموعه‌هایشان
    if user.has_role(Role.VIEWER):
        scope = user.scope_unit_ids()
        if scope is None:
            return services  # ممیزی که دامنه‌ی مشاهده ندارد همه را می‌بیند
        condition |= Q(org_unit__in=scope)
    return services.filter(condition)

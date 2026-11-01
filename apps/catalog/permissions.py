from django.db.models import Q

from apps.accounts.roles import Role

from .models import Asset, Service

# این نقش‌ها همه‌ی خدمت‌ها و دارایی‌ها را می‌بینند. مدیر سامانه همیشه همه را می‌بیند.
SEE_ALL_ROLES = [Role.GRC_MEMBER, Role.SECURITY_WORKGROUP, Role.SECURITY_COMMITTEE]
# این نقش‌ها اطلاعات این اپ را ثبت و ویرایش می‌کنند. مدیر سامانه همیشه می‌تواند.
EDIT_ROLES = [Role.GRC_MEMBER]


def can_edit_catalog(user):
    return user.is_system_admin or user.has_role(*EDIT_ROLES)


def visibility_condition(user):
    """شرط دیدن رکوردی که واحد مالک و مالک دارد، یعنی خدمت و دارایی. None یعنی کاربر همه را می‌بیند."""
    if user.is_system_admin or user.has_role(*SEE_ALL_ROLES):
        return None
    condition = Q(owner=user)  # مالک، رکورد خودش را می‌بیند
    if user.has_role(Role.UNIT_MANAGER):
        condition |= Q(org_unit__in=user.managed_unit_ids())  # واحدهای تحت مدیریت و زیرمجموعه‌هایشان
    if user.has_role(Role.VIEWER):
        scope = user.scope_unit_ids()
        if scope is None:
            return None  # ممیزی که دامنه‌ی مشاهده ندارد همه را می‌بیند
        condition |= Q(org_unit__in=scope)
    return condition


def visible_services(user):
    """خدمت‌هایی که این کاربر می‌بیند. هر صفحه‌ای که خدمت نشان می‌دهد از همین‌جا شروع می‌کند."""
    condition = visibility_condition(user)
    services = Service.objects.all()
    return services if condition is None else services.filter(condition)


def visible_assets(user):
    """دارایی‌هایی که این کاربر می‌بیند، با همان قاعده‌ی خدمت."""
    condition = visibility_condition(user)
    assets = Asset.objects.all()
    return assets if condition is None else assets.filter(condition)

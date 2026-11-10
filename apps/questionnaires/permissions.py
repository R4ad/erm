from django.db.models import Q

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.catalog.permissions import SEE_ALL_ROLES
from apps.organization.models import OrgUnit

from .models import Response

# این نقش‌ها پرسشنامه‌ها را تعریف می‌کنند، پاسخ‌ها را بررسی می‌کنند و جواب‌های مصاحبه را به نام مدیر واحد ثبت
# می‌کنند. مدیر سامانه همیشه می‌تواند.
MANAGE_ROLES = [Role.GRC_MEMBER]


def can_manage_questionnaires(user):
    return user.is_system_admin or user.has_role(*MANAGE_ROLES)


def respondents():
    """کسانی که به پرسشنامه جواب می‌دهند: مدیران واحد فعالی که دست‌کم یک واحد تحت مدیریت دارند (س۴۶)."""
    return (
        User.objects.filter(is_active=True, groups__name=Role.UNIT_MANAGER, managed_units__isnull=False)
        .distinct()
        .order_by("last_name", "first_name", "username")
    )


def answerable_units(user):
    """واحدهایی که این کاربر برایشان پاسخ تازه می‌سازد: عضو GRC برای ثبت مصاحبه همه‌ی واحدهای فعال، مدیر واحد
    واحدهای تحت مدیریتش و زیرمجموعه‌هایشان."""
    units = OrgUnit.objects.filter(is_active=True)
    if can_manage_questionnaires(user):
        return units
    if user.has_role(Role.UNIT_MANAGER):
        return units.filter(pk__in=user.managed_unit_ids())
    return units.none()


def visible_responses(user):
    """پاسخ‌هایی که این کاربر می‌بیند: نقش‌های «همه را می‌بیند» همه را، پاسخ‌دهنده و ثبت‌کننده پاسخ خودشان را،
    مدیر واحد پاسخ‌های واحدهای تحت مدیریتش را، و ممیز پاسخ‌های دامنه‌اش را."""
    responses = Response.objects.all()
    if user.is_system_admin or user.has_role(*SEE_ALL_ROLES):
        return responses
    condition = Q(respondent=user) | Q(recorded_by=user)
    if user.has_role(Role.UNIT_MANAGER):
        condition |= Q(org_unit__in=user.managed_unit_ids())
    if user.has_role(Role.VIEWER):
        scope = user.scope_unit_ids()
        if scope is None:
            return responses
        condition |= Q(org_unit__in=scope)
    return responses.filter(condition)


def can_edit_response(user, response):
    """پاسخ پیش‌نویس یا برگشت‌خورده را پاسخ‌دهنده ویرایش می‌کند، و در مصاحبه همان عضو GRC که ثبتش کرده."""
    return response.is_editable and user.pk in (response.respondent_id, response.recorded_by_id)

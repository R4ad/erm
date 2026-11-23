from django.db.models import Q

from apps.accounts.roles import Role
from apps.catalog.permissions import SEE_ALL_ROLES

from .models import Response

# این نقش‌ها پاسخنامه‌ها را بررسی می‌کنند و ریسک‌های پیشنهادی را تأیید یا رد می‌کنند. مدیر سامانه همیشه می‌تواند.
MANAGE_ROLES = [Role.GRC_MEMBER]


def can_manage_questionnaires(user):
    return user.is_system_admin or user.has_role(*MANAGE_ROLES)


def visible_responses(user):
    """پاسخنامه‌هایی که این کاربر می‌بیند: نقش‌های «همه را می‌بیند» همه را، پاسخ‌دهنده پاسخنامه‌ی خودش را، مدیر واحد
    پاسخنامه‌های واحدهای تحت مدیریتش را، و ممیز پاسخنامه‌های دامنه‌اش را."""
    responses = Response.objects.all()
    if user.is_system_admin or user.has_role(*SEE_ALL_ROLES):
        return responses
    condition = Q(respondent=user)
    if user.has_role(Role.UNIT_MANAGER):
        condition |= Q(org_unit__in=user.managed_unit_ids())
    if user.has_role(Role.VIEWER):
        scope = user.scope_unit_ids()
        if scope is None:
            return responses
        condition |= Q(org_unit__in=scope)
    return responses.filter(condition)


def can_edit_response(user, response):
    """پاسخنامه‌ی پیش‌نویس یا بازگشتی را فقط پاسخ‌دهنده‌اش ویرایش می‌کند."""
    return response.is_editable and user.pk == response.respondent_id

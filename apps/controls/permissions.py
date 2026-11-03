from django.db.models import Q

from apps.accounts.roles import Role
from apps.catalog.permissions import SEE_ALL_ROLES
from apps.risks.permissions import visible_risks

from .models import Control

# این نقش‌ها کنترل‌ها و بیانیه‌ی کاربردپذیری را ثبت و ویرایش می‌کنند (جواب س۵۴). مدیر سامانه همیشه می‌تواند.
CONTROL_EDIT_ROLES = [Role.GRC_MEMBER]
# این نقش‌ها همه‌ی کنترل‌ها و بیانیه‌ی کاربردپذیری را می‌بینند. ممیز هم، چون کنترل به واحد خاصی بسته نیست.
CONTROL_SEE_ALL_ROLES = [*SEE_ALL_ROLES, Role.VIEWER]


def can_edit_controls(user):
    return user.is_system_admin or user.has_role(*CONTROL_EDIT_ROLES)


def can_view_soa(user):
    return user.is_system_admin or user.has_role(*CONTROL_SEE_ALL_ROLES)


def visible_controls(user):
    """کنترل‌هایی که این کاربر می‌بیند: نقش‌های «همه را می‌بیند» و ممیز همه را؛ بقیه کنترل‌هایی را که مسئولشان
    هستند و کنترل‌هایی را که ریسک‌های قابل‌دیدنشان به آن‌ها تکیه دارند."""
    controls = Control.objects.all()
    if can_view_soa(user):
        return controls
    risks = visible_risks(user)
    # زیرکوئری pk به جای join، تا کنترلی که به چند ریسک وصل است دو بار نیاید.
    linked = Control.objects.filter(risks__in=risks).values("pk")
    return controls.filter(Q(owner=user) | Q(pk__in=linked))


def can_attach_to_control(user, control):
    """شاهد آزمون و پیوست کنترل را عضو GRC و مدیر سامانه روی همه و مسئول کنترل روی کنترل خودش می‌گذارد (س۵۱)."""
    return can_edit_controls(user) or control.owner_id == user.pk

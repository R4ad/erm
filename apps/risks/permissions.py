from django.db.models import Q

from apps.accounts.roles import Role
from apps.catalog.permissions import SEE_ALL_ROLES, visibility_condition

from .models import Evidence, Risk

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


def can_add_evidence(user, risk):
    """شاهد و پیوست ریسک را عضو GRC و مدیر سامانه روی همه‌ی ریسک‌ها و مالک ریسک روی ریسک خودش اضافه می‌کند (س۵۱).
    ریسک ردشده یا بسته‌شده فقط سابقه است و شاهد و پیوست تازه نمی‌گیرد."""
    return risk.is_active and (
        can_edit_register(user) or risk.owner_id == user.pk
        or (user.has_role(Role.SECURITY_WORKGROUP) and risk.status == Risk.Status.ASSESSMENT)
    )


def can_edit_evidence(user, evidence):
    """شاهد را عضو GRC، مدیر سامانه و مالک خود شاهد ویرایش می‌کنند و به آن فایل پیوست می‌کنند."""
    return can_edit_register(user) or evidence.owner_id == user.pk


def visible_evidence(user):
    """شواهدی که این کاربر می‌بیند (س۱۷). عضو GRC و مدیر سامانه همه را؛ مالک شاهد شاهد خودش را؛ شاهد «عادی» را
    هر کس که یکی از ریسک‌های مرتبطش را می‌بیند، و کارگروه و کمیته‌ی امنیت همه‌ی شواهد عادی را؛ شاهد «محرمانه» را
    مالک یکی از ریسک‌های مرتبطش، و ممیز در دامنه‌ی ریسک‌هایی که می‌بیند."""
    evidence = Evidence.objects.all()
    if can_edit_register(user):
        return evidence
    normal = Q(access_class=Evidence.AccessClass.NORMAL)
    condition = Q(owner=user) | Q(risks__owner=user)
    if user.has_role(*SEE_ALL_ROLES):
        condition |= normal
    else:
        condition |= normal & Q(risks__in=visible_risks(user))
    if user.has_role(Role.VIEWER):
        if user.scope_unit_ids() is None:
            return evidence  # ممیزی که دامنه‌ی مشاهده ندارد همه را می‌بیند (س۹)
        condition |= Q(risks__in=visible_risks(user))
    # زیرپرس‌وجو به جای distinct: شاهدی که به چند ریسک قابل‌دیدن وصل است یک بار می‌آید.
    return evidence.filter(pk__in=Evidence.objects.filter(condition).values("pk"))

from apps.accounts.roles import Role
from apps.risks.permissions import visible_risks

from .models import Assessment

# ثبت و تکمیل ارزیابی برای کارگروه، عضو GRC و مدیر سامانه در دسترس است.
ASSESSMENT_EDIT_ROLES = [Role.GRC_MEMBER, Role.SECURITY_WORKGROUP]


def can_start_submitted_assessment(user):
    return user.is_system_admin or user.has_role(Role.SECURITY_WORKGROUP)


def can_record_assessments(user):
    return user.is_system_admin or user.has_role(*ASSESSMENT_EDIT_ROLES)


def visible_assessments(user):
    """ارزیابی را هر کس که ریسکش را می‌بیند می‌بیند."""
    return Assessment.objects.filter(risk__in=visible_risks(user))


def can_edit_assessment(user, assessment):
    """فقط پیش‌نویس ارزیابی ریسک فعال ویرایش می‌شود."""
    return can_record_assessments(user) and assessment.is_draft and assessment.risk.is_active

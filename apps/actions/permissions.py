from django.db.models import Q

from apps.accounts.roles import Role
from apps.risks.models import Risk
from apps.risks.permissions import visible_risks

from .models import TreatmentAction, TreatmentPlan

# طرح مواجهه و اقدام‌هایش را عضو GRC می‌نویسد و مالک ریسک طرح را تأیید می‌کند (بخش ۲۰ و جواب س۳۶). مدیر سامانه همیشه
# می‌تواند بنویسد، ولی جای مالک ریسک تأیید نمی‌کند.
PLAN_EDIT_ROLES = [Role.GRC_MEMBER]
# اقدام فقط وقتی اجرا می‌شود که ریسک «در اجرای درمان» یا «در بازبینی» است (ردیف ۷ و ۸ جدول س۱۵).
EXECUTION_STATUSES = [Risk.Status.TREATMENT, Risk.Status.REVIEW]


def can_edit_plans(user):
    return user.is_system_admin or user.has_role(*PLAN_EDIT_ROLES)


def visible_plans(user):
    """طرح را هر کس که ریسکش را می‌بیند می‌بیند."""
    return TreatmentPlan.objects.filter(risk__in=visible_risks(user))


def visible_actions(user):
    """اقدام را هر کس که ریسکش را می‌بیند می‌بیند، و مالک، مجری و تأییدکننده‌ی خود اقدام، حتی اگر ریسک را نبینند."""
    people = Q(owner=user) | Q(assignee=user) | Q(verifier=user)
    return TreatmentAction.objects.filter(Q(plan__risk__in=visible_risks(user)) | people)


def can_edit_plan(user, plan):
    """متن طرح تا پیش از تأیید مالک و فقط وقتی ریسک «برنامه‌ی درمان» است ویرایش می‌شود."""
    return (
        can_edit_plans(user)
        and not plan.is_owner_approved
        and plan.risk.is_active
        and plan.risk.status == Risk.Status.TREATMENT_PLAN
    )


def can_add_action(user, plan):
    """اقدام تازه هم پیش از تأیید طرح اضافه می‌شود و هم بعدش؛ اقدام بعد از تأیید هم تأیید مالک می‌خواهد."""
    return (
        can_edit_plans(user)
        and plan.risk.is_active
        and plan.risk.status in [Risk.Status.TREATMENT_PLAN, *EXECUTION_STATUSES]
    )


def can_edit_action(user, action):
    """فقط اقدامی که هنوز مالک ریسک تأییدش نکرده ویرایش می‌شود؛ بعد از آن فقط گزارش پیشرفت می‌گیرد."""
    return action.status == TreatmentAction.Status.PLANNED and can_add_action(user, action.plan)


def can_approve_plan(user, plan):
    """طرح را خود مالک ریسک تأیید می‌کند (جواب س۳۶)؛ مجوز مقام بالاتر با پذیرش و تأییدهای قدم ۲۰ می‌آید."""
    return plan.risk.is_active and plan.risk.owner_id == user.pk


def is_action_worker(user, action):
    """مالک و مجری اقدام، و عضو GRC و مدیر سامانه که پیشرفت را به جای آن‌ها ثبت می‌کنند."""
    return can_edit_plans(user) or user.pk in (action.owner_id, action.assignee_id)


def can_attach_to_plan(user, plan):
    """پیوست طرح را عضو GRC، مدیر سامانه و مالک ریسک می‌گذارند (جواب س۵۱)."""
    return can_edit_plans(user) or plan.risk.owner_id == user.pk


def can_attach_to_action(user, action):
    """پیوست اقدام را مالک، مجری و تأییدکننده‌ی آن، و عضو GRC و مدیر سامانه می‌گذارند (جواب س۵۱)."""
    return can_edit_plans(user) or user.pk in action.people_ids

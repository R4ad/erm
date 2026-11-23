"""بازسنجی و بستن (بخش ۲۰ سند v5): بعد از اقدام‌ها، ارزیابی جاری تازه با هدف مقایسه می‌شود و تصمیم پذیرش یا ادامه‌ی
اصلاح ثبت می‌شود. ارزیابی تازه همان دور تازه‌ی چرخه‌ی عمر است (ردیف ۹ و ۶ جدول س۱۵) و بازسنجی پیش از طرح دور تازه
ثبت می‌شود."""

from django.db import transaction
from django.urls import reverse
from django.utils import timezone

from apps.assessments.comparison import target_met
from apps.assessments.services import decision_assessment
from apps.risks.models import Risk

from .models import Reassessment
from .permissions import can_edit_plans
from .services import PlanError, pending_reassessment, plan_required

DECISION = Reassessment.Decision
# ارزیابی جاری تازه در «در ارزیابی» تأیید می‌شود و طرح دور تازه در «برنامه‌ی درمان» نوشته می‌شود.
REASSESSMENT_STATUSES = [Risk.Status.ASSESSMENT, Risk.Status.TREATMENT_PLAN]


def reassessment_problems(plan):
    risk = plan.risk
    problems = []
    if not risk.is_active or risk.status not in REASSESSMENT_STATUSES:
        problems.append("بازسنجی وقتی ثبت می‌شود که ریسک «در ارزیابی» یا «برنامه‌ی درمان» است.")
    if Reassessment.objects.filter(plan=plan).exists():
        problems.append("این طرح بازسنجی شده است.")
    elif pending_reassessment(risk) != plan:
        problems.append(
            "بازسنجی یک ارزیابی جاری تأییدشده‌ی تازه‌تر از ارزیابی مبنای طرح می‌خواهد، و فقط برای آخرین طرح دور قبل "
            "ثبت می‌شود."
        )
    return problems


def decision_problems(plan, decision):
    base = decision_assessment(plan.risk)
    if base is None or decision == DECISION.CONTINUE:
        return []
    level = base.decision_level
    problems = []
    if plan_required(level):
        problems.append(
            f"ارزیابی تازه هنوز «{level}» است؛ برای این سطح طرح مواجهه الزامی است و پذیرش فقط موقت است، پس اصلاح "
            "ادامه دارد (بخش ۱۹)."
        )
    if base.binding_prohibition:
        problems.append("ارزیابی تازه نشان «منع الزام‌آور» دارد و ریسک خارج از اختیار پذیرش است.")
    if decision == DECISION.MONITOR:
        target = plan.target_assessment
        if target is None or not target.is_approved or not target_met(base, target):
            problems.append(
                "پایش فعال وقتی است که ارزیابی تازه به هدف طرح رسیده باشد؛ وگرنه اصلاح ادامه دارد یا پذیرش لازم است."
            )
    return problems


def can_record(user, plan):
    """بازسنجی را عضو GRC یا خود مالک ریسک ثبت می‌کند؛ تصمیم پس از اقدام با مالک ریسک است (فیگما ۲۵)."""
    return can_edit_plans(user) or (plan.risk.owner_id is not None and user.pk == plan.risk.owner_id)


def ask_owner(plan, user):
    """«ارسال برای تصمیم مالک»: اعلان روزانه به مالک ریسک برای ثبت تصمیم پس از اقدام؛ True اگر امروز تازه رفت."""
    from .models import MonitoringNotice

    risk = plan.risk
    if not can_edit_plans(user):
        raise PlanError(["درخواست تصمیم را عضو GRC می‌فرستد."])
    if not risk.owner_id or risk.owner_id == user.pk:
        raise PlanError(["ریسک مالک دیگری ندارد که تصمیم را از او بخواهید."])
    problems = reassessment_problems(plan)
    if problems:
        raise PlanError(problems)
    _, created = MonitoringNotice.objects.get_or_create(
        recipient=risk.owner,
        event_key=f"reassess-ask:{plan.pk}:{timezone.localdate().isoformat()}",
        defaults={
            "risk": risk,
            "message": f"ارزیابی پس از اقدام ریسک {risk.code} ثبت شد؛ تصمیم گام بعدی (پایش، ادامه‌ی اصلاح یا پذیرش) "
            "با شماست.",
            "href": reverse("actions:reassessment_create", args=[plan.pk]),
        },
    )
    return created


def create_corrective(plan, user, controls):
    """«ایجاد اقدام اصلاحی» برای کنترل‌هایی که شکافشان هدف را نگه داشته: یک کار بازبینی برای مسئول کنترل با مهلت
    محرک شکست کنترل، که در کارهای او می‌آید. ارزیابی اثربخشی همین حالا E پایین را دارد، پس تعلیق دوباره لازم نیست."""
    from apps.methodology.models import MethodParameter
    from apps.methodology.services import parameter
    from apps.workcalendar.workdays import add_period

    from .models import RiskReview

    risk = plan.risk
    version = plan.assessment.method_version
    days = int(parameter(version, MethodParameter.Key.REASSESS_INCIDENT))
    created = []
    for control in controls:
        responsible = control.owner if control.owner_id and control.owner.is_active else risk.owner
        review, made = RiskReview.objects.get_or_create(
            event_key=f"corrective:{plan.pk}:{control.pk}",
            defaults={
                "risk": risk,
                "trigger": RiskReview.Trigger.CONTROL,
                "reason": f"اقدام اصلاحی برای {control.code} ({control.title}) پس از بازسنجی طرح؛ شکاف این کنترل "
                "هدف طرح را نگه داشت.",
                "due": add_period(timezone.localdate(), days, "working_day"),
                "responsible": responsible,
                "created_by": user,
            },
        )
        if made:
            created.append(review)
    return created


@transaction.atomic
def record_reassessment(plan, reassessment, user):
    """reassessment از فرم می‌آید. ارزیابی تازه، تحقق هدف و تغییر روش را سامانه تعیین می‌کند."""
    if not can_record(user, plan):
        raise PlanError(["بازسنجی را عضو GRC یا مالک ریسک ثبت می‌کند."])
    problems = reassessment_problems(plan) + decision_problems(plan, reassessment.decision)
    if reassessment.performed_on and reassessment.performed_on > timezone.localdate():
        problems.append("تاریخ بازسنجی بعد از امروز نیست.")
    if problems:
        raise PlanError(problems)
    base = decision_assessment(plan.risk)
    target = plan.target_assessment
    reassessment.plan = plan
    reassessment.assessment = base
    reassessment.target_met = target_met(base, target) if target and target.is_approved else None
    reassessment.method_changed = base.method_version_id != plan.assessment.method_version_id
    reassessment.created_by = user
    reassessment._history_user = user
    reassessment.save()
    return reassessment


def comparison_assessments(plan, reassessment=None):
    """ستون‌های مقایسه: ارزیابی مبنای طرح، ارزیابی تازه و ارزیابی هدف."""
    base = reassessment.assessment if reassessment else decision_assessment(plan.risk)
    items = [plan.assessment]
    if base and base != plan.assessment:
        items.append(base)
    if plan.target_assessment and plan.target_assessment not in items:
        items.append(plan.target_assessment)
    return items

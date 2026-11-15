"""طرح مواجهه و اقدام‌ها (بخش ۱۹ و ۲۰ سند v5): مهلت طرح از سطح تصمیم، قاعده‌های تأیید طرح به دست مالک ریسک، و
وضعیت‌های اقدام با گزارش پیشرفت."""

from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.assessments.services import decision_assessment
from apps.core.jalali import to_jalali
from apps.methodology.models import PeriodUnit, RiskLevel
from apps.risks.models import Risk
from apps.workcalendar.workdays import add_period

from .models import ActionUpdate, MonitoringNotice, Reassessment, RiskAcceptance, TreatmentAction, TreatmentPlan
from .permissions import EXECUTION_STATUSES, can_approve_plan, can_edit_plans, is_action_worker, is_current_plan

ST = TreatmentAction.Status
OPTION = TreatmentPlan.Option


class PlanError(Exception):
    def __init__(self, problems):
        super().__init__("؛ ".join(problems))
        self.problems = problems


def plan_required(level):
    """طرح مواجهه برای سطح‌هایی الزامی است که مجوز کمیته‌ی امنیت می‌خواهند: بالا و بحرانی در جدول بخش ۱۹ (جواب
    س۶۳). برای پایین و متوسط هر چهار گزینه، از جمله پذیرش، ممکن است."""
    return level.co_approver == RiskLevel.CoApprover.SECURITY_COMMITTEE


def plan_period_start(risk):
    """مهلت طرح از وقتی شمرده می‌شود که ریسک «برنامه‌ی درمان» شده است (ردیف ۶ جدول س۱۵)."""
    entered = risk.transitions.filter(to_status=Risk.Status.TREATMENT_PLAN).values_list("created_at", flat=True).first()
    return entered or timezone.now()


def decision_due(risk, level):
    """مهلت طرح یا ثبت تصمیم از جدول بخش ۱۹ نسخه‌ی روش: مثلاً بالا ۱۰ روز کاری و بحرانی ۳ روز کاری."""
    start = timezone.localdate(plan_period_start(risk))
    return add_period(start, level.plan_value, level.plan_unit)


def containment_due(risk, level):
    """مهلت مهار، فقط برای سطحی که آن را دارد (بحرانی: حداکثر ۲۴ ساعت). مهلت ساعتی زمان دقیق است و بقیه تاریخ."""
    if not level.containment_value:
        return None
    start = plan_period_start(risk)
    if level.containment_unit == PeriodUnit.HOUR:
        return start + timedelta(hours=level.containment_value)
    return add_period(timezone.localdate(start), level.containment_value, level.containment_unit)


def current_plan(risk):
    """طرح ارزیابی‌ای که تصمیم مواجهه بر آن است. طرح دور قبل، بعد از ارزیابی دوباره، فقط سابقه است."""
    base = decision_assessment(risk)
    if base is None:
        return None
    return TreatmentPlan.objects.filter(assessment=base).first()


def previous_plan(risk):
    """آخرین طرح دورهای قبل: طرحی که بر ارزیابی تصمیم فعلی نیست."""
    base = decision_assessment(risk)
    plans = risk.treatment_plans.select_related("assessment")
    if base is not None:
        plans = plans.exclude(assessment=base)
    return plans.order_by("-created_at", "-pk").first()


def pending_reassessment(risk):
    """طرح دور قبل که ارزیابی جاری تازه‌ای بعد از آن تأیید شده ولی بازسنجی‌اش هنوز ثبت نشده است (بخش ۲۰)."""
    base = decision_assessment(risk)
    plan = previous_plan(risk)
    if base is None or plan is None or Reassessment.objects.filter(plan=plan).exists():
        return None
    if plan.assessment.approved_at and base.approved_at and plan.assessment.approved_at >= base.approved_at:
        return None
    return plan


def last_reassessment(risk):
    plan = previous_plan(risk)
    return Reassessment.objects.filter(plan=plan).first() if plan else None


def reassessment_option_problem(risk, option):
    """گزینه‌ی طرح دور تازه از تصمیم بازسنجی طرح قبلی پیروی می‌کند: پذیرش یا ادامه‌ی اصلاح."""
    reassessment = last_reassessment(risk)
    if reassessment is None or not option:
        return None
    if reassessment.decision == Reassessment.Decision.ACCEPT and option != OPTION.ACCEPT:
        return "تصمیم بازسنجی طرح قبلی «پذیرش ریسک باقیمانده» بود، پس گزینه‌ی این طرح پذیرش است."
    if reassessment.decision == Reassessment.Decision.CONTINUE and option == OPTION.ACCEPT:
        return "تصمیم بازسنجی طرح قبلی «ادامه‌ی اصلاح» بود، پس گزینه‌ی این طرح پذیرش نیست."
    return None


def plan_creation_problems(risk):
    problems = []
    if risk.status != Risk.Status.TREATMENT_PLAN:
        problems.append("طرح مواجهه وقتی نوشته می‌شود که ریسک «برنامه‌ی درمان» است.")
    base = decision_assessment(risk)
    if base is None:
        problems.append("ارزیابی جاری تأییدشده‌ای با سطح تصمیم برای این دور ارزیابی ریسک نیست.")
    elif TreatmentPlan.objects.filter(assessment=base).exists():
        problems.append(f"برای ارزیابی {base.code} طرح مواجهه ثبت شده است.")
    pending = pending_reassessment(risk)
    if pending is not None:
        problems.append(
            f"طرح قبلی ({pending.get_option_display()}، بر اساس {pending.assessment.code}) هنوز بازسنجی نشده است؛ اول "
            "ارزیابی تازه را با هدف مقایسه و تصمیم پذیرش یا ادامه‌ی اصلاح را ثبت کنید."
        )
    return problems


@transaction.atomic
def create_plan(plan, risk, user):
    """plan از فرم می‌آید و هنوز ذخیره نشده است. ارزیابی مبنا و مهلت طرح را سامانه تعیین می‌کند."""
    problems = plan_creation_problems(risk)
    option_problem = reassessment_option_problem(risk, plan.option)
    if option_problem:
        problems.append(option_problem)
    if problems:
        raise PlanError(problems)
    base = decision_assessment(risk)
    plan.risk = risk
    plan.assessment = base
    plan.decision_due = decision_due(risk, base.decision_level)
    plan.created_by = user
    plan._history_user = user
    plan.save()
    return plan


def plan_problems(plan):
    """قاعده‌هایی که تأیید طرح به دست مالک ریسک را می‌بندند (بخش ۱۹ و ۲۰)."""
    level = plan.level
    problems = []
    if plan_required(level) and plan.option == OPTION.ACCEPT:
        problems.append(
            f"برای ریسک «{level}» طرح مواجهه الزامی است و گزینه‌ی پذیرش کافی نیست؛ پذیرش موقت و استثنایی کنار طرح "
            "ثبت می‌شود (بخش ۱۹)."
        )
    if plan.option in (OPTION.TRANSFER, OPTION.AVOID) and not plan.option_details.strip():
        problems.append(f"شرط‌های گزینه‌ی «{plan.get_option_display()}» نوشته نشده است (بخش ۲۰).")
    if plan.needs_actions and not plan.actions.exists():
        problems.append(f"گزینه‌ی «{plan.get_option_display()}» دست‌کم یک اقدام می‌خواهد.")
    if plan.option == OPTION.ACCEPT and not plan_required(level) and not has_valid_acceptance(plan.assessment):
        problems.append(
            "گزینه‌ی پذیرش یک پذیرش معتبر برای همین ارزیابی می‌خواهد که مالک ریسک و صاحبان اختیار امضا کرده باشند "
            "(بخش ۱۹ و ۲۵)."
        )
    if plan.option == OPTION.REDUCE:
        target = plan.target_assessment
        if target is None:
            problems.append("گزینه‌ی کاهش ارزیابی هدف می‌خواهد: A، B، پنج بُعد پیامد و سطح هدف با فرض‌ها (بخش ۲۰).")
        elif not target.is_approved:
            problems.append(f"ارزیابی هدف {target.code} هنوز کنترل کیفیت و تأیید نشده است.")
    return problems


def has_valid_acceptance(assessment):
    return RiskAcceptance.objects.filter(
        assessment=assessment, status=RiskAcceptance.Status.ACTIVE, end_date__gte=timezone.localdate()
    ).exists()


def pending_actions(plan):
    return plan.actions.filter(status=ST.PLANNED)


@transaction.atomic
def approve_plan(plan, user):
    """مالک ریسک طرح و اقدام‌هایش را تأیید می‌کند و اقدام‌ها «مصوب» می‌شوند. اقدامی که بعد از تأیید اضافه شود با
    تأیید دوباره‌ی مالک مصوب می‌شود."""
    if not can_approve_plan(user, plan):
        raise PlanError(["طرح مواجهه را خود مالک ریسک تأیید می‌کند."])
    problems = plan_problems(plan)
    pending = list(pending_actions(plan))
    if plan.is_owner_approved and not pending:
        problems.append("اقدام تازه‌ای منتظر تأیید نیست.")
    if problems:
        raise PlanError(problems)
    plan.owner_approved_at = timezone.now()
    plan.owner_approved_by = user
    plan._history_user = user
    plan.save()
    for action in pending:
        _set_status(action, ST.APPROVED, user, "تأیید مالک ریسک")


@dataclass(frozen=True)
class Move:
    name: str
    sources: tuple
    target: str
    label: str
    by_verifier: bool = False
    note_required: bool = False
    needs_evidence: bool = False
    style: str = "outline-secondary"


OPEN = (ST.APPROVED, ST.IN_PROGRESS, ST.BLOCKED, ST.READY, ST.FAILED)
MOVES = [
    Move("start", (ST.APPROVED,), ST.IN_PROGRESS, "شروع اجرا", style="primary"),
    Move("block", (ST.IN_PROGRESS,), ST.BLOCKED, "مسدود است", note_required=True, style="outline-danger"),
    Move("resume", (ST.BLOCKED,), ST.IN_PROGRESS, "ادامه‌ی اجرا", style="primary"),
    Move("ready", (ST.IN_PROGRESS,), ST.READY, "آماده‌ی آزمون", needs_evidence=True, style="primary"),
    Move("verify", (ST.READY,), ST.VERIFIED, "تأیید نتیجه", by_verifier=True, note_required=True, style="success"),
    Move("fail", (ST.READY,), ST.FAILED, "ناموفق", by_verifier=True, note_required=True, style="outline-danger"),
    Move("rework", (ST.FAILED,), ST.IN_PROGRESS, "اجرای دوباره", style="primary"),
]
NOTE = Move("note", OPEN, "", "ثبت یادداشت پیشرفت", note_required=True)
BY_NAME = {move.name: move for move in [*MOVES, NOTE]}


def can_move(user, action, move):
    """اجرا فقط وقتی ریسک «در اجرای درمان» یا «در بازبینی» است. نتیجه را فقط تأییدکننده‌ی همان اقدام تأیید یا رد
    می‌کند؛ بقیه‌ی کارها با مالک و مجری اقدام، یا عضو GRC به جای آن‌ها، است."""
    risk = action.plan.risk
    if not risk.is_active or risk.status not in EXECUTION_STATUSES or action.status not in move.sources:
        return False
    if move.by_verifier:
        return user.pk == action.verifier_id
    if move is NOTE:
        return is_action_worker(user, action) or user.pk == action.verifier_id
    return is_action_worker(user, action)


def available_moves(user, action):
    return [move for move in MOVES if can_move(user, action, move)]


@transaction.atomic
def perform_move(action, user, name, note="", evidence=()):
    move = BY_NAME.get(name)
    if move is None or not can_move(user, action, move):
        raise PlanError(["این تغییر وضعیت برای شما یا در وضعیت فعلی اقدام ممکن نیست."])
    note = note.strip()
    problems = []
    if move.note_required and not note:
        problems.append("توضیح را بنویسید." if move is NOTE else f"برای «{move.label}» توضیح لازم است.")
    if move.needs_evidence and not (evidence or action.evidence.exists() or action.attachments.exists()):
        problems.append("برای آماده‌ی آزمون، شاهد اجرا را انتخاب کنید یا گزارش اجرا را پیوست کنید (بخش ۲۰).")
    if problems:
        raise PlanError(problems)
    if evidence:
        action._history_user = user
        action.evidence.add(*evidence)
    _set_status(action, move.target or action.status, user, note)


def _set_status(action, status, user, note):
    ActionUpdate.objects.create(action=action, from_status=action.status, to_status=status, note=note, created_by=user)
    if status != action.status:
        action.status = status
        action._history_user = user
        action.save(update_fields=["status", "updated_at"])


def unverified_dependencies(action):
    return [item for item in action.depends_on.all() if item.status != ST.VERIFIED]


def can_remind_owner(user, plan):
    """یادآوری تأیید طرح به مالک ریسک (فیگما ۰۷): برای ویرایشگر طرح، وقتی طرح یا اقدام تازه‌اش منتظر مالک است."""
    waiting = not plan.is_owner_approved or pending_actions(plan).exists()
    return (
        can_edit_plans(user)
        and plan.risk.owner_id is not None
        and plan.risk.owner_id != user.pk
        and plan.risk.is_active
        and is_current_plan(plan)
        and waiting
    )


def remind_owner(plan, user):
    """اعلان «منتظر تأیید شما» برای مالک ریسک، روزی یک بار؛ True اگر امروز تازه فرستاده شد."""
    _, created = MonitoringNotice.objects.get_or_create(
        recipient=plan.risk.owner,
        event_key=f"plan-remind:{plan.pk}:{timezone.localdate().isoformat()}",
        defaults={
            "risk": plan.risk,
            "message": (
                f"یادآوری {user.get_full_name() or user.username}: طرح مواجهه‌ی ریسک {plan.risk.code} منتظر تأیید "
                f"شماست (مهلت طرح: {to_jalali(plan.decision_due)})."
            ),
            "href": plan.get_absolute_url(),
        },
    )
    return created
